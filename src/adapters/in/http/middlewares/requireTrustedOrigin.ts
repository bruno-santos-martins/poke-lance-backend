import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/domain/errors";
import { AUTH_COOKIE_NAME } from "../sessionCookie";
import { getClientOrigins } from "../clientOrigins";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (!mutatingMethods.has(req.method) || !req.cookies?.[AUTH_COOKIE_NAME]) return next();

  if (!getClientOrigins().includes(req.get("origin") ?? "")) {
    return next(new AppError("Origem não autorizada.", 403));
  }
  next();
}
