import { Request, Response } from "express";
import ImportContactsService from "../services/WbotServices/ImportContactsService";
import ImportGroupsService from "../services/WbotServices/ImportGroupsService";
import AppError from "../errors/AppError";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const userId: number = parseInt(req.user.id);
  await ImportContactsService(userId);

  return res.status(200).json({ message: "contacts imported" });
};

export const storeGroups = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const userId: number = parseInt(req.user.id);
  const result = await ImportGroupsService(userId);

  return res.status(200).json(result);
};
