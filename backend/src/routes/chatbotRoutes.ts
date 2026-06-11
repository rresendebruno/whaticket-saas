import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as ChatbotController from "../controllers/ChatbotController";

const chatbotRoutes = Router();

chatbotRoutes.get("/chatbot", isAuth, ChatbotController.show);
chatbotRoutes.put("/chatbot", isAuth, ChatbotController.update);

export default chatbotRoutes;
