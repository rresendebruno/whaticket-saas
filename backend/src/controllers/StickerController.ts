import { Request, Response } from "express";
import { createHash } from "crypto";
import { promises as fsp } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import uploadConfig from "../config/upload";
import Sticker from "../models/Sticker";
import Message from "../models/Message";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { logger } from "../utils/logger";

const publicFolder = uploadConfig.directory;

const MIME_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif"
};

const extOf = (filename: string): string =>
  path.extname(filename).replace(".", "").toLowerCase() || "webp";

const hashFile = async (filePath: string): Promise<string> => {
  const data = await fsp.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
};

const emitCreate = (sticker: Sticker): void => {
  getIO().emit("sticker", { action: "create", sticker });
};

export const index = async (_req: Request, res: Response): Promise<Response> => {
  const stickers = await Sticker.findAll({ order: [["createdAt", "DESC"]] });
  return res.json(stickers);
};

// Save a received (or sent) sticker message to the shared gallery
export const storeFromMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;

  const message = await Message.findByPk(messageId);
  const rawFilename = message?.getDataValue("mediaUrl") as string | undefined;
  if (!message || !rawFilename) throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);

  const sourcePath = path.join(publicFolder, path.basename(rawFilename));
  let hash: string;
  try {
    hash = await hashFile(sourcePath);
  } catch {
    throw new AppError("ERR_STICKER_FILE_NOT_FOUND", 404);
  }

  const existing = await Sticker.findOne({ where: { hash } });
  if (existing) return res.status(200).json({ ...existing.toJSON(), alreadySaved: true });

  const ext = extOf(rawFilename);
  const filename = `sticker-${uuidv4()}.${ext}`;
  await fsp.copyFile(sourcePath, path.join(publicFolder, filename));

  const sticker = await Sticker.create({
    filename,
    mimetype: MIME_BY_EXT[ext] || "image/webp",
    hash,
    userId: Number(req.user.id)
  });

  emitCreate(sticker);
  return res.status(201).json(sticker);
};

// Add a sticker by uploading an image file
export const upload = async (req: Request, res: Response): Promise<Response> => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError("ERR_NO_FILE");

  if (!file.mimetype.startsWith("image/")) {
    await fsp.unlink(file.path).catch(() => {});
    throw new AppError("ERR_STICKER_MUST_BE_IMAGE");
  }

  const hash = await hashFile(file.path);
  const existing = await Sticker.findOne({ where: { hash } });
  if (existing) {
    await fsp.unlink(file.path).catch(() => {});
    return res.status(200).json({ ...existing.toJSON(), alreadySaved: true });
  }

  const filename = `sticker-${uuidv4()}.${extOf(file.originalname)}`;
  await fsp.rename(file.path, path.join(publicFolder, filename));

  const sticker = await Sticker.create({
    filename,
    mimetype: file.mimetype,
    hash,
    userId: Number(req.user.id)
  });

  emitCreate(sticker);
  return res.status(201).json(sticker);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { stickerId } = req.params;
  const sticker = await Sticker.findByPk(stickerId);
  if (!sticker) throw new AppError("ERR_STICKER_NOT_FOUND", 404);

  await sticker.destroy();
  await fsp
    .unlink(path.join(publicFolder, sticker.filename))
    .catch(err => logger.warn({ msg: "Could not delete sticker file", err }));

  getIO().emit("sticker", { action: "delete", stickerId: Number(stickerId) });
  return res.status(200).json({ message: "Sticker deleted" });
};

// Send a saved sticker to a ticket
export const send = async (req: Request, res: Response): Promise<Response> => {
  const { stickerId, ticketId } = req.params;

  const sticker = await Sticker.findByPk(stickerId);
  if (!sticker) throw new AppError("ERR_STICKER_NOT_FOUND", 404);

  const ticket = await ShowTicketService(ticketId);
  SetTicketMessagesAsRead(ticket);

  // Copy the file so the chat message keeps working even if the sticker is
  // later removed from the gallery
  const ext = extOf(sticker.filename);
  const copyName = `${uuidv4()}.${ext}`;
  const copyPath = path.join(publicFolder, copyName);
  await fsp.copyFile(path.join(publicFolder, sticker.filename), copyPath);

  const media = {
    originalname: copyName,
    filename: copyName,
    mimetype: sticker.mimetype,
    path: copyPath
  } as Express.Multer.File;

  await SendWhatsAppMedia({ media, ticket, asSticker: true });

  return res.send();
};
