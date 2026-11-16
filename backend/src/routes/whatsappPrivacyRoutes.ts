import { Router } from "express";
import isAuth from "../middleware/isAuth";

import * as WhatsappPrivacyController from "../controllers/WhatsappPrivacyController";

const whatsappPrivacyRoutes = Router();

whatsappPrivacyRoutes.get("/whatsapp-privacy", isAuth, WhatsappPrivacyController.index);
whatsappPrivacyRoutes.put("/whatsapp-privacy", isAuth, WhatsappPrivacyController.update);

export default whatsappPrivacyRoutes;
