import jwt from "jsonwebtoken";
import { AppError } from "../../../core/domain/errors";
import { ITokenService } from "../../../core/ports/services";

export class JwtTokenService implements ITokenService {
  private get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres.");
    return secret;
  }

  sign(payload: { sub: string; role: string }): string {
    return jwt.sign(payload, this.secret, { algorithm: "HS256", expiresIn: "1h", issuer: "pokemon-auction" });
  }

  verify(token: string): { sub: string; role: string } {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ["HS256"], issuer: "pokemon-auction" });
      if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.role !== "string") throw new Error("Invalid token payload");
      return { sub: payload.sub, role: payload.role };
    } catch {
      throw new AppError("Token inválido ou expirado.", 401);
    }
  }
}
