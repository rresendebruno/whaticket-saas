import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import ShowUserService from "./ShowUserService";

interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  queueIds?: number[];
  whatsappId?: number;
  mustChangePassword?: boolean;
}

interface Request {
  userData: UserData;
  userId: string | number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
}

const UpdateUserService = async ({
  userData,
  userId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId);

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string()
  });

  const {
    email,
    password,
    profile,
    name,
    queueIds,
    whatsappId,
    mustChangePassword
  } = userData;

  try {
    await schema.validate({ email, password, profile, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  // Only touch fields that were actually sent. A partial update (e.g. just a
  // new password) must NOT wipe the user's queues or inbox (whatsappId).
  const updates: Record<string, unknown> = {};
  if (email !== undefined) updates.email = email;
  if (name !== undefined) updates.name = name;
  if (profile !== undefined) updates.profile = profile;
  if (password) updates.password = password; // empty = keep current password
  if (mustChangePassword !== undefined) {
    updates.mustChangePassword = Boolean(mustChangePassword);
  }
  if (whatsappId !== undefined) {
    updates.whatsappId = whatsappId ? whatsappId : null;
  }

  await user.update(updates);

  if (Array.isArray(queueIds)) {
    await user.$set("queues", queueIds);
  }

  await user.reload();

  return SerializeUser(user);
};

export default UpdateUserService;
