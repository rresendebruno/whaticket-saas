import { Router, Request, Response } from "express";
import multer from "multer";
import uploadConfig from "../config/upload";

import isAuthApiV1 from "../middleware/isAuthApiV1";
import * as ExternalTicketController from "../controllers/ExternalTicketController";

// External integration API v1. Mounted at "/api/v1" in routes/index.ts —
// NOT under "/api/messages" (that mistake caused the 404 of 03/08/2026).
// Guarded by src/__tests__/apiV1Routes.spec.ts.
const upload = multer(uploadConfig);

const apiV1Routes = Router();

// multer only acts on multipart/form-data; JSON bodies pass straight through
apiV1Routes.post(
  "/ticket",
  isAuthApiV1,
  upload.single("media"),
  ExternalTicketController.store
);

apiV1Routes.get("/ticket/:ticketId", isAuthApiV1, ExternalTicketController.show);

// Unknown /api/v1/* paths answer JSON instead of Express' HTML page
apiV1Routes.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

export default apiV1Routes;
