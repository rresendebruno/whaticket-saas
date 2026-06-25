import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";

let io: SocketIO;

// socketId → userId (string). Um usuário pode ter múltiplas abas abertas.
const onlineSockets = new Map<string, string>();

export const getOnlineUserIds = (): string[] =>
  Array.from(new Set(onlineSockets.values()));

export const initIO = (httpServer: Server): SocketIO => {
  const allowedOrigin = process.env.FRONTEND_URL;

  io = new SocketIO(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        // Allow configured frontend origin
        if (!allowedOrigin || origin === allowedOrigin) return callback(null, true);
        // Allow localhost for development
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true
    },
    // Increase timeouts so Traefik/nginx proxies don't kill idle WebSocket connections
    pingTimeout: 60000,
    pingInterval: 25000,
    // Allow both transports; WebSocket first, polling as fallback
    transports: ["websocket", "polling"],
    // Allow upgrade from polling → WebSocket
    allowUpgrades: true,
    // Larger max buffer for media messages
    maxHttpBufferSize: 1e8
  });

  io.on("connection", socket => {
    const { token } = socket.handshake.query;
    let tokenData = null;
    try {
      tokenData = verify(token, authConfig.secret);
      logger.debug(JSON.stringify(tokenData), "io-onConnection: tokenData");
    } catch (error) {
      logger.error(JSON.stringify(error), "Error decoding token");
      socket.disconnect();
      return io;
    }

    logger.info("Client Connected");

    // Registra o usuário como online e notifica supervisores
    const userId = String((tokenData as any).id);
    const wasAlreadyOnline = Array.from(onlineSockets.values()).includes(userId);
    onlineSockets.set(socket.id, userId);
    if (!wasAlreadyOnline) {
      io.emit("userOnline", { userId });
    }

    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");
      socket.join("notification");
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);
      socket.join(status);
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected");
      const uid = onlineSockets.get(socket.id);
      onlineSockets.delete(socket.id);
      // Só emite offline se o usuário não tem outras abas abertas
      if (uid && !Array.from(onlineSockets.values()).includes(uid)) {
        io.emit("userOffline", { userId: uid });
      }
    });

    return socket;
  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};
