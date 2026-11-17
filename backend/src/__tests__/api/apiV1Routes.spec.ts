/**
 * Guard against the regression of 03/08/2026 and 16/11/2026:
 * POST /api/v1/ticket answered 404 "Cannot POST /api/v1/ticket" because the
 * v1 routes were mounted under /api/messages, and later lost entirely.
 *
 * Uses the real routes/index.ts. No database or WhatsApp needed: the token
 * lookup is mocked and the requests stop at validation.
 *
 * Run:  npx jest src/__tests__/api
 */
// The WhatsApp providers pull in puppeteer/baileys, which Jest 26 can't load
// ("node:" imports). These tests never send messages, so stub them out.
jest.mock("../../providers/WhatsApp", () => ({ whatsappProvider: {} }));
jest.mock("../../providers/WhatsApp/whatsappProvider", () => ({
  whatsappProvider: {}
}));

import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

import routes from "../../routes";
import AppError from "../../errors/AppError";
import Setting from "../../models/Setting";

const API_TOKEN = "test-api-token";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(routes);
  // same error contract as src/app.ts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  });
  return app;
};

describe("External API v1 routes", () => {
  const app = buildApp();

  beforeEach(() => {
    jest
      .spyOn(Setting, "findByPk")
      .mockResolvedValue({ key: "userApiToken", value: API_TOKEN } as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it("POST /api/v1/ticket is registered (401 without token, never 404)", async () => {
    const res = await request(app).post("/api/v1/ticket").send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/ticket/:ticketId is registered (401 without token)", async () => {
    const res = await request(app).get("/api/v1/ticket/1");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects an invalid token with 401 JSON", async () => {
    const res = await request(app)
      .post("/api/v1/ticket")
      .set("Authorization", "Bearer wrong-token")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Token de API inválido" });
  });

  it("does not accept other settings' values as token (e.g. 'enabled')", async () => {
    const res = await request(app)
      .post("/api/v1/ticket")
      .set("Authorization", "Bearer enabled")
      .send({ number: "5562999887766" });
    expect(res.status).toBe(401);
  });

  it("valid token reaches the controller (400 JSON when number is missing)", async () => {
    const res = await request(app)
      .post("/api/v1/ticket")
      .set("Authorization", `Bearer ${API_TOKEN}`)
      .send({ name: "Fornecedor X" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Campo "number" é obrigatório' });
  });

  it("is NOT mounted under /api/messages (the 03/08/2026 bug)", async () => {
    const res = await request(app)
      .post("/api/messages/v1/ticket")
      .set("Authorization", `Bearer ${API_TOKEN}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("legacy POST /api/messages/send is still registered", async () => {
    const res = await request(app).post("/api/messages/send").send({});
    expect(res.status).not.toBe(404);
  });
});
