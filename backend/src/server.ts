import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { initRedis } from "./libs/redisStore";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import AutoResolveTicketsService from "./services/TicketServices/AutoResolveTicketsService";
import ContactAutoCloseService from "./services/TicketServices/ContactAutoCloseService";

const server = app.listen(process.env.PORT, () => {
  logger.info(`Server started on port: ${process.env.PORT}`);
});

initIO(server);
initRedis();
StartAllWhatsAppsSessions();
gracefulShutdown(server);

// Run auto-resolve check every 15 minutes
setInterval(async () => {
  try {
    await AutoResolveTicketsService();
  } catch (err) {
    logger.error({ msg: "AutoResolve scheduler error", err });
  }
}, 15 * 60 * 1000);

// Run per-contact auto-close check every 5 minutes
setInterval(async () => {
  try {
    await ContactAutoCloseService();
  } catch (err) {
    logger.error({ msg: "ContactAutoClose scheduler error", err });
  }
}, 5 * 60 * 1000);

process.on("uncaughtException", err => {
  logger.error({ info: "Global uncaught exception", err });
});

process.on("unhandledRejection", err => {
  if (err) logger.error({ info: "Global unhandled rejection", err });
});
