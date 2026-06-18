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
  const { body, quotedMsg }: MessageData = req.body;
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
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }

  return res.send();
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

  // --- Call Z-API forward-message ---
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || "";

  try {
    await axios.post(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/forward-message`,
      { phone: targetPhone, messageId, messagePhone: sourcePhone },
      { headers: { "Content-Type": "application/json", "Client-Token": clientToken } }
    );
    logger.info({ msg: "Forward message Z-API sent", messageId, targetPhone });
  } catch (err: any) {
    logger.error({ msg: "Forward message Z-API error", err: err?.response?.data || err?.message });
    throw new AppError("ERR_FORWARD_WAPP_MSG");
  }

  // --- Find or create ticket for target contact ---
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

  // Resolve a legible description of the forwarded message content
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
  const msgContent =
    sourceMessage.body && sourceMessage.body.trim()
      ? sourceMessage.body.trim()
      : mediaLabels[sourceMessage.mediaType] || "[Mídia]";

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

  // --- Internal note on TARGET ticket ---
  await CreateMessageService({
    messageData: {
      id: `note-fwd-dst-${ts}`,
      ticketId: targetTicket!.id,
      body: `↪ Encaminhada por *${agentName}* do ticket *#${sourceTicket.id}* (${sourceTicket.contact?.name || sourcePhone})\n${msgContent}`,
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
