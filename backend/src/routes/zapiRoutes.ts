import { Router, Request, Response } from "express";
import axios from "axios";
import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";

import { logger } from "../utils/logger";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import {
  handleMessage,
  ContactPayload,
  MessagePayload,
  MediaPayload,
  WhatsappContextPayload
} from "../handlers/handleWhatsappEvents";
import { MessageType } from "../providers/WhatsApp/types";

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

    // Skip messages sent by our backend API (already saved by SendWhatsAppMessage)
    // Allow messages sent directly from the physical phone (fromApi: false) to sync
    if (payload.fromMe && payload.fromApi !== false) return;
    // Group messages sent from phone have complex routing — skip for now
    if (payload.fromMe && payload.isGroup) return;
    if (payload.type !== "ReceivedCallback") return;

    const rawPhone: string = payload.participantPhone || payload.phone || "";
    const phone = rawPhone.replace(/\D/g, "");
    if (!phone) return;

    const isGroup = Boolean(payload.participantPhone);
    const groupRawPhone: string = isGroup ? payload.phone || "" : "";
    // Group IDs can be alphanumeric (e.g. "120363xxx-ABCdef") — only strip the @g.us suffix
    const groupPhone = groupRawPhone.replace(/@.+$/, "");

    const contactPayload: ContactPayload = {
      name: payload.senderName || phone,
      number: phone,
      profilePicUrl: payload.senderPhoto || undefined,
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
    } else {
      // Unknown type — skip
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
