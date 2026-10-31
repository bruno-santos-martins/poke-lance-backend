import { createHash } from "node:crypto";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

function rateLimitResponse(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitResponse("Muitas requisições. Tente novamente mais tarde.")
});

export const loginIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitResponse("Muitas tentativas de login. Tente novamente mais tarde.")
});

export const loginAccountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? "unknown");
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const account = createHash("sha256").update(email).digest("hex");
    return `${ip}:${account}`;
  },
  handler: rateLimitResponse("Muitas tentativas de login para esta conta. Tente novamente mais tarde.")
});

export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitResponse("Muitas tentativas de cadastro. Tente novamente mais tarde.")
});
