import { Request, Response } from "express";
import axios from "axios";
import { Op } from "sequelize";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
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

  const ticket = await ShowTicketService(ticketId);

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket });
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

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || "";
  const groupPhone = ticket.contact.number;

  try {
    const { data } = await axios.get(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/group-members/${groupPhone}`,
      { headers: { "Client-Token": clientToken } }
    );
    const members = Array.isArray(data) ? data : (data?.members || data?.participants || []);
    return res.json({ members });
  } catch (err: any) {
    logger.error({ msg: "Failed to fetch group members", ticketId, err: err?.response?.data || err?.message });
    return res.json({ members: [] });
  }
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
