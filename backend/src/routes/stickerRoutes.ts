import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import uploadConfig from "../config/upload";

import * as StickerController from "../controllers/StickerController";

const stickerRoutes = Router();

const upload = multer(uploadConfig);

stickerRoutes.get("/stickers", isAuth, StickerController.index);

stickerRoutes.post(
  "/stickers",
  isAuth,
  upload.single("sticker"),
  StickerController.upload
);

stickerRoutes.post(
  "/stickers/from-message/:messageId",
  isAuth,
  StickerController.storeFromMessage
);

stickerRoutes.post(
  "/stickers/:stickerId/send/:ticketId",
  isAuth,
  StickerController.send
);

stickerRoutes.delete("/stickers/:stickerId", isAuth, StickerController.remove);

export default stickerRoutes;
