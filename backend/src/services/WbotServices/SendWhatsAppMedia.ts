import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

import formatBody from "../../helpers/Mustache";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body
}: Request): Promise<ProviderMessage> => {
  try {
    if (!ticket.whatsappId) {
      throw new AppError("ERR_TICKET_NO_WHATSAPP");
    }

    const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

    const hasBody = body
      ? formatBody(body as string, ticket.contact)
      : undefined;

    const mediaInput = {
      filename: media.originalname || media.filename,
      mimetype: media.mimetype,
      path: media.path
    };

    const mediaOptions = {
      caption: hasBody,
      sendAudioAsVoice: true,
      sendMediaAsDocument:
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    };

    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );

    const originalName = media.originalname || media.filename;
    await ticket.update({ lastMessage: body || originalName });

    const [mediaType] = media.mimetype.split("/");
    const mediaFilename = media.filename;

    await CreateMessageService({
      messageData: {
        id: sentMessage.id,
        ticketId: ticket.id,
        body: hasBody || originalName,
        fromMe: true,
        read: true,
        mediaType,
        mediaUrl: mediaFilename,
        ack: 1
      }
    });

    return sentMessage;
  } catch (err: any) {
    const zapiError = err?.response?.data || err?.message || err;
    logger.error({ msg: "SendWhatsAppMedia error", zapiError });
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
