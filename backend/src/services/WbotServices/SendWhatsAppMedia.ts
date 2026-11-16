import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { whatsappProvider, ProviderMessage } from "../../providers/WhatsApp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

import formatBody from "../../helpers/Mustache";
import convertAudioToMp3, {
  needsMp3Conversion
} from "../../helpers/convertAudioToMp3";
import fs from "fs";
import path from "path";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
  asSticker?: boolean;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body,
  asSticker
}: Request): Promise<ProviderMessage> => {
  try {
    if (!ticket.whatsappId) {
      throw new AppError("ERR_TICKET_NO_WHATSAPP");
    }

    const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

    const hasBody = body
      ? formatBody(body as string, ticket.contact)
      : undefined;

    // Browser recordings come as webm/ogg/m4a — convert to MP3, the format
    // Z-API documents for /send-audio.
    let filePath = media.path;
    let mimetype = media.mimetype;
    let storedFilename = media.filename;
    let displayName = media.originalname || media.filename;
    if (media.path && needsMp3Conversion(media.mimetype)) {
      filePath = await convertAudioToMp3(media.path);
      mimetype = "audio/mpeg";
      storedFilename = path.basename(filePath);
      displayName = displayName.replace(/\.[^.]+$/, "") + ".mp3";
      fs.promises.unlink(media.path).catch(() => {});
      logger.info({ msg: "Audio converted to MP3", from: media.mimetype, file: storedFilename });
    }

    const mediaInput = {
      filename: displayName,
      mimetype,
      path: filePath
    };

    const isSticker = Boolean(asSticker) && media.mimetype.startsWith("image/");

    const mediaOptions = {
      caption: isSticker ? undefined : hasBody,
      sendAudioAsVoice: true,
      sendMediaAsSticker: isSticker,
      sendMediaAsDocument:
        !isSticker &&
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    };

    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );

    const originalName = displayName;
    await ticket.update({
      lastMessage: isSticker ? "[Figurinha]" : body || originalName
    });

    const mediaType = isSticker ? "sticker" : mimetype.split("/")[0];
    const mediaFilename = storedFilename;

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
