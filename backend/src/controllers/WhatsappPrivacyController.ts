import { Request, Response } from "express";

import AppError from "../errors/AppError";
import Setting from "../models/Setting";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../providers/WhatsApp";

type PrivacyKey = "photo" | "lastSeen" | "description" | "online" | "readReceipts";

// Allowed values per setting (from the Z-API docs). CONTACT_BLACKLIST is not
// offered: it needs per-contact block lists, which this screen doesn't manage.
const ALLOWED: Record<PrivacyKey, string[]> = {
  photo: ["ALL", "CONTACTS", "NONE"],
  lastSeen: ["ALL", "CONTACTS", "NONE"],
  description: ["ALL", "CONTACTS", "NONE"],
  online: ["ALL", "SAME_LAST_SEEN"],
  readReceipts: ["enable", "disable"]
};

// Z-API can't report current privacy values, so we store the last value the
// admin applied here. null = never changed through the system.
const settingKey = (key: PrivacyKey): string =>
  `privacy${key.charAt(0).toUpperCase()}${key.slice(1)}`;

const requireAdmin = (req: Request): void => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  requireAdmin(req);

  const keys = Object.keys(ALLOWED) as PrivacyKey[];
  const rows = await Setting.findAll({ where: { key: keys.map(settingKey) } });
  const byKey = new Map(rows.map(r => [r.key, r.value]));

  const values: Record<string, string | null> = {};
  keys.forEach(k => {
    values[k] = byKey.get(settingKey(k)) ?? null;
  });

  return res.json({
    supported: Boolean(whatsappProvider.setPrivacy),
    values
  });
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  requireAdmin(req);

  const { setting, value } = req.body as { setting: PrivacyKey; value: string };
  if (!ALLOWED[setting] || !ALLOWED[setting].includes(value)) {
    throw new AppError("ERR_INVALID_PRIVACY_SETTING");
  }
  if (!whatsappProvider.setPrivacy) {
    throw new AppError("ERR_PRIVACY_NOT_SUPPORTED");
  }

  const whatsapp = await GetDefaultWhatsApp(Number(req.user.id));

  try {
    await whatsappProvider.setPrivacy(whatsapp.id, setting, value);
  } catch {
    throw new AppError("ERR_UPDATING_PRIVACY");
  }

  const key = settingKey(setting);
  const existing = await Setting.findByPk(key);
  if (existing) {
    await existing.update({ value });
  } else {
    await Setting.create({ key, value });
  }

  return res.json({ setting, value });
};
