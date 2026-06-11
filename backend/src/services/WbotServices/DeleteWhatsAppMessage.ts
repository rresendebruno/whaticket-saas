import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { whatsappProvider } from "../../providers/WhatsApp";

const DeleteWhatsAppMessage = async (
  messageId: string,
  deletedByUserId?: number
): Promise<Message> => {
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  if (!message.fromMe) {
    throw new AppError("ERR_DELETE_RECEIVED_MSG", 403);
  }

  const { ticket } = message;

  const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

  await whatsappProvider.deleteMessage(
    ticket.whatsappId,
    chatId,
    message.id,
    message.fromMe
  );

  // Look up who deleted it to store the name in body
  let deletedByName = "Atendente";
  if (deletedByUserId) {
    const user = await User.findByPk(deletedByUserId, { attributes: ["name"] });
    if (user?.name) deletedByName = user.name;
  }

  await message.update({ isDeleted: true, body: `[DELETED_BY:${deletedByName}]${message.body}` });

  return message;
};

export default DeleteWhatsAppMessage;
