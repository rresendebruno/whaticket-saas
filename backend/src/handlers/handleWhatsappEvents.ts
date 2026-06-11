import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import * as Sentry from "@sentry/node";
import axios from "axios";

import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import { debounce } from "../helpers/Debounce";
import formatBody from "../helpers/Mustache";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Message from "../models/Message";

import CreateMessageService from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import CreateContactService from "../services/ContactServices/CreateContactService";

import { whatsappProvider } from "../providers/WhatsApp/whatsappProvider";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";

const writeFileAsync = promisify(writeFile);

export interface ContactPayload {
  name: string;
  number: string;
  lid?: string;
  profilePicUrl?: string;
  isGroup: boolean;
}

export interface MessagePayload {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  quotedMsgId?: string;
  mediaUrl?: string;
  mediaType?: string;
  ack?: MessageAck;
}

export interface MediaPayload {
  filename: string;
  mimetype: string;
  data: string;
}

export interface WhatsappContextPayload {
  whatsappId: number;
  unreadMessages: number;
  groupContact?: ContactPayload;
}

const makeRandomId = (length: number): string => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

const processLocationMessage = (
  messagePayload: MessagePayload
): MessagePayload => {
  if (messagePayload.type !== "location") return messagePayload;

  return messagePayload;
};

const saveMediaFile = async (mediaPayload: MediaPayload): Promise<string> => {
  const randomId = makeRandomId(5);
  const { filename: originalFilename } = mediaPayload;

  let filename: string;
  if (!originalFilename) {
    const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
    filename = `${randomId}-${new Date().getTime()}.${extension}`;
  } else {
    const baseName = originalFilename.split(".").slice(0, -1).join(".");
    const extension = originalFilename.split(".").slice(-1)[0];
    filename = `${baseName}.${randomId}.${extension}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "public", filename),
      mediaPayload.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  return filename;
};

const processVcardMessage = async (
  messagePayload: MessagePayload
): Promise<void> => {
  if (messagePayload.type !== "vcard") return;

  try {
    const array = messagePayload.body.split("\n");
    const phoneNumbers: Array<{ number: string }> = [];
    let contactName = "";

    array.forEach(line => {
      const values = line.split(":");
      values.forEach((value, index) => {
        if (value.indexOf("+") !== -1) {
          phoneNumbers.push({ number: value });
        }
        if (value.indexOf("FN") !== -1 && values[index + 1]) {
          contactName = values[index + 1];
        }
      });
    });

    await Promise.all(
      phoneNumbers.map(({ number }) =>
        CreateContactService({
          name: contactName,
          number: number.replace(/\D/g, "")
        })
      )
    );
  } catch (error) {
    logger.error("Error processing vcard message:", error);
  }
};

const zapiChatbotPost = async (path: string, body: object): Promise<string> => {
  const id = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || "";
  if (!id || !token) return "";
  const url = `https://api.z-api.io/instances/${id}/token/${token}${path}`;
  try {
    const { data } = await axios.post(url, body, {
      headers: { "Content-Type": "application/json", "Client-Token": clientToken }
    });
    logger.info({ msg: "zapiChatbotPost ok", path, response: data });
    return data?.messageId || data?.id || `chatbot-${Date.now()}`;
  } catch (err: any) {
    logger.error({ msg: "zapiChatbotPost error", path, zapiError: err?.response?.data || err?.message });
    throw err;
  }
};

const sendChatbotMenu = async (
  phone: string,
  greetingMessage: string,
  options: Array<{ option: string; title: string }>,
  ticket: Ticket
): Promise<void> => {
  const isZapi = (process.env.WHATSAPP_PROVIDER || "wwebjs") === "zapi";
  let messageId = "";

  if (isZapi && options.length <= 3) {
    messageId = await zapiChatbotPost("/send-button-actions", {
      phone,
      message: greetingMessage,
      buttonActions: options.map(opt => ({
        id: opt.option,
        type: "REPLY",
        label: opt.title
      }))
    });
  } else if (isZapi && options.length <= 10) {
    messageId = await zapiChatbotPost("/send-option-list", {
      phone,
      message: greetingMessage,
      optionList: {
        title: "Opções de atendimento",
        buttonLabel: "Ver opções",
        options: options.map(opt => ({ id: opt.option, title: opt.title, description: "" }))
      }
    });
  } else {
    // Fallback: numbered text
    let optionsList = "";
    options.forEach(opt => { optionsList += `*${opt.option}* - ${opt.title}\n`; });
    const body = greetingMessage ? `${greetingMessage}\n\n${optionsList}` : optionsList;
    const sent = await whatsappProvider.sendMessage(0, `${phone}@c.us`, `‎${body}`);
    messageId = sent?.id || `chatbot-${Date.now()}`;
  }

  // Save chatbot menu message to DB so it appears in the conversation
  if (messageId) {
    try {
      await CreateMessageService({
        messageData: {
          id: messageId,
          ticketId: ticket.id,
          body: greetingMessage,
          fromMe: true,
          read: true,
          mediaType: "chat",
          ack: 1
        }
      });
      await ticket.update({ lastMessage: greetingMessage });
    } catch (err) {
      logger.error({ msg: "Chatbot: error saving menu message to DB", err });
    }
  }
};

const handleChatbotLogic = async (
  whatsappId: number,
  messageBody: string,
  ticket: Ticket,
  contactPayload: ContactPayload
): Promise<boolean> => {
  try {
    const Chatbot = (await import("../models/Chatbot")).default;
    const ChatbotOption = (await import("../models/ChatbotOption")).default;
    const Queue = (await import("../models/Queue")).default;

    const chatbot = await Chatbot.findByPk(1, {
      include: [{ model: ChatbotOption, as: "options", include: [{ model: Queue, as: "queue" }] }],
      order: [[{ model: ChatbotOption, as: "options" }, "option", "ASC"]]
    });

    logger.info({ msg: "Chatbot: found", enabled: chatbot?.enabled, options: chatbot?.options?.length });
    if (!chatbot || !chatbot.enabled || !chatbot.options?.length) return false;

    const input = (messageBody || "").trim();
    logger.info({ msg: "Chatbot: input received", input, ticketId: ticket.id });

    // Match by option id (e.g. "1") OR by title (e.g. "Financeiro") — case insensitive
    const matched = chatbot.options.find(opt => {
      const optStr = String(opt.option || "").trim();
      const titleStr = String(opt.title || "").trim();
      const inputLower = input.toLowerCase();
      return (
        optStr === input ||
        optStr.toLowerCase() === inputLower ||
        titleStr.toLowerCase() === inputLower
      );
    });

    logger.info({
      msg: "Chatbot: matching",
      input,
      expectedOptions: chatbot.options.map(o => `${o.option}|${o.title}`),
      matched: matched ? `${matched.option}|${matched.title}` : null,
      matchedQueueId: matched?.queueId || null
    });

    if (matched && matched.queueId) {
      await UpdateTicketService({
        ticketData: { queueId: matched.queueId, status: "pending" },
        ticketId: ticket.id
      });

      // Always send a confirmation — use greetingMessage if configured, otherwise default
      const queueName = matched.queue?.name || "atendimento";
      const greetMsg = matched.queue?.greetingMessage?.trim()
        || `Você selecionou *${queueName}*.\n\nPor favor, aguarde um momento. Em breve um de nossos atendentes irá lhe atender. 😊`;

      try {
        const sentGreeting = await whatsappProvider.sendMessage(
          whatsappId,
          `${contactPayload.number}@c.us`,
          `‎${greetMsg}`
        );
        await CreateMessageService({
          messageData: {
            id: sentGreeting?.id || `chatbot-${Date.now()}`,
            ticketId: ticket.id,
            body: greetMsg,
            fromMe: true,
            read: true,
            mediaType: "chat",
            ack: 1
          }
        });
        await ticket.update({ lastMessage: greetMsg });
      } catch (err) {
        logger.error("Chatbot: error sending queue greeting", err);
      }
    } else {
      const optionsList = chatbot.options.map(opt => ({ option: opt.option, title: opt.title }));
      const greeting = chatbot.greetingMessage || "Olá! Como posso ajudar?";

      const debouncedSend = debounce(
        async () => {
          try {
            await sendChatbotMenu(contactPayload.number, greeting, optionsList, ticket);
          } catch (err) {
            logger.error("Chatbot: error sending menu", err);
          }
        },
        3000,
        ticket.id
      );

      debouncedSend();
    }

    return true;
  } catch (err) {
    logger.error("Chatbot logic error", err);
    return false;
  }
};

const handleQueueLogic = async (
  whatsappId: number,
  messageBody: string,
  ticket: Ticket,
  contactPayload: ContactPayload
): Promise<void> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(whatsappId);

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });
    return;
  }

  const selectedOption = messageBody;
  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id
    });

    const body = formatBody(
      `\u200e${choosenQueue.greetingMessage}`,
      contactPayload as any
    );

    try {
      await whatsappProvider.sendMessage(
        whatsappId,
        `${contactPayload.number}@c.us`,
        body
      );
    } catch (error) {
      logger.error("Error sending queue greeting message:", error);
    }
  } else {
    let options = "";
    queues.forEach((queue, index) => {
      options += `*${index + 1}* - ${queue.name}\n`;
    });

    const body = formatBody(
      `\u200e${greetingMessage}\n${options}`,
      contactPayload as any
    );

    const debouncedSentMessage = debounce(
      async () => {
        try {
          await whatsappProvider.sendMessage(
            whatsappId,
            `${contactPayload.number}@c.us`,
            body
          );
        } catch (error) {
          logger.error("Error sending queue options message:", error);
        }
      },
      3000,
      ticket.id
    );

    debouncedSentMessage();
  }
};

export const handleMessage = async (
  messagePayload: MessagePayload,
  contactPayload: ContactPayload,
  contextPayload: WhatsappContextPayload,
  mediaPayload?: MediaPayload
): Promise<void> => {
  try {
    const processedMessage = processLocationMessage(messagePayload);

    const contact = await CreateOrUpdateContactService({
      name: contactPayload.name,
      number: contactPayload.number,
      lid: contactPayload.lid,
      profilePicUrl: contactPayload.profilePicUrl,
      isGroup: contactPayload.isGroup
    });

    // If no photo came from the webhook, fetch from Z-API asynchronously (fire-and-forget)
    if (!contact.profilePicUrl && !contactPayload.isGroup) {
      whatsappProvider.getProfilePicUrl(contextPayload.whatsappId, contactPayload.number)
        .then(url => { if (url) contact.update({ profilePicUrl: url }); })
        .catch(() => {});
    }

    let groupContact: Contact | undefined;
    if (contextPayload.groupContact) {
      groupContact = await CreateOrUpdateContactService({
        name: contextPayload.groupContact.name,
        number: contextPayload.groupContact.number,
        lid: contextPayload.groupContact.lid,
        profilePicUrl: contextPayload.groupContact.profilePicUrl,
        isGroup: contextPayload.groupContact.isGroup
      });

      // Fetch group photo if missing
      if (!groupContact.profilePicUrl) {
        whatsappProvider.getProfilePicUrl(contextPayload.whatsappId, contextPayload.groupContact.number)
          .then(url => { if (url) groupContact!.update({ profilePicUrl: url }); })
          .catch(() => {});
      }
    }

    const whatsapp = await ShowWhatsAppService(contextPayload.whatsappId);
    if (
      contextPayload.unreadMessages === 0 &&
      whatsapp.farewellMessage &&
      formatBody(whatsapp.farewellMessage, contact) === processedMessage.body
    ) {
      return;
    }

    const ticket = await FindOrCreateTicketService(
      contact,
      contextPayload.whatsappId,
      contextPayload.unreadMessages,
      groupContact
    );

    const messageData: any = {
      id: processedMessage.id,
      ticketId: ticket.id,
      contactId: processedMessage.fromMe ? undefined : contact.id,
      body: processedMessage.body,
      fromMe: processedMessage.fromMe,
      read: processedMessage.fromMe,
      mediaType: processedMessage.type,
      quotedMsgId: processedMessage.quotedMsgId,
      ack: processedMessage.ack !== undefined ? processedMessage.ack : 0
    };

    if (mediaPayload && processedMessage.hasMedia) {
      const filename = await saveMediaFile(mediaPayload);
      messageData.mediaUrl = filename;
      messageData.body = processedMessage.body || filename;
      const [mediaType] = mediaPayload.mimetype.split("/");
      messageData.mediaType = mediaType;
    }

    let lastMessageText = "";
    if (processedMessage.type === "location") {
      lastMessageText = processedMessage.body.includes("Localization")
        ? processedMessage.body
        : "Localization";
    } else {
      lastMessageText = processedMessage.body || mediaPayload?.filename || "";
    }

    await ticket.update({ lastMessage: lastMessageText });

    await CreateMessageService({ messageData });

    await processVcardMessage(processedMessage);

    const isGroupMessage = ticket.isGroup || Boolean(contextPayload.groupContact);

    // Auto-assign groups/communities to the designated group queue
    if (isGroupMessage && !ticket.queue && !processedMessage.fromMe) {
      try {
        const Queue = (await import("../models/Queue")).default;
        const groupQueue = await Queue.findOne({ where: { isGroupQueue: true } });
        if (groupQueue) {
          await UpdateTicketService({
            ticketData: { queueId: groupQueue.id, status: "open" },
            ticketId: ticket.id
          });
        }
      } catch (err) {
        logger.error("Error auto-assigning group queue", err);
      }
    }

    if (
      !isGroupMessage &&
      !ticket.queueId &&   // queueId is always populated even without eager-loading
      !ticket.queue &&
      !processedMessage.fromMe &&
      !ticket.userId
    ) {
      const handledByChatbot = await handleChatbotLogic(
        contextPayload.whatsappId,
        processedMessage.body,
        ticket,
        contactPayload
      );

      if (!handledByChatbot && whatsapp.queues.length >= 1) {
        await handleQueueLogic(
          contextPayload.whatsappId,
          processedMessage.body,
          ticket,
          contactPayload
        );
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error({
      info: "Error handling message",
      err,
      messagePayload,
      contactPayload,
      contextPayload,
      mediaPayload
    });
  }
};

export const handleMessageAck = async (
  messageId: string,
  ack: MessageAck
): Promise<void> => {
  await new Promise(r => setTimeout(r, 500));

  const io = getIO();

  try {
    const messageToUpdate = await Message.findByPk(messageId, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) {
      logger.warn({ msg: "handleMessageAck: message not found in DB", messageId, ack });
      return;
    }

    await messageToUpdate.update({ ack });

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack: ${err}`);
  }
};
