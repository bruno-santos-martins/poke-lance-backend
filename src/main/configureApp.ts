import { ErrorRequestHandler, Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { ZodError } from "zod";
import { AppError } from "../core/domain/errors";
import { IAuctionNotifier } from "../core/ports/services";
import { requireTrustedOrigin } from "../adapters/in/http/middlewares/requireTrustedOrigin";
import { buildRouter } from "../adapters/in/http/routes";
import { getClientOrigins } from "../adapters/in/http/clientOrigins";

const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: "Dados inválidos.",
      details: error.flatten().fieldErrors
    });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
    return res.status(404).json({ error: "Recurso não encontrado." });
  }
  console.error(error);
  return res.status(500).json({ error: "Erro interno do servidor." });
};

export function configureApp(app: Express, notifier: IAuctionNotifier): void {
  const trustedProxyHops = process.env.TRUST_PROXY_HOPS;
  if (trustedProxyHops !== undefined) {
    const hops = Number(trustedProxyHops);
    if (!Number.isInteger(hops) || hops < 1) throw new Error("TRUST_PROXY_HOPS deve ser um inteiro positivo.");
    app.set("trust proxy", hops);
  }
  const clientOrigins = getClientOrigins();
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: clientOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "32kb" }));
  app.use(requireTrustedOrigin);
  app.use(
    "/uploads",
    express.static(path.resolve(process.env.UPLOADS_DIR ?? "./uploads"), {
      fallthrough: false,
      maxAge: "1d"
    })
  );
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", buildRouter(notifier));
  app.use(errors);

  // In production the frontend is built into ./public — serve it as a SPA.
  if (process.env.NODE_ENV === "production") {
    const publicDir = path.resolve("./public");
    app.use(express.static(publicDir, { index: "index.html" }));
    app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  }
}
