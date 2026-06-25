import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";
import jwt from "jsonwebtoken";

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import zapiRoutes from "./routes/zapiRoutes";
import { logger } from "./utils/logger";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

app.use(
  cors({
    credentials: true,
    origin: process.env.FRONTEND_URL
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(Sentry.Handlers.requestHandler());
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path} origin=${req.headers.origin || "-"}`);
  next();
});
app.use("/public", (req: Request, res: Response, next: NextFunction) => {
  // Accept token from query param (native <audio>/<video>/<a href>) or Authorization header (Axios/fetch)
  const queryToken = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = queryToken || headerToken;
  if (!token) return res.sendStatus(401);
  try {
    jwt.verify(token, process.env.JWT_SECRET as string);
    next();
  } catch {
    res.sendStatus(403);
  }
}, express.static(uploadConfig.directory));
app.use(zapiRoutes); // public — no auth, called by Z-API
app.use(routes);

app.use(Sentry.Handlers.errorHandler());

app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
