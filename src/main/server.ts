import "dotenv/config";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { parse as parseCookies } from "cookie";
import { SocketAuctionNotifier } from "../adapters/in/websocket/SocketAuctionNotifier";
import { SettleExpiredLots } from "../application/use-cases/auction/SettleExpiredLots";
import { prisma } from "../adapters/out/database/prisma/client";
import { JwtTokenService } from "../adapters/out/crypto/JwtTokenService";
import { PrismaSettlementRepository } from "../adapters/out/database/prisma/PrismaSettlementRepository";
import { configureApp } from "./configureApp";
import { AUTH_COOKIE_NAME } from "../adapters/in/http/sessionCookie";
import { createSocketEventRateLimiter, isAllowedSocketOrigin } from "../adapters/in/websocket/socketGuards";
import { getClientOrigins } from "../adapters/in/http/clientOrigins";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não foi configurada.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("Configure JWT_SECRET com pelo menos 32 caracteres.");

const app = express();
const server = http.createServer(app);
const clientOrigins = getClientOrigins();
const io = new Server(server, {
  cors: { origin: clientOrigins, credentials: true },
  allowRequest: (request, callback) => {
    callback(null, isAllowedSocketOrigin(request.headers.origin, clientOrigins));
  }
});
const notifier = new SocketAuctionNotifier(io);
const tokens = new JwtTokenService();
const settlementUseCase = new SettleExpiredLots(new PrismaSettlementRepository(), notifier);

configureApp(app, notifier);
io.use((socket, next) => {
  const authToken = socket.handshake.auth?.token;
  const cookieToken = parseCookies(socket.request.headers.cookie ?? "")[AUTH_COOKIE_NAME];
  const token = typeof authToken === "string" ? authToken : cookieToken;
  if (!token) return next();
  try {
    socket.data.userId = tokens.verify(token).sub;
    next();
  } catch (error) { next(error as Error); }
});
io.on("connection", (socket) => {
  const allowEvent = createSocketEventRateLimiter();
  socket.use((_event, next) => {
    if (!allowEvent()) {
      next(new Error("Limite de eventos excedido. Tente novamente mais tarde."));
      return;
    }
    next();
  });

  if (typeof socket.data.userId === "string") void socket.join(`user:${socket.data.userId}`);
  socket.on("lot:join", (lotId: unknown) => {
    if (typeof lotId === "string" && /^[0-9a-f-]{36}$/i.test(lotId)) void socket.join(`lot:${lotId}`);
  });
  socket.on("lot:leave", (lotId: unknown) => {
    if (typeof lotId === "string" && /^[0-9a-f-]{36}$/i.test(lotId)) void socket.leave(`lot:${lotId}`);
  });
});

const settlementTimer = setInterval(() => {
  void settlementUseCase.execute().catch((error: unknown) => console.error("Falha na liquidação de lotes:", error));
}, 5000);
settlementTimer.unref();

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`API disponível em http://localhost:${port}`));

async function shutdown() {
  clearInterval(settlementTimer);
  io.close();
  await prisma.$disconnect();
  server.close();
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
