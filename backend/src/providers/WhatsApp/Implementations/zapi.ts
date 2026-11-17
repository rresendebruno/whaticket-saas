import axios from "axios";
import fs from "fs";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import Setting from "../../../models/Setting";
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
const isOldGroupId = (to: string): boolean =>
  /^\d{8,15}-\d{8,12}(@g\.us)?$/.test(to.trim());

const cleanPhone = (to: string): string => {
  // Group IDs ("120363...-group") must keep their suffix. They arrive either
  // as "<id>@g.us" or as the raw stored contact number "<id>-group".
  // Old-style groups (created before ~2021) use "<creator phone>-<timestamp>",
  // e.g. "556284366894-1592821599"; the hyphen must not be stripped either.
  if (to.includes("@g.us") || /-group$/i.test(to) || isOldGroupId(to)) {
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

    // Keep read receipts enabled (needed for the blue ticks) unless an admin
    // disabled them on the Settings page. Z-API requires ?value=enable|disable;
    // the old call sent no value and always failed.
    try {
      const saved = await Setting.findByPk("privacyReadReceipts");
      if (saved?.value !== "disable") {
        await zapiPost("/privacy/read-receipts?value=enable", {});
        logger.info("Z-API read receipts privacy: enabled");
      }
    } catch (err: any) {
      logger.warn({ msg: "Z-API read receipts not applied", zapiError: err?.response?.data || err?.message });
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
    // Z-API expects individual phone IDs in "number@c.us" format
    payload.mentioned = options.mentioned.map(p =>
      p.includes("@") ? p : `${p}@c.us`
    );
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

  // Browsers/recorders often label MP3 as "audio/mp3" (non-standard). Z-API expects
  // the standard "audio/mpeg" in the data URI, otherwise the audio is not delivered.
  const AUDIO_MIME_FIX: Record<string, string> = {
    "audio/mp3": "audio/mpeg",
    "audio/x-mp3": "audio/mpeg",
    "audio/x-mpeg": "audio/mpeg",
    "audio/x-m4a": "audio/mp4",
    "audio/x-wav": "audio/wav"
  };
  const baseMime = media.mimetype.split(";")[0].trim().toLowerCase();
  const dataMime = AUDIO_MIME_FIX[baseMime] || baseMime;

  let mediaSource: string;
  if (media.data) {
    mediaSource = `data:${dataMime};base64,${media.data.toString("base64")}`;
  } else if (media.path) {
    const fileBuffer = fs.readFileSync(media.path);
    mediaSource = `data:${dataMime};base64,${fileBuffer.toString("base64")}`;
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
    if (options?.sendMediaAsSticker && media.mimetype.startsWith("image/")) {
      // Z-API sticker endpoint: accepts a URL or a data URI (data:image/...;base64,...)
      result = await zapiPost("/send-sticker", {
        phone,
        sticker: mediaSource,
        ...(options?.stickerAuthor && { stickerAuthor: options.stickerAuthor }),
        ...(quotedMessageId && { messageId: quotedMessageId })
      });
      msgType = "sticker";
    } else if (media.mimetype.startsWith("image/")) {
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
        // waveform = shows as a voice note (with sound waves), like a recorded audio
        waveform: Boolean(options?.sendAudioAsVoice)
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

  // Groups are tried with and without the "-group" suffix: new groups
  // ("120363...") are known by Z-API as "<id>-group", while old-style groups
  // ("556284366894-1592821599") may be stored/accepted in either form.
  const isGroupId = /-group$/i.test(phone) || isOldGroupId(phone);
  const base = phone.replace(/-group$/i, "");
  const candidates = isGroupId ? [`${base}-group`, base] : [phone];

  // Z-API answers "no photo" with the STRING "null" ({"link":"null"}), which
  // must not be stored as a URL.
  const validUrl = (v: unknown): string => {
    const s = typeof v === "string" ? v.trim() : "";
    return /^https?:\/\//i.test(s) ? s : "";
  };

  // Sequential on purpose: stop at the first ID that returns a photo.
  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (const id of candidates) {
    // 1) GET /profile-picture?phone= — documented for contacts
    try {
      const result = await zapiGet(`/profile-picture?phone=${encodeURIComponent(id)}`);
      const url = validUrl(result?.link) || validUrl(result?.value);
      if (url) return url;
    } catch {
      // fall through
    }

    // 2) GET /chats/{phone} — "profileThumbnail: URL da foto do chat"; also
    //    covers groups, whose photo the endpoint above may not return.
    try {
      const chat = await zapiGet(`/chats/${encodeURIComponent(id)}`);
      const url = validUrl(chat?.profileThumbnail) || validUrl(chat?.imgUrl);
      if (url) return url;
    } catch {
      // no photo / not accessible
    }
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */

  return "";
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

// GET /groups?page=N&pageSize=M — returns every group of the instance, paginated.
// Group "phone" comes as e.g. "120363358412332916-group", the same ID format the
// webhook uses, so it is stored as-is (only an eventual @g.us is stripped).
const GROUPS_PAGE_SIZE = 100;
const GROUPS_MAX_PAGES = 50; // safety cap: 5,000 groups

const getGroups = async (_sessionId: number): Promise<ProviderContact[]> => {
  const groups: ProviderContact[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= GROUPS_MAX_PAGES; page += 1) {
    const data = await zapiGet(`/groups?page=${page}&pageSize=${GROUPS_PAGE_SIZE}`);
    const list: any[] = Array.isArray(data) ? data : [];

    list.forEach(g => {
      const id = String(g?.phone || "").replace(/@g\.us$/, "").trim();
      // Defensive: the endpoint should only return groups
      if (!id || g?.isGroup === false || seen.has(id)) return;
      seen.add(id);
      groups.push({
        id,
        name: g?.name || id,
        pushname: g?.name || id,
        number: id,
        isGroup: true
      });
    });

    if (list.length < GROUPS_PAGE_SIZE) break;
  }

  logger.info({ msg: "Z-API getGroups", total: groups.length });
  return groups;
};

// GET /group-metadata/{groupId} — subject, description and participants
// ({ phone, isAdmin, isSuperAdmin, name? }) of a group.
const getGroupMetadata = async (
  _sessionId: number,
  groupId: string
): Promise<{
  subject?: string;
  description?: string;
  owner?: string;
  participants: { phone: string; isAdmin: boolean; isSuperAdmin: boolean; name?: string }[];
}> => {
  const id = cleanPhone(groupId);
  const data = await zapiGet(`/group-metadata/${encodeURIComponent(id)}`);
  const participants = Array.isArray(data?.participants) ? data.participants : [];
  return {
    subject: data?.subject,
    description: data?.description,
    owner: data?.owner,
    participants: participants.map((p: any) => ({
      phone: String(p?.phone || "").replace(/@.+$/, ""),
      isAdmin: Boolean(p?.isAdmin),
      isSuperAdmin: Boolean(p?.isSuperAdmin),
      name: p?.name || p?.short || undefined
    }))
  };
};

// --- Privacy settings ---
// Z-API only offers setters (no endpoint to read the current values).
export type PrivacySetting =
  | "photo"
  | "lastSeen"
  | "description"
  | "online"
  | "readReceipts";

const PRIVACY_PATHS: Record<Exclude<PrivacySetting, "readReceipts">, string> = {
  photo: "/privacy/photo-visualization",
  lastSeen: "/privacy/last-seen",
  description: "/privacy/description",
  online: "/privacy/online"
};

const setPrivacy = async (
  _sessionId: number,
  setting: PrivacySetting,
  value: string
): Promise<void> => {
  try {
    if (setting === "readReceipts") {
      // value goes in the query string: enable | disable
      await zapiPost(`/privacy/read-receipts?value=${encodeURIComponent(value)}`, {});
    } else {
      await zapiPost(PRIVACY_PATHS[setting], { visualizationType: value });
    }
    logger.info({ msg: "Z-API privacy updated", setting, value });
  } catch (err: any) {
    logger.error({ msg: "Z-API setPrivacy error", setting, value, zapiError: err?.response?.data || err?.message });
    throw err;
  }
};

// POST /send-contact { phone, contactName, contactPhone, messageId? }
const sendContact = async (
  _sessionId: number,
  to: string,
  contactName: string,
  contactPhone: string,
  quotedMessageId?: string
): Promise<ProviderMessage> => {
  const phone = cleanPhone(to);
  try {
    const result = await zapiPost("/send-contact", {
      phone,
      contactName,
      contactPhone,
      ...(quotedMessageId && { messageId: quotedMessageId })
    });
    return {
      id: result?.messageId || result?.id || `zapi-${Date.now()}`,
      body: contactName,
      fromMe: true,
      hasMedia: false,
      type: "vcard",
      timestamp: Math.floor(Date.now() / 1000),
      from: "",
      to: phone
    };
  } catch (err: any) {
    logger.error({ msg: "Z-API sendContact error", phone, zapiError: err?.response?.data || err?.message });
    throw err;
  }
};

// POST /send-reaction { phone, reaction, messageId }
const sendReaction = async (
  _sessionId: number,
  chatId: string,
  messageId: string,
  emoji: string
): Promise<void> => {
  const phone = cleanPhone(chatId);
  try {
    await zapiPost("/send-reaction", { phone, reaction: emoji, messageId });
  } catch (err: any) {
    logger.error({ msg: "Z-API sendReaction error", phone, messageId, zapiError: err?.response?.data || err?.message });
    throw err;
  }
};

// POST /send-remove-reaction { phone, messageId }
const removeReaction = async (
  _sessionId: number,
  chatId: string,
  messageId: string
): Promise<void> => {
  const phone = cleanPhone(chatId);
  try {
    await zapiPost("/send-remove-reaction", { phone, messageId });
  } catch (err: any) {
    logger.error({ msg: "Z-API removeReaction error", phone, messageId, zapiError: err?.response?.data || err?.message });
    throw err;
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
  getGroups,
  sendReaction,
  removeReaction,
  setPrivacy,
  sendContact,
  getGroupMetadata,
  sendSeen,
  fetchChatMessages
};
