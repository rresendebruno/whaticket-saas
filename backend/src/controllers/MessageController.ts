import { Request, Response } from "express";
import axios from "axios";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";

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

  if (!contactId) throw new AppError("ERR_MISSING_CONTACT_ID");

  const message = await Message.findByPk(messageId, {
    include: [{ model: Ticket, include: [Contact] }]
  });
  if (!message) throw new AppError("ERR_MESSAGE_NOT_FOUND");

  const targetContact = await Contact.findByPk(contactId);
  if (!targetContact) throw new AppError("ERR_CONTACT_NOT_FOUND");

  const sourcePhone = message.ticket?.contact?.number;
  const targetPhone = targetContact.number;

  if (!sourcePhone || !targetPhone) throw new AppError("ERR_INVALID_PHONE");

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || "";

  try {
    await axios.post(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/forward-message`,
      { phone: targetPhone, messageId, messagePhone: sourcePhone },
      { headers: { "Content-Type": "application/json", "Client-Token": clientToken } }
    );
    logger.info({ msg: "Forward message sent", messageId, targetPhone, sourcePhone });
  } catch (err: any) {
    logger.error({ msg: "Forward message error", err: err?.response?.data || err?.message });
    throw new AppError("ERR_FORWARD_WAPP_MSG");
  }

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
