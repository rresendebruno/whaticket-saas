import { Request, Response, NextFunction } from "express";

import Setting from "../models/Setting";

// Auth for the external API v1 (/api/v1/*).
//
// Differences from the legacy isAuthApi (kept untouched for /api/messages/send):
// - only the "userApiToken" setting is accepted (the legacy lookup matched ANY
//   setting value, so e.g. "Bearer enabled" was accepted);
// - missing or invalid token always answers 401 JSON (legacy answered 403).
const isAuthApiV1 = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (!token || !/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ error: "Token de API ausente" });
  }

  const apiToken = await Setting.findByPk("userApiToken");

  if (!apiToken?.value || apiToken.value !== token) {
    return res.status(401).json({ error: "Token de API inválido" });
  }

  return next();
};

export default isAuthApiV1;
