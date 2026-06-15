import { Op } from "sequelize";
import Setting from "../../models/Setting";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

const AutoResolveTicketsService = async (): Promise<void> => {
  const setting = await Setting.findOne({ where: { key: "autoResolveTimeout" } });
  const hours = parseInt(setting?.value || "0", 10);

  if (!hours || hours <= 0) return;

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const tickets = await Ticket.findAll({
    where: {
      status: { [Op.in]: ["open", "pending"] },
      updatedAt: { [Op.lt]: cutoff }
    }
  });

  if (tickets.length === 0) return;

  const io = getIO();

  for (const ticket of tickets) {
    await ticket.update({ status: "closed" });

    io.to("open")
      .to("pending")
      .to("notification")
      .to(ticket.id.toString())
      .emit("ticket", { action: "update", ticket });
  }

  logger.info({ msg: "AutoResolve: closed inactive tickets", count: tickets.length, inactiveHours: hours });
};

export default AutoResolveTicketsService;
