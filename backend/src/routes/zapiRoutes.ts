import { Router, Request, Response } from "express";
import axios from "axios";
import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";

import { logger } from "../utils/logger";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import normalizeBrazilianPhone from "../helpers/normalizeBrazilianPhone";
import {
  handleMessage,
  handleMessageAck,
  ContactPayload,
  MessagePayload,
  MediaPayload,
  WhatsappContextPayload
} from "../handlers/handleWhatsappEvents";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";

const router = Router();
const writeFileAsync = promisify(writeFile);

const makeId = (len = 6): string =>
  Math.random()
    .toString(36)
    .slice(2, 2 + len);

const downloadMedia = async (
  url: string,
  mimetype: string,
  filename?: string
): Promise<MediaPayload | undefined> => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const data = Buffer.from(response.data).toString("base64");
    const ext = mimetype.split("/")[1]?.split(";")[0] || "bin";
    const file = filename || `${makeId()}.${ext}`;
    return { filename: file, mimetype, data };
  } catch (err) {
    logger.error({ msg: "Z-API: failed to download media", url, err });
    return undefined;
  }
};

// Incoming messages webhook — called by Z-API
router.post("/zapi/webhook/:whatsappId", async (req: Request, res: Response) => {
  const whatsappId = parseInt(req.params.whatsappId, 10);
  const payload = req.body;

  // Acknowledge immediately so Z-API doesn't retry
  res.status(200).json({ ok: true });

  try {
    // Diagnostic: log all webhook fields (minus large media) to understand Z-API payload structure
    {
      const { text: _t, image: _i, audio: _a, video: _v, document: _d, sticker: _s, ...meta } = payload;
      logger.info({ msg: "Z-API webhook IN", ...meta });
    }

    // Handle message revoke (client deleted their own message)
    if (payload.isRevoked === true || payload.type === "REVOKE") {
      const revokedId: string = payload.messageId || payload.id || "";
      if (revokedId) {
        const Message = (await import("../models/Message")).default;
        const msg = await Message.findByPk(revokedId);
        if (msg && !msg.fromMe) {
          await msg.update({ isDeleted: true });
          const { getIO } = await import("../libs/socket");
          getIO()
            .to(msg.ticketId.toString())
            .emit("appMessage", { action: "update", message: msg });
        }
      }
      return;
    }

    // MessageStatusCallback: Z-API's actual ACK type (SENT/RECEIVED/READ)
    // payload.ids is an array of WhatsApp native message IDs
    // payload.phone is the recipient in "@lid" format (e.g. "255254251761678@lid")
    if (payload.type === "MessageStatusCallback") {
      const s = String(payload.status || "").toUpperCase();
      const ackMap: Record<string, MessageAck> = {
        SENT: 1,
        RECEIVED: 2,  // delivered to device (✓✓ grey)
        READ: 3       // read by recipient (✓✓ blue)
        // READ_BY_ME = we read an incoming msg — not relevant for tick display
      };
      const ack = ackMap[s];
      if (ack === undefined) return;

      // 1️⃣ Try direct lookup by ids[0] (may or may not match our stored message IDs)
      const directId: string = Array.isArray(payload.ids) ? (payload.ids[0] || "") : "";
      if (directId) {
        await handleMessageAck(directId, ack);
      }

      // 2️⃣ LID-based fallback: phone is "255254251761678@lid"
      // Z-API uses different ID spaces for send-text response vs MessageStatusCallback,
      // so direct lookup almost always fails. Find contact by stored LID and update
      // ALL pending sent messages in their latest ticket.
      const rawPhone: string = payload.phone || "";
      if (rawPhone.endsWith("@lid")) {
        const lid = rawPhone.replace(/@lid$/, "");
        try {
          const { default: Contact } = await import("../models/Contact");
          const { default: Ticket } = await import("../models/Ticket");
          const { default: Message } = await import("../models/Message");
          const { Op } = await import("sequelize");

          const contact = await Contact.findOne({ where: { lid } });
          if (contact) {
            const ticket = await Ticket.findOne({
              where: { contactId: contact.id },
              order: [["updatedAt", "DESC"]]
            });
            if (ticket) {
              // Update ALL pending sent messages — not just the latest
              const pendingMsgs = await Message.findAll({
                where: { ticketId: ticket.id, fromMe: true, ack: { [Op.lt]: ack } }
              });
              for (const msg of pendingMsgs) {
                await handleMessageAck(msg.id, ack);
              }
              if (pendingMsgs.length > 0) {
                logger.info({ msg: "MessageStatusCallback LID: updated messages", lid, ack, count: pendingMsgs.length });
              }
            }
          } else {
            logger.warn({ msg: "MessageStatusCallback LID: contact not found — LID not yet stored for this contact", lid, ack });
          }
        } catch (err) {
          logger.error({ msg: "MessageStatusCallback LID lookup error", err });
        }
      }

      return;
    }

    // Pattern B: ReceivedCallback fromMe:true with status field (fallback)
    if (payload.fromMe && payload.messageId && payload.status) {
      const s = String(payload.status).toUpperCase();
      const ackByStatus: Record<string, MessageAck> = {
        READ: 3, VIEWED: 3,
        DELIVERED: 2, DEVICE: 2,
        SERVER: 1, SENT: 1
      };
      const ack = ackByStatus[s];
      if (ack !== undefined) {
        await handleMessageAck(payload.messageId, ack);
        return;
      }
    }

    // Skip messages sent by our backend API (already saved by SendWhatsAppMessage)
    // Allow messages sent directly from the physical phone (fromApi: false) to sync
    if (payload.fromMe && payload.fromApi !== false) return;
    // Group messages sent from phone have complex routing — skip for now
    if (payload.fromMe && payload.isGroup) return;
    if (payload.type !== "ReceivedCallback") return;

    // Skip WhatsApp Status updates (stories) — phone arrives as "status@broadcast"
    // Skip newsletters and broadcast messages — they should not create tickets
    if (String(payload.phone || "").includes("broadcast")) return;
    if (String(payload.phone || "").includes("newsletter")) return;
    if (payload.isNewsletter === true) return;

    const rawPhone: string = payload.participantPhone || payload.phone || "";
    // Z-API sometimes sends the contact's LID as the phone field (e.g. "165785905430532@lid").
    // In that case the stripped digits are NOT a real phone number — treat them as a LID.
    const phoneIsLid = rawPhone.endsWith("@lid");
    const phone = phoneIsLid
      ? ""
      : normalizeBrazilianPhone(rawPhone.replace(/\D/g, ""));

    const isGroup = Boolean(payload.participantPhone);
    const groupRawPhone: string = isGroup ? payload.phone || "" : "";
    // Group IDs can be alphanumeric (e.g. "120363xxx-ABCdef") — only strip the @g.us suffix
    const groupPhone = groupRawPhone.replace(/@.+$/, "");

    // For group messages, Z-API sometimes returns the group name as senderName when
    // the participant's number isn't in the device address book. Guard against that.
    const senderName: string =
      isGroup && payload.senderName === payload.chatName
        ? (phone || rawPhone.replace(/\D/g, ""))
        : payload.senderName || phone;

    // chatLid is the WhatsApp LID for this contact — stored so MessageStatusCallback
    // can look up the contact when phone arrives in "255...@lid" format.
    // Also use rawPhone as LID source when it was already in @lid format.
    const rawChatLid: string = !isGroup
      ? (payload.chatLid || payload.participantLid || (phoneIsLid ? rawPhone : ""))
      : "";
    const contactLid: string | undefined = rawChatLid
      ? rawChatLid.replace(/@lid$/, "")
      : undefined;

    // Must have at least a phone number or a LID to identify the contact
    if (!phone && !contactLid) return;

    const contactPayload: ContactPayload = {
      name: senderName,
      number: phone,
      lid: contactLid,
      profilePicUrl: payload.senderPhoto || payload.photo || undefined,
      isGroup: false
    };

    // Determine message type and content
    let body = "";
    let msgType: MessageType = "chat";
    let hasMedia = false;
    let mediaUrl = "";
    let mediaMime = "";
    let mediaFilename = "";

    // Button reply (user clicked a button)
    if (payload.buttonReply) {
      body = payload.buttonReply.selectedButtonId || payload.buttonReply.selectedDisplayText || "";
      msgType = "chat";
    } else if (payload.listResponseMessage) {
      // Option-list reply (/send-option-list)
      const lrm = payload.listResponseMessage;
      logger.info({ msg: "Z-API listResponseMessage", content: lrm });
      // Z-API may nest the selected ID under singleSelectReply.selectedRowId
      body = lrm?.singleSelectReply?.selectedRowId
        || lrm?.id
        || lrm?.rowId
        || lrm?.title
        || "";
      msgType = "chat";
    } else if (payload.listReply) {
      // Legacy list reply format
      body = payload.listReply.selectedRowId || "";
      msgType = "chat";
    } else if (payload.text) {
      body = payload.text.message || "";
      msgType = "chat";
    } else if (payload.image) {
      body = payload.image.caption || "";
      msgType = "image";
      hasMedia = true;
      mediaUrl = payload.image.imageUrl || "";
      mediaMime = payload.image.mimeType || "image/jpeg";
    } else if (payload.audio) {
      msgType = payload.audio.ptt ? "ptt" : "audio";
      hasMedia = true;
      mediaUrl = payload.audio.audioUrl || "";
      mediaMime = payload.audio.mimeType || "audio/ogg";
    } else if (payload.video) {
      body = payload.video.caption || "";
      msgType = "video";
      hasMedia = true;
      mediaUrl = payload.video.videoUrl || "";
      mediaMime = payload.video.mimeType || "video/mp4";
    } else if (payload.document) {
      body = payload.document.caption || payload.document.fileName || "";
      msgType = "document";
      hasMedia = true;
      mediaUrl = payload.document.documentUrl || "";
      mediaMime = payload.document.mimeType || "application/octet-stream";
      mediaFilename = payload.document.fileName || "";
    } else if (payload.sticker) {
      msgType = "sticker";
      hasMedia = true;
      mediaUrl = payload.sticker.stickerUrl || "";
      mediaMime = "image/webp";
    } else if (payload.location) {
      const lat = payload.location.latitude;
      const lng = payload.location.longitude;
      body = `https://maps.google.com/maps?q=${lat},${lng}`;
      msgType = "location";
    } else if (payload.contact?.vcard) {
      // Single contact card with full vCard string
      body = payload.contact.vcard;
      msgType = "vcard";
    } else if (payload.contactName && payload.contactPhone) {
      // Z-API simple format: contactName + contactPhone (mirrors send-contact API)
      const phone_ = String(payload.contactPhone).replace(/\D/g, "");
      const intl = phone_.startsWith("+") ? phone_ : `+${phone_}`;
      body = `BEGIN:VCARD\nVERSION:3.0\nFN:${payload.contactName}\nTEL;type=CELL;waid=${phone_}:${intl}\nEND:VCARD`;
      msgType = "vcard";
    } else if (Array.isArray(payload.contacts) && payload.contacts.length > 0) {
      // Multiple contact cards — join vcards so the frontend can render them
      body = payload.contacts
        .map((c: any) => {
          if (c.vcard) return c.vcard;
          if (c.displayName && c.phones?.[0]) {
            const p = String(c.phones[0]).replace(/\D/g, "");
            return `BEGIN:VCARD\nVERSION:3.0\nFN:${c.displayName}\nTEL;type=CELL;waid=${p}:+${p}\nEND:VCARD`;
          }
          return null;
        })
        .filter(Boolean)
        .join("\n");
      if (!body) return;
      msgType = "vcard";
    } else {
      // Unknown type — log full payload so we can identify the format
      logger.warn({ msg: "Z-API unhandled message type — full payload", payload: JSON.stringify(payload) });
      return;
    }

    const timestamp = payload.momment
      ? Math.floor(payload.momment / 1000)
      : Math.floor(Date.now() / 1000);

    const messagePayload: MessagePayload = {
      id: payload.messageId || `zapi-${Date.now()}`,
      body,
      fromMe: Boolean(payload.fromMe),
      hasMedia,
      type: msgType,
      timestamp,
      from: `${phone}@c.us`,
      to: "",
      hasQuotedMsg: Boolean(payload.referenceMessageId),
      quotedMsgId: payload.referenceMessageId || undefined
    };

    const contextPayload: WhatsappContextPayload = {
      whatsappId,
      unreadMessages: 1
    };

    if (isGroup && groupPhone) {
      contextPayload.groupContact = {
        name: payload.chatName || groupPhone,
        number: groupPhone,
        isGroup: true
      };
    }

    // Download media if needed
    let mediaPayload: MediaPayload | undefined;
    if (hasMedia && mediaUrl) {
      mediaPayload = await downloadMedia(mediaUrl, mediaMime, mediaFilename || undefined);
    }

    await handleMessage(messagePayload, contactPayload, contextPayload, mediaPayload);
  } catch (err) {
    logger.error({ msg: "Z-API webhook processing error", err });
  }
});

// Connection status webhook — called by Z-API on connect/disconnect
router.post("/zapi/webhook-status/:whatsappId", async (req: Request, res: Response) => {
  const whatsappId = parseInt(req.params.whatsappId, 10);
  const payload = req.body;

  res.status(200).json({ ok: true });

  try {
    const whatsapp = await Whatsapp.findByPk(whatsappId);
    if (!whatsapp) return;

    const io = getIO();

    const isConnected =
      payload.connected === true || payload.type === "connected";
    const isDisconnected =
      payload.connected === false || payload.type === "disconnected";

    if (isConnected) {
      await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
      logger.info(`Z-API session ${whatsapp.name} CONNECTED via webhook`);
    } else if (isDisconnected) {
      await whatsapp.update({ status: "DISCONNECTED" });
      logger.warn(`Z-API session ${whatsapp.name} DISCONNECTED via webhook`);
    }

    io.emit("whatsappSession", { action: "update", session: whatsapp });
  } catch (err) {
    logger.error({ msg: "Z-API status webhook error", err });
  }
});

export default router;
