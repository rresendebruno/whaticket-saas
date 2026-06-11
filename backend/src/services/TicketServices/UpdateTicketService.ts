import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowTicketService from "./ShowTicketService";

interface TicketData {
  status?: string;
  userId?: number | null;
  queueId?: number | null;
  whatsappId?: number;
  isTransfer?: boolean;
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const UpdateTicketService = async ({
  ticketData,
  ticketId
}: Request): Promise<Response> => {
  const { status, userId, queueId, whatsappId, isTransfer } = ticketData;

  const ticket = await ShowTicketService(ticketId);
  await SetTicketMessagesAsRead(ticket);

  if (whatsappId && ticket.whatsappId !== whatsappId) {
    await CheckContactOpenTickets(ticket.contactId, whatsappId);
  }

  const oldStatus = ticket.status;
  const oldUserId = ticket.user?.id;
  const oldQueueId = ticket.queueId;

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id, ticket.whatsappId);
  }

  await ticket.update({
    status,
    queueId,
    userId
  });

  if (whatsappId) {
    await ticket.update({
      whatsappId
    });
  }

  await ticket.reload();

  const io = getIO();

  if (ticket.status !== oldStatus || ticket.user?.id !== oldUserId) {
    io.to(oldStatus).emit("ticket", {
      action: "delete",
      ticketId: ticket.id
    });
  }

  io.to(ticket.status)
    .to("notification")
    .to(ticketId.toString())
    .emit("ticket", {
      action: "update",
      ticket
    });

  // Send automatic acceptance message when an attendant accepts a pending ticket
  const isAcceptance = !isTransfer && oldStatus === "pending" && status === "open" && userId;
  if (isAcceptance) {
    try {
      const updatedTicket = await ShowTicketService(ticket.id);
      const attendantName = updatedTicket.user?.name;
      if (attendantName) {
        await SendWhatsAppMessage({
          body: `Olá! Seu atendimento foi iniciado pelo atendente *${attendantName}*. Em que posso ajudá-lo?`,
          ticket: updatedTicket
        });
      }
    } catch (err) {
      logger.warn({ msg: "Could not send acceptance message", err });
    }
  }

  // Send automatic transfer message when ticket is explicitly transferred
  if (isTransfer) {
    const queueChanged =
      queueId !== undefined && queueId !== null && queueId !== oldQueueId;
    const userChanged =
      userId !== undefined && userId !== null && userId !== oldUserId;

    if (queueChanged || userChanged) {
      try {
        // Reload with associations to get names
        const updatedTicket = await ShowTicketService(ticket.id);

        let transferMsg = "";
        const newUserName = updatedTicket.user?.name;
        const newQueueName = updatedTicket.queue?.name;

        if (newUserName && newQueueName) {
          transferMsg = `Seu atendimento foi transferido para *${newUserName}* na fila *${newQueueName}*.`;
        } else if (newUserName) {
          transferMsg = `Seu atendimento foi transferido para o atendente *${newUserName}*.`;
        } else if (newQueueName) {
          transferMsg = `Seu atendimento foi encaminhado para a fila *${newQueueName}*. Em breve um atendente irá lhe atender.`;
        }

        if (transferMsg) {
          await SendWhatsAppMessage({ body: transferMsg, ticket: updatedTicket });
        }
      } catch (err) {
        logger.warn({ msg: "Could not send transfer message", err });
      }
    }
  }

  return { ticket, oldStatus, oldUserId };
};

export default UpdateTicketService;
