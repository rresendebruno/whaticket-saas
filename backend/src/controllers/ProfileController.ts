import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import User from "../models/User";
import ShowUserService from "../services/UserServices/ShowUserService";
import { SerializeUser } from "../helpers/SerializeUser";

const MIN_PASSWORD = 5; // same rule as user creation

// PUT /profile — any logged-in user edits ONLY their own name/password.
// Queues, inbox (whatsappId) and profile are never touched here.
//
// Normal change: requires currentPassword.
// Forced change (mustChangePassword = true, set by an admin): the user just
// logged in with the temporary password, so only newPassword is required.
export const update = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  const { name, currentPassword, newPassword } = req.body as {
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = await User.findByPk(userId);
  if (!user) throw new AppError("ERR_NO_USER_FOUND", 404);

  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 2) throw new AppError("ERR_PROFILE_NAME_TOO_SHORT");
    updates.name = trimmed;
  }

  if (user.mustChangePassword && !newPassword) {
    throw new AppError("ERR_MUST_CHANGE_PASSWORD");
  }

  if (newPassword) {
    if (String(newPassword).length < MIN_PASSWORD) {
      throw new AppError("ERR_PASSWORD_TOO_SHORT");
    }
    if (!user.mustChangePassword) {
      if (!currentPassword || !(await user.checkPassword(currentPassword))) {
        throw new AppError("ERR_INVALID_CURRENT_PASSWORD");
      }
    }
    if (await user.checkPassword(String(newPassword))) {
      throw new AppError("ERR_PASSWORD_SAME_AS_OLD");
    }
    updates.password = String(newPassword);
    updates.mustChangePassword = false;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError("ERR_NOTHING_TO_UPDATE");
  }

  await user.update(updates);

  const fresh = SerializeUser(await ShowUserService(userId));

  // useAuth listens to "user" updates for the logged user -> the forced
  // password screen closes and the new name shows up immediately.
  getIO().emit("user", { action: "update", user: fresh });

  return res.status(200).json(fresh);
};
