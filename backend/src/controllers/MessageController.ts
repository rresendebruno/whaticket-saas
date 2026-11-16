import { Request, Response } from "express";
import axios from "axios";
import { Op } from "sequelize";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import normalizeBrazilianPhone from "../helpers/normalizeBrazilianPhone";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import User from "../models/User";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import SetMessageReactionService from "../services/MessageServices/SetMessageReactionService";
import { whatsappProvider } from "../providers/WhatsApp";

type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
  mentioned?: string[];
  mentionAll?: boolean;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg, mentioned, mentionAll }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];
  // multipart/form-data sends booleans as strings
  const asSticker = String(req.body.asSticker) === "true";

  const ticket = await ShowTicketService(ticketId);

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket, asSticker });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg, mentioned, mentionAll });
  }

  return res.send();
};

export const groupMembers = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const ticket = await ShowTicketService(ticketId);

  if (!ticket.isGroup) {
    return res.json({ members: [] });
  }

  // DB fallback: participants who already sent messages in this ticket
  const dbMessages = await Message.findAll({
    where: { ticketId: ticket.id, fromMe: false } as any,
    include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }],
    attributes: ["contactId"]
  });
  const seen = new Set<number>();
  const dbMembers = dbMessages
    .filter(m => (m as any).contact?.number && !seen.has((m as any).contactId) && seen.add((m as any).contactId))
    .map(m => ({ phone: (m as any).contact.number, name: (m as any).contact.name || (m as any).contact.number }));

  // Full participant list from Z-API: GET /group-metadata/{groupId}
  // (the old code called an undocumented /group-members endpoint and always
  // fell back to "people who already wrote in this ticket").
  if (whatsappProvider.getGroupMetadata && ticket.whatsappId) {
    try {
      const meta = await whatsappProvider.getGroupMetadata(
        ticket.whatsappId,
        `${ticket.contact.number}@g.us`
      );

      if (meta.participants.length > 0) {
        // Enrich with names/photos of contacts we already know
        const normalized = meta.participants.map(p => {
          const digits = p.phone.replace(/\D/g, "");
          return { ...p, digits, normalized: normalizeBrazilianPhone(digits) };
        });
        const known = await Contact.findAll({
          where: {
            number: {
              [Op.in]: Array.from(
                // (no flatMap: the backend targets ES6)
                new Set(
                  normalized
                    .reduce<string[]>((acc, p) => acc.concat([p.digits, p.normalized]), [])
                    .filter(Boolean)
                )
              )
            }
          },
          attributes: ["id", "name", "number", "profilePicUrl"]
        });
        const byNumber = new Map(known.map(c => [c.number, c]));

        const members = normalized
          .filter(p => p.digits)
          .map(p => {
            const c = byNumber.get(p.normalized) || byNumber.get(p.digits);
            return {
              phone: p.digits, // raw WhatsApp id digits — used for @mentions
              name: c?.name || p.name || p.digits,
              contactId: c?.id || null,
              profilePicUrl: c?.profilePicUrl || null,
              isAdmin: p.isAdmin || p.isSuperAdmin,
              isSuperAdmin: p.isSuperAdmin
            };
          })
          // Admins first, then alphabetical
          .sort((a, b) =>
            Number(b.isAdmin) - Number(a.isAdmin) ||
            String(a.name).localeCompare(String(b.name), "pt-BR")
          );

        return res.json({
          members,
          subject: meta.subject || null,
          description: meta.description || null,
          source: "whatsapp"
        });
      }
    } catch (err: any) {
      logger.warn({
        msg: "Z-API group-metadata failed, using DB fallback",
        ticketId,
        err: err?.response?.status || err?.message
      });
    }
  }

  return res.json({ members: dbMembers, source: "history" });
};

export const forward = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const { contactId } = req.body;
  const agentId = Number((req as any).user.id);

  if (!contactId) throw new AppError("ERR_MISSING_CONTACT_ID");

  // Load source message with full ticket + contact
  const sourceMessage = await Message.findByPk(messageId, {
    include: [{ model: Ticket, include: [Contact] }]
  });
  if (!sourceMessage) throw new AppError("ERR_MESSAGE_NOT_FOUND");

  const sourceTicket = sourceMessage.ticket;
  if (!sourceTicket) throw new AppError("ERR_MESSAGE_NOT_FOUND");

  const targetContact = await Contact.findByPk(contactId);
  if (!targetContact) throw new AppError("ERR_CONTACT_NOT_FOUND");

  const sourcePhone = sourceTicket.contact?.number;
  const targetPhone = targetContact.number;
  if (!sourcePhone || !targetPhone) throw new AppError("ERR_INVALID_PHONE");

  // Get agent name for notes
  const agent = await User.findByPk(agentId);
  const agentName = agent?.name || "Agente";

  // --- Find or create ticket for target contact (before Z-API call so we have the ID) ---
  let targetTicket = await Ticket.findOne({
    where: {
      contactId: targetContact.id,
      whatsappId: sourceTicket.whatsappId,
      status: { [Op.in]: ["open", "pending"] }
    },
    include: [Contact]
  });

  if (!targetTicket) {
    const created = await Ticket.create({
      contactId: targetContact.id,
      whatsappId: sourceTicket.whatsappId,
      queueId: sourceTicket.queueId || null,
      userId: agentId,
      status: "pending",
      isGroup: false,
      unreadMessages: 0,
      lastMessage: ""
    } as any);

    targetTicket = await Ticket.findByPk(created.id, { include: [Contact] });
    logger.info({ msg: "Forward: new ticket created", ticketId: created.id, contact: targetContact.name });

    const io = getIO();
    io.emit("ticket", { action: "update", ticket: targetTicket });
  }

  // --- Call Z-API forward-message ---
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || "";

  let fwdMessageId: string = `fwd-${Date.now()}`;
  try {
    const fwdResult = await axios.post(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/forward-message`,
      { phone: targetPhone, messageId, messagePhone: sourcePhone },
      { headers: { "Content-Type": "application/json", "Client-Token": clientToken } }
    );
    fwdMessageId = fwdResult.data?.messageId || fwdResult.data?.id || fwdMessageId;
    logger.info({ msg: "Forward message Z-API sent", messageId, targetPhone, fwdMessageId });
  } catch (err: any) {
    logger.error({ msg: "Forward message Z-API error", err: err?.response?.data || err?.message });
    throw new AppError("ERR_FORWARD_WAPP_MSG");
  }

  // --- Save the actual forwarded message content to the target ticket ---
  // Use the raw stored filename so the media URL is reconstructed correctly by the model getter
  const rawMediaUrl = (sourceMessage as any).getDataValue("mediaUrl") as string | null;

  await CreateMessageService({
    messageData: {
      id: fwdMessageId,
      ticketId: targetTicket!.id,
      body: sourceMessage.body || "",
      fromMe: true,
      read: true,
      mediaType: sourceMessage.mediaType || "chat",
      mediaUrl: rawMediaUrl || undefined,
      ack: 1
    }
  });

  // --- Resolve a label for the note describing what was forwarded ---
  const mediaLabels: Record<string, string> = {
    image: "[Imagem]",
    audio: "[Áudio]",
    ptt: "[Áudio]",
    video: "[Vídeo]",
    document: "[Documento]",
    vcard: "[Contato]",
    sticker: "[Figurinha]",
    location: "[Localização]"
  };
  const isMediaType = Object.keys(mediaLabels).includes(sourceMessage.mediaType);
  const rawBody = sourceMessage.body?.trim() || "";
  const isFilename = isMediaType && rawBody.length > 0 && !/\s/.test(rawBody) && /\.[a-z0-9]{2,5}$/i.test(rawBody);
  const caption = isFilename ? "" : rawBody;
  const mediaLabel = mediaLabels[sourceMessage.mediaType];
  const msgContent = mediaLabel
    ? caption ? `${mediaLabel} — ${caption}` : mediaLabel
    : caption || "[Mensagem]";

  const ts = Date.now();

  // --- Internal note on SOURCE ticket ---
  await CreateMessageService({
    messageData: {
      id: `note-fwd-src-${ts}`,
      ticketId: sourceTicket.id,
      body: `↪ *${agentName}* encaminhou para *${targetContact.name}*: ${msgContent}`,
      fromMe: true,
      read: true,
      mediaType: "note",
      ack: 3
    }
  });

  // --- Internal note on TARGET ticket (appears after the forwarded message) ---
  await CreateMessageService({
    messageData: {
      id: `note-fwd-dst-${ts}`,
      ticketId: targetTicket!.id,
      body: `↪ Encaminhada por *${agentName}* do ticket *#${sourceTicket.id}* (${sourceTicket.contact?.name || sourcePhone})`,
      fromMe: true,
      read: true,
      mediaType: "note",
      ack: 3
    }
  });

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;

  const message = await DeleteWhatsAppMessage(messageId, Number(req.user.id));

  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  return res.send();
};

// Loads the message + its chat id ("number@c.us" / "groupId@g.us")
const loadReactionTarget = async (messageId: string) => {
  const message = await Message.findByPk(messageId, {
    include: [{ model: Ticket, include: [Contact] }]
  });
  if (!message || !message.ticket?.contact) {
    throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
  }
  if (!message.ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_WHATSAPP");
  }
  const { contact } = message.ticket;
  const chatId = `${contact.number}@${message.ticket.isGroup ? "g" : "c"}.us`;
  return { message, chatId, whatsappId: message.ticket.whatsappId };
};

export const react = async (req: Request, res: Response): Promise<Response> => {
  const { messageId } = req.params;
  const emoji = String(req.body?.emoji || "").trim();
  if (!emoji || emoji.length > 32) throw new AppError("ERR_INVALID_REACTION");

  if (!whatsappProvider.sendReaction) {
    throw new AppError("ERR_REACTIONS_NOT_SUPPORTED");
  }

  const { chatId, whatsappId } = await loadReactionTarget(messageId);

  try {
    await whatsappProvider.sendReaction(whatsappId, chatId, messageId, emoji);
  } catch {
    throw new AppError("ERR_SENDING_REACTION");
  }

  const agent = await User.findByPk(Number(req.user.id), { attributes: ["id", "name"] });
  await SetMessageReactionService({
    messageId,
    senderNumber: "me",
    emoji,
    fromMe: true,
    senderName: agent?.name,
    userId: agent?.id
  });

  return res.status(200).json({ ok: true });
};

export const unreact = async (req: Request, res: Response): Promise<Response> => {
  const { messageId } = req.params;

  if (!whatsappProvider.removeReaction) {
    throw new AppError("ERR_REACTIONS_NOT_SUPPORTED");
  }

  const { chatId, whatsappId } = await loadReactionTarget(messageId);

  try {
    await whatsappProvider.removeReaction(whatsappId, chatId, messageId);
  } catch {
    throw new AppError("ERR_SENDING_REACTION");
  }

  await SetMessageReactionService({
    messageId,
    senderNumber: "me",
    emoji: "",
    fromMe: true
  });

  return res.status(200).json({ ok: true });
};

// Share a contact card in the ticket's chat (POST /messages/:ticketId/contact)
export const sendContact = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const contactName = String(req.body?.contactName || "").trim();
  const contactPhone = String(req.body?.contactPhone || "").replace(/\D/g, "");
  const quotedMsgId: string | undefined = req.body?.quotedMsgId || undefined;

  if (!contactName || contactPhone.length < 8) {
    throw new AppError("ERR_INVALID_CONTACT_CARD");
  }
  if (!whatsappProvider.sendContact) {
    throw new AppError("ERR_SEND_CONTACT_NOT_SUPPORTED");
  }

  const ticket = await ShowTicketService(ticketId);
  if (!ticket.whatsappId) throw new AppError("ERR_TICKET_NO_WHATSAPP");
  SetTicketMessagesAsRead(ticket);

  const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

  let sent;
  try {
    sent = await whatsappProvider.sendContact(
      ticket.whatsappId,
      chatId,
      contactName,
      contactPhone,
      quotedMsgId
    );
  } catch {
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }

  // Same vCard format used for received contact cards, so the chat renders it
  // with the existing VcardPreview component.
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;waid=${contactPhone}:+${contactPhone}\nEND:VCARD`;

  await ticket.update({ lastMessage: `👤 ${contactName}` });

  await CreateMessageService({
    messageData: {
      id: sent.id,
      ticketId: ticket.id,
      body: vcard,
      fromMe: true,
      read: true,
      mediaType: "vcard",
      ack: 1,
      ...(quotedMsgId && { quotedMsgId })
    }
  });

  return res.status(200).json({ ok: true });
};
