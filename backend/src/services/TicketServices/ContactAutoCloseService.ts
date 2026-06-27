import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowTicketService from "./ShowTicketService";

const ContactAutoCloseService = async (): Promise<void> => {
  // Busca contatos com auto-encerramento configurado
  const contacts = await Contact.findAll({
    where: {
      autoCloseMinutes: { [Op.gt]: 0 },
      isGroup: false
    },
    attributes: ["id", "autoCloseMinutes"]
  });

  if (contacts.length === 0) return;

  const io = getIO();
  let closed = 0;

  for (const contact of contacts) {
    const cutoff = new Date(
      Date.now() - contact.autoCloseMinutes * 60 * 1000
    );

    const tickets = await Ticket.findAll({
      where: {
        contactId: contact.id,
        status: { [Op.in]: ["open", "pending"] },
        updatedAt: { [Op.lt]: cutoff }
      }
    });

    for (const ticket of tickets) {
      try {
        const fullTicket = await ShowTicketService(ticket.id);

        try {
          await SendWhatsAppMessage({
            body: `Seu atendimento foi encerrado automaticamente após ${contact.autoCloseMinutes} minuto(s) de inatividade. Se precisar de ajuda, entre em contato novamente.`,
            ticket: fullTicket
          });
        } catch (msgErr) {
          logger.warn({
            msg: "ContactAutoClose: could not send message",
            ticketId: ticket.id,
            err: msgErr
          });
        }

        await ticket.update({ status: "closed" });

        io.to("open")
          .to("pending")
          .to("notification")
          .to(ticket.id.toString())
          .emit("ticket", { action: "update", ticket });

        closed++;
      } catch (err) {
        logger.error({
          msg: "ContactAutoClose: error processing ticket",
          ticketId: ticket.id,
          err
        });
      }
    }
  }

  if (closed > 0) {
    logger.info({ msg: "ContactAutoClose: closed tickets", count: closed });
  }
};

export default ContactAutoCloseService;
