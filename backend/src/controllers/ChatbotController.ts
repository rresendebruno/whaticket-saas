import { Request, Response } from "express";
import Chatbot from "../models/Chatbot";
import ChatbotOption from "../models/ChatbotOption";
import Queue from "../models/Queue";

export const show = async (req: Request, res: Response): Promise<Response> => {
  let chatbot = await Chatbot.findOne({
    where: { id: 1 },
    include: [{ model: ChatbotOption, as: "options", include: [{ model: Queue, as: "queue", attributes: ["id", "name", "color"] }] }],
    order: [[{ model: ChatbotOption, as: "options" }, "option", "ASC"]]
  });

  if (!chatbot) {
    chatbot = await Chatbot.create({ id: 1, enabled: false, greetingMessage: "" });
  }

  return res.status(200).json(chatbot);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { enabled, greetingMessage, options } = req.body;

  let chatbot = await Chatbot.findByPk(1);
  if (!chatbot) {
    chatbot = await Chatbot.create({ id: 1, enabled: false, greetingMessage: "" });
  }

  await chatbot.update({ enabled, greetingMessage });

  // Replace all options
  await ChatbotOption.destroy({ where: { chatbotId: 1 } });

  if (Array.isArray(options) && options.length > 0) {
    await ChatbotOption.bulkCreate(
      options.map((opt: any) => ({
        chatbotId: 1,
        option: String(opt.option),
        title: opt.title,
        queueId: opt.queueId || null
      }))
    );
  }

  const updated = await Chatbot.findByPk(1, {
    include: [{ model: ChatbotOption, as: "options", include: [{ model: Queue, as: "queue", attributes: ["id", "name", "color"] }] }],
    order: [[{ model: ChatbotOption, as: "options" }, "option", "ASC"]]
  });

  return res.status(200).json(updated);
};
