import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import { whatsappProvider } from "../providers/WhatsApp";

const SetTicketMessagesAsRead = async (ticket: Ticket): Promise<void> => {
  // Find the last received message before marking as read — needed for Z-API sendSeen
  const lastMsg = await Message.findOne({
    where: { ticketId: ticket.id, fromMe: false },
    order: [["createdAt", "DESC"]]
  });

  await Message.update(
    { read: true },
    {
      where: {
        ticketId: ticket.id,
        read: false
      }
    }
  );

  await ticket.update({ unreadMessages: 0 });

  try {
    if (ticket.whatsappId) {
      await whatsappProvider.sendSeen(
        ticket.whatsappId,
        `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`,
        lastMsg?.id
      );
    }
  } catch (err) {
    logger.warn(
      `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
    );
  }

  const io = getIO();
  io.to(ticket.status).to("notification").emit("ticket", {
    action: "updateUnread",
    ticketId: ticket.id
  });
};

export default SetTicketMessagesAsRead;
