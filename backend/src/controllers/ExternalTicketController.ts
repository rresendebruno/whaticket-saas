import { Request, Response } from "express";
import { Op } from "sequelize";

import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import Contact from "../models/Contact";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";

/*
 * External integration API v1 — used by the fuel-quotation system.
 * Mounted at /api/v1 (see routes/index.ts). DO NOT change the contract:
 *
 *   POST /api/v1/ticket            (application/json or multipart/form-data)
 *     number*      digits with country+area code (or group id when isGroup)
 *     name, body, queueId, whatsappId, autoOpen (default true)
 *     (groups/communities: queueId is IGNORED; the API never sets their queue)
 *     multipart only: media (file, body becomes the caption), isGroup ("true")
 *   -> 200 { ticketId, status, contact: {id,name,number}, whatsappId, queueId, createdAt }
 *
 *   GET /api/v1/ticket/:ticketId
 *   -> 200 { ticketId, status, lastMessage, assignedTo: {id,name}|null, ... }
 *
 * Errors are always JSON: { error: "mensagem" }.
 */

// multipart/form-data sends everything as strings
const toBool = (v: unknown, fallback: boolean): boolean => {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  return ["true", "1", "yes", "sim", "on"].includes(String(v).trim().toLowerCase());
};

const toOptionalId = (v: unknown, field: string): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(`Campo "${field}" inválido`, 400);
  }
  return n;
};

// Individual: digits only (common formatting chars are tolerated).
// Group: stored as "<id>-group" (same format the Z-API webhook uses).
const normalizeNumber = (raw: unknown, isGroup: boolean): string => {
  const value = String(raw ?? "").trim();
  if (!value) throw new AppError('Campo "number" é obrigatório', 400);

  if (isGroup) {
    const id = value.replace(/@g\.us$/i, "");
    if (/^\d+$/.test(id)) return `${id}-group`;
    if (/^\d+-group$/i.test(id) || /^\d+-\d+$/.test(id)) return id;
    throw new AppError('Campo "number" inválido para grupo', 400);
  }

  const digits = value.replace(/[\s\-+().]/g, "");
  if (!/^\d{10,15}$/.test(digits)) {
    throw new AppError(
      'Campo "number" inválido: use apenas dígitos com DDI e DDD (ex.: 5562999887766)',
      400
    );
  }
  return digits;
};

const emitTicket = (ticket: Ticket, oldStatus?: string): void => {
  const io = getIO();
  if (oldStatus && oldStatus !== ticket.status) {
    io.to(oldStatus).emit("ticket", { action: "delete", ticketId: ticket.id });
  }
  io.to(ticket.status)
    .to("notification")
    .to(ticket.id.toString())
    .emit("ticket", { action: "update", ticket });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const isGroup = toBool(req.body.isGroup, false);
  const autoOpen = toBool(req.body.autoOpen, true);
  const number = normalizeNumber(req.body.number, isGroup);
  const name = req.body.name ? String(req.body.name).trim() : "";
  const body = req.body.body !== undefined ? String(req.body.body) : "";
  const queueId = toOptionalId(req.body.queueId, "queueId");
  const whatsappIdParam = toOptionalId(req.body.whatsappId, "whatsappId");
  const media = req.file as Express.Multer.File | undefined;

  // Validate references before creating anything
  if (queueId) {
    const queue = await Queue.findByPk(queueId);
    if (!queue) throw new AppError(`Fila #${queueId} não encontrada`, 404);
  }
  if (whatsappIdParam) {
    const wa = await Whatsapp.findByPk(whatsappIdParam);
    if (!wa) throw new AppError(`Conexão #${whatsappIdParam} não encontrada`, 404);
  }

  // 1. Create or update the contact
  const contact = await CreateOrUpdateContactService({
    name: name || number,
    number,
    isGroup
  });
  // Only replace a placeholder name (the number itself); never overwrite a
  // name the team already set for this supplier.
  if (name && (contact.name === contact.number || /^\d+$/.test(contact.name || ""))) {
    await contact.update({ name });
  }

  // 2. Reuse an existing pending/open ticket (suppliers usually have one)
  let ticket = await Ticket.findOne({
    where: {
      contactId: contact.id,
      status: { [Op.or]: ["open", "pending"] },
      ...(whatsappIdParam ? { whatsappId: whatsappIdParam } : {})
    },
    order: [["updatedAt", "DESC"]]
  });

  const oldStatus = ticket?.status;

  // Groups and communities: the API NEVER sets or changes their queue. The
  // "queueId" sent is ignored. An existing ticket keeps its queue; a new one
  // inherits the group's last queue or, for a group never queued, goes to the
  // "Grupos e comunidades" queue (looked up by name).
  const queueLocked = isGroup || Boolean(contact.isGroup);

  if (queueLocked && queueId) {
    logger.info({
      msg: "API v1: queueId ignored for group (queue locked)",
      contactId: contact.id,
      requestedQueueId: queueId,
      ticketId: ticket?.id
    });
  }

  if (!ticket) {
    let newQueueId = queueId;
    if (queueLocked) {
      const lastWithQueue = await Ticket.findOne({
        where: { contactId: contact.id, queueId: { [Op.not]: null } as any },
        order: [["updatedAt", "DESC"]]
      });
      const groupsQueue = lastWithQueue?.queueId
        ? null
        : await Queue.findOne({ where: { name: { [Op.like]: "%grupo%" } } });
      newQueueId = lastWithQueue?.queueId || groupsQueue?.id || undefined;
    }

    const whatsappId = whatsappIdParam || (await GetDefaultWhatsApp()).id;
    ticket = await Ticket.create({
      contactId: contact.id,
      status: autoOpen ? "open" : "pending",
      isGroup: queueLocked,
      unreadMessages: 0,
      whatsappId,
      ...(newQueueId ? { queueId: newQueueId } : {})
    });
  } else {
    // 3. Assign queue (never for groups) and open without manual acceptance
    //    (keeps the agent)
    const updates: Record<string, unknown> = {};
    if (!queueLocked && queueId && ticket.queueId !== queueId) {
      updates.queueId = queueId;
    }
    if (autoOpen && ticket.status === "pending") updates.status = "open";
    if (Object.keys(updates).length > 0) await ticket.update(updates);
  }

  let fullTicket = await ShowTicketService(ticket.id);
  emitTicket(fullTicket, oldStatus);

  // 4. Send the message (media with caption, or text)
  try {
    if (media) {
      await SendWhatsAppMedia({ media, ticket: fullTicket, body: body || undefined });
    } else if (body.trim()) {
      await SendWhatsAppMessage({ body, ticket: fullTicket });
    }
  } catch (err: any) {
    logger.error({
      msg: "API v1: failed to send message",
      ticketId: fullTicket.id,
      err: err?.message
    });
    throw new AppError("Falha ao enviar a mensagem pelo WhatsApp", 502);
  }

  fullTicket = await ShowTicketService(ticket.id);

  return res.status(200).json({
    ticketId: fullTicket.id,
    status: fullTicket.status,
    contact: {
      id: fullTicket.contact.id,
      name: fullTicket.contact.name,
      number: fullTicket.contact.number
    },
    whatsappId: fullTicket.whatsappId,
    queueId: fullTicket.queueId ?? null,
    createdAt: fullTicket.createdAt
  });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  const notFound = new AppError(`Ticket #${req.params.ticketId} não encontrado`, 404);
  if (!Number.isInteger(ticketId) || ticketId <= 0) throw notFound;

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] },
      { model: Queue, as: "queue", attributes: ["id", "name"] },
      { association: "user", attributes: ["id", "name"] }
    ]
  });
  if (!ticket) throw notFound;

  return res.status(200).json({
    ticketId: ticket.id,
    status: ticket.status,
    lastMessage: ticket.lastMessage ?? null,
    assignedTo: ticket.user ? { id: ticket.user.id, name: ticket.user.name } : null,
    contact: ticket.contact
      ? { id: ticket.contact.id, name: ticket.contact.name, number: ticket.contact.number }
      : null,
    queueId: ticket.queueId ?? null,
    queue: ticket.queue ? { id: ticket.queue.id, name: ticket.queue.name } : null,
    whatsappId: ticket.whatsappId,
    isGroup: Boolean(ticket.isGroup),
    unreadMessages: ticket.unreadMessages ?? 0,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt
  });
};
