import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../../core/domain/errors";
import { JwtTokenService } from "../../../out/crypto/JwtTokenService";

export type AuthUser = { id: string; role: "AUCTIONEER" | "BIDDER" };
declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

const tokens = new JwtTokenService();

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getToken(req);
    if (!token) throw new AppError("Autenticação necessária.", 401);
    setAuthenticatedUser(req, token);
    next();
  } catch (error) { next(error); }
}

export function authenticateIfPresent(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getToken(req);
    if (token) setAuthenticatedUser(req, token);
    next();
  } catch (error) { next(error); }
}

function getToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header) return undefined;
  if (!header.startsWith("Bearer ")) throw new AppError("Autenticação necessária.", 401);
  return header.slice(7);
}

function setAuthenticatedUser(req: Request, token: string) {
  const payload = tokens.verify(token);
  if (payload.role !== "AUCTIONEER" && payload.role !== "BIDDER") throw new AppError("Perfil inválido.", 401);
  req.user = { id: payload.sub, role: payload.role };
}

export function requireRole(role: AuthUser["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(new AppError("Não tem permissão para esta operação.", 403));
    next();
  };
}
