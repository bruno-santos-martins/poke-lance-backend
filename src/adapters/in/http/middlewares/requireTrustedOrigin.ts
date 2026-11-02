import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/domain/errors";
import { AUTH_COOKIE_NAME } from "../sessionCookie";
import { getClientOrigins } from "../clientOrigins";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  const host = req.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (!mutatingMethods.has(req.method) || !req.cookies?.[AUTH_COOKIE_NAME]) return next();

  const origin = req.get("origin") ?? "";
  if (getClientOrigins().includes(origin) || isSameOrigin(req)) {
    return next();
  }
  return next(new AppError("Origem não autorizada.", 403));
}
