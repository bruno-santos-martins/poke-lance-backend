import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/domain/errors";
import { AUTH_COOKIE_NAME } from "../sessionCookie";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (!mutatingMethods.has(req.method) || !req.cookies?.[AUTH_COOKIE_NAME]) return next();

  const expectedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  if (req.get("origin") !== expectedOrigin) {
    return next(new AppError("Origem não autorizada.", 403));
  }
  next();
}
