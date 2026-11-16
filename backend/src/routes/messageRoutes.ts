import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import uploadConfig from "../config/upload";

import * as MessageController from "../controllers/MessageController";

const messageRoutes = Router();

const upload = multer(uploadConfig);

messageRoutes.get("/messages/:ticketId", isAuth, MessageController.index);
messageRoutes.get("/messages/:ticketId/group-members", isAuth, MessageController.groupMembers);

messageRoutes.post("/messages/:ticketId/contact", isAuth, MessageController.sendContact);

messageRoutes.post(
  "/messages/:ticketId",
  isAuth,
  upload.array("medias"),
  MessageController.store
);

messageRoutes.delete("/messages/:messageId", isAuth, MessageController.remove);

messageRoutes.post("/messages/:messageId/forward", isAuth, MessageController.forward);

messageRoutes.post("/messages/:messageId/reactions", isAuth, MessageController.react);
messageRoutes.delete("/messages/:messageId/reactions", isAuth, MessageController.unreact);

export default messageRoutes;
