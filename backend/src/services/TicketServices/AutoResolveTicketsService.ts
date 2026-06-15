import { Op } from "sequelize";
import Setting from "../../models/Setting";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowTicketService from "./ShowTicketService";

const AutoResolveTicketsService = async (): Promise<void> => {
  const setting = await Setting.findOne({ where: { key: "autoResolveTimeout" } });
  const hours = parseInt(setting?.value || "0", 10);

  if (!hours || hours <= 0) return;

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Exclude group/community tickets (isGroup contacts)
  const tickets = await Ticket.findAll({
    where: {
      status: { [Op.in]: ["open", "pending"] },
      updatedAt: { [Op.lt]: cutoff }
    },
    include: [
      {
        model: Contact,
        as: "contact",
        where: { isGroup: false },
        attributes: ["id", "isGroup"]
      }
    ]
  });

  if (tickets.length === 0) return;

  const io = getIO();
  let closed = 0;

  for (const ticket of tickets) {
    try {
      // Load full ticket (with whatsapp/contact associations) to send message
      const fullTicket = await ShowTicketService(ticket.id);

      try {
        await SendWhatsAppMessage({
          body: "Seu atendimento foi encerrado automaticamente por *inatividade*. Caso precise de ajuda, entre em contato novamente.",
          ticket: fullTicket
        });
      } catch (msgErr) {
        logger.warn({ msg: "AutoResolve: could not send inactivity message", ticketId: ticket.id, err: msgErr });
      }

      await ticket.update({ status: "closed" });

      io.to("open")
        .to("pending")
        .to("notification")
        .to(ticket.id.toString())
        .emit("ticket", { action: "update", ticket });

      closed++;
    } catch (err) {
      logger.error({ msg: "AutoResolve: error processing ticket", ticketId: ticket.id, err });
    }
  }

  if (closed > 0) {
    logger.info({ msg: "AutoResolve: closed inactive tickets", count: closed, inactiveHours: hours });
  }
};

export default AutoResolveTicketsService;
