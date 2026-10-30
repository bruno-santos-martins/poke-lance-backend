import { ErrorRequestHandler, Express } from "express";
import cors from "cors";
import express from "express";
import path from "node:path";
import { ZodError } from "zod";
import { AppError } from "../core/domain/errors";
import { IAuctionNotifier } from "../core/ports/services";
import { buildRouter } from "../adapters/in/http/routes";

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
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json({ limit: "32kb" }));
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
}
