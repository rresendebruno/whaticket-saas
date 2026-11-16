import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import MessageReaction from "../../models/MessageReaction";

interface Request {
  messageId: string;
  senderNumber: string; // "me" for our own WhatsApp number
  emoji: string; // empty string = reaction removed
  fromMe: boolean;
  senderName?: string;
  userId?: number | null;
}

// Saves (or removes, when emoji is empty) one person's reaction to a message
// and pushes the updated message to everyone viewing that ticket.
const SetMessageReactionService = async ({
  messageId,
  senderNumber,
  emoji,
  fromMe,
  senderName,
  userId
}: Request): Promise<Message | null> => {
  const message = await Message.findByPk(messageId);
  if (!message) return null;

  if (!emoji) {
    await MessageReaction.destroy({ where: { messageId, senderNumber } });
  } else {
    const existing = await MessageReaction.findOne({
      where: { messageId, senderNumber }
    });
    if (existing) {
      await existing.update({ emoji, senderName, userId: userId ?? null });
    } else {
      await MessageReaction.create({
        messageId,
        senderNumber,
        emoji,
        fromMe,
        senderName,
        userId: userId ?? null
      });
    }
  }

  const updated = await Message.findByPk(messageId, {
    include: [
      "contact",
      "reactions",
      { model: Message, as: "quotedMsg", include: ["contact"] }
    ]
  });

  if (updated) {
    getIO()
      .to(updated.ticketId.toString())
      .emit("appMessage", { action: "update", message: updated });
  }

  return updated;
};

export default SetMessageReactionService;
