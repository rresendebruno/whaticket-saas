import axios from "axios";
import fs from "fs";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import { logger } from "../../../utils/logger";
import { WhatsappProvider } from "../whatsappProvider";
import {
  ProviderMessage,
  ProviderMediaInput,
  ProviderContact,
  SendMessageOptions,
  SendMediaOptions,
  MessageType
} from "../types";

interface ZApiSession {
  whatsappId: number;
  polling: ReturnType<typeof setInterval> | null;
  connected: boolean;
}

const sessions = new Map<number, ZApiSession>();

const zapiBaseUrl = (): string => {
  const id = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!id || !token) throw new AppError("ZAPI credentials not configured");
  return `https://api.z-api.io/instances/${id}/token/${token}`;
};

const zapiHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "Client-Token": process.env.ZAPI_CLIENT_TOKEN || ""
});

const zapiGet = async (path: string): Promise<any> => {
  const { data } = await axios.get(`${zapiBaseUrl()}${path}`, {
    headers: zapiHeaders()
  });
  return data;
};

const zapiPost = async (path: string, body: object): Promise<any> => {
  const { data } = await axios.post(`${zapiBaseUrl()}${path}`, body, {
    headers: zapiHeaders()
  });
  return data;
};

const zapiPut = async (path: string, body: object): Promise<any> => {
  const { data } = await axios.put(`${zapiBaseUrl()}${path}`, body, {
    headers: zapiHeaders()
  });
  return data;
};

const zapiDelete = async (path: string, params?: Record<string, string | boolean>): Promise<void> => {
  await axios.delete(`${zapiBaseUrl()}${path}`, {
    headers: zapiHeaders(),
    params
  });
};

// For groups (@g.us): strip only the suffix, keep full alphanumeric ID (e.g. "120363xxx-ABCdef")
// For individuals (@c.us / @s.whatsapp.net): strip suffix and keep only digits
const cleanPhone = (to: string): string => {
  if (to.includes("@g.us")) {
    return to.replace(/@g\.us$/, "");
  }
  return to.replace(/@c\.us|@s\.whatsapp\.net/g, "").replace(/[^\d]/g, "");
};

const removeSession = (whatsappId: number): void => {
  const session = sessions.get(whatsappId);
  if (session?.polling) clearInterval(session.polling);
  sessions.delete(whatsappId);
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  try {
    removeSession(whatsapp.id);
    const io = getIO();

    const session: ZApiSession = {
      whatsappId: whatsapp.id,
      polling: null,
      connected: false
    };
    sessions.set(whatsapp.id, session);

    // Register webhooks so Z-API knows where to send events
    const publicUrl =
      process.env.ZAPI_PUBLIC_URL ||
      process.env.BACKEND_URL ||
      "http://localhost:8080";
    const msgWebhook = `${publicUrl}/zapi/webhook/${whatsapp.id}`;
    const statusWebhook = `${publicUrl}/zapi/webhook-status/${whatsapp.id}`;

    try {
      // Incoming messages (+ "Notificar enviadas por mim" sends SENT status here too)
      await zapiPut("/update-webhook-received", { value: msgWebhook });
      // "Receber status da mensagem" = DELIVERED / READ ACK → must go to message handler, NOT status handler
      await zapiPut("/update-webhook-status", { value: msgWebhook });
      // Try additional ACK endpoint names (varies by Z-API version)
      await zapiPut("/update-webhook-message-ack", { value: msgWebhook }).catch(() => {});
      // Connection events
      await zapiPut("/update-webhook-disconnected", { value: statusWebhook });
      await zapiPut("/update-webhook-connected", { value: statusWebhook }).catch(() => {});
      // Register call webhook so incoming calls fire ReceivedCallCallback to our handler
      await zapiPut("/update-webhook-received-call", { value: msgWebhook }).catch(() => {});
      logger.info(`Z-API webhooks set: msgWebhook=${msgWebhook}`);
    } catch (err) {
      logger.warn({ msg: "Could not set Z-API webhooks", err });
    }

    // Ensure read receipts are enabled in WhatsApp privacy settings (not available on all plans)
    try {
      await zapiPost("/privacy/read-receipts", {});
      logger.info("Z-API read receipts privacy: enabled");
    } catch {
      // Silently ignore — endpoint not available on all Z-API plans
    }

    // Check current connection status
    const status = await zapiGet("/status");

    if (status?.connected) {
      session.connected = true;
      await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
      io.emit("whatsappSession", { action: "update", session: whatsapp });
      logger.info(`Z-API session ${whatsapp.name} already CONNECTED`);
      return;
    }

    // Not connected — show QR code and poll for scan
    await whatsapp.update({ status: "qrcode", retries: 0 });
    io.emit("whatsappSession", { action: "update", session: whatsapp });

    session.polling = setInterval(async () => {
      try {
        const st = await zapiGet("/status");

        if (st?.connected) {
          if (session.polling) clearInterval(session.polling);
          session.polling = null;
          session.connected = true;
          await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
          io.emit("whatsappSession", { action: "update", session: whatsapp });
          logger.info(`Z-API session ${whatsapp.name} CONNECTED after QR scan`);
          return;
        }

        const qrData = await zapiGet("/qr-code/image");
        if (qrData?.value) {
          await whatsapp.update({ qrcode: qrData.value, status: "qrcode" });
          io.emit("whatsappSession", { action: "update", session: whatsapp });
        }
      } catch (err) {
        logger.error({ msg: "Z-API polling error", err });
      }
    }, 3000);
  } catch (err) {
    logger.error({ msg: "Z-API init error", err });
    await whatsapp.update({ status: "DISCONNECTED" });
  }
};

const logout = async (sessionId: number): Promise<void> => {
  try {
    await zapiDelete("/disconnect");
  } catch (err) {
    logger.error({ msg: "Z-API logout error", err });
  }
  removeSession(sessionId);
};

const sendMessage = async (
  _sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const phone = cleanPhone(to);
  logger.info({ msg: "Z-API sendMessage", phone, bodyLen: body.length });

  const payload: Record<string, unknown> = { phone, message: body };
  if (options?.quotedMessageId) {
    payload.messageId = options.quotedMessageId;
  }
  if (options?.mentionAll) {
    payload.mentionAll = true;
  } else if (options?.mentioned?.length) {
    payload.mentioned = options.mentioned;
  }

  try {
    const result = await zapiPost("/send-text", payload);
    logger.info({ msg: "Z-API sendMessage response", phone, result });
    return {
      id: result?.messageId || result?.id || `zapi-${Date.now()}`,
      body,
      fromMe: true,
      hasMedia: false,
      type: "chat",
      timestamp: Math.floor(Date.now() / 1000),
      from: "",
      to: phone
    };
  } catch (err: any) {
    logger.error({ msg: "Z-API sendMessage error", phone, zapiError: err?.response?.data || err?.message });
    throw err;
  }
};

const sendMedia = async (
  _sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const phone = cleanPhone(to);
  const caption = options?.caption || "";
  const quotedMessageId = options?.quotedMessageId;
  let result: any;
  let msgType: MessageType = "document";

  let mediaSource: string;
  if (media.data) {
    mediaSource = `data:${media.mimetype};base64,${media.data.toString("base64")}`;
  } else if (media.path) {
    const fileBuffer = fs.readFileSync(media.path);
    mediaSource = `data:${media.mimetype};base64,${fileBuffer.toString("base64")}`;
    logger.info({
      msg: "Z-API sendMedia",
      phone,
      mimetype: media.mimetype,
      filename: media.filename,
      fileSizeKB: Math.round(fileBuffer.length / 1024)
    });
  } else {
    throw new AppError("No media data available");
  }

  // File extension extracted from filename (used for the /documents/{ext} endpoint)
  const fileExt = (media.filename || "file").split(".").pop()?.toLowerCase() || "bin";

  try {
    if (media.mimetype.startsWith("image/")) {
      result = await zapiPost("/send-image", {
        phone,
        image: mediaSource,
        caption,
        ...(quotedMessageId && { messageId: quotedMessageId })
      });
      msgType = "image";
    } else if (media.mimetype.startsWith("audio/")) {
      result = await zapiPost("/send-audio", {
        phone,
        audio: mediaSource,
        ...(quotedMessageId && { messageId: quotedMessageId })
      });
      msgType = options?.sendAudioAsVoice ? "ptt" : "audio";
    } else if (media.mimetype.startsWith("video/")) {
      result = await zapiPost("/send-video", {
        phone,
        video: mediaSource,
        caption,
        ...(quotedMessageId && { messageId: quotedMessageId })
      });
      msgType = "video";
    } else {
      // Z-API document endpoint: /send-document/{extension} (extension is a path param)
      // Z-API auto-appends the extension from the URL, so strip it from fileName to avoid doubling
      const parts = (media.filename || "file").split(".");
      const fileNameBase = parts.length > 1 ? parts.slice(0, -1).join(".") : parts[0];
      result = await zapiPost(`/send-document/${fileExt}`, {
        phone,
        document: mediaSource,
        fileName: fileNameBase,
        caption,
        ...(quotedMessageId && { messageId: quotedMessageId })
      });
    }
    logger.info({ msg: "Z-API sendMedia result", result });
  } catch (err: any) {
    logger.error({
      msg: "Z-API sendMedia API error",
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message
    });
    throw err;
  }

  return {
    id: result?.messageId || result?.id || `zapi-${Date.now()}`,
    body: caption,
    fromMe: true,
    hasMedia: true,
    type: msgType,
    timestamp: Math.floor(Date.now() / 1000),
    from: "",
    to: phone
  };
};

const deleteMessage = async (
  _sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  try {
    const phone = cleanPhone(chatId);
    await zapiDelete("/messages", {
      messageId,
      phone,
      owner: fromMe
    });
  } catch (err) {
    logger.warn({ msg: "Z-API delete message error", err });
  }
};

const checkNumber = async (
  _sessionId: number,
  number: string
): Promise<string> => {
  const phone = cleanPhone(number);
  try {
    const result = await zapiGet(`/phone-exists/${phone}`);
    return result?.exists ? `${phone}@c.us` : "";
  } catch {
    return "";
  }
};

const getProfilePicUrl = async (
  _sessionId: number,
  number: string
): Promise<string> => {
  const phone = cleanPhone(number);
  try {
    const result = await zapiGet(`/profile-picture?phone=${phone}`);
    return result?.value || "";
  } catch {
    return "";
  }
};

const getContacts = async (_sessionId: number): Promise<ProviderContact[]> => {
  try {
    const contacts = await zapiGet("/contacts");
    if (!Array.isArray(contacts)) return [];
    return contacts.map((c: any) => ({
      id: c.phone || c.id,
      name: c.name,
      pushname: c.name,
      number: c.phone || c.id,
      profilePicUrl: c.photo,
      isGroup: false
    }));
  } catch {
    return [];
  }
};

const sendSeen = async (
  _sessionId: number,
  chatId: string,
  messageId?: string
): Promise<void> => {
  if (!messageId) return;
  try {
    const phone = cleanPhone(chatId);
    await zapiPost("/read-message", { phone, messageId });
  } catch (err: any) {
    // Non-critical — log at warn level, don't throw
    logger.warn({ msg: "Z-API sendSeen error", phone: cleanPhone(chatId), zapiError: err?.response?.data || err?.message });
  }
};

const fetchChatMessages = async (
  _sessionId: number,
  _chatId: string,
  _limit: number
): Promise<ProviderMessage[]> => {
  // Z-API does not support fetching historical chat messages
  return [];
};

export const ZApiProvider: WhatsappProvider = {
  init,
  removeSession,
  logout,
  sendMessage,
  sendMedia,
  deleteMessage,
  checkNumber,
  getProfilePicUrl,
  getContacts,
  sendSeen,
  fetchChatMessages
};
