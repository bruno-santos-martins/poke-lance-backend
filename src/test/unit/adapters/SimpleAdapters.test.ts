import { createHash } from "node:crypto";
import type { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import { getClientOrigins } from "../../../adapters/in/http/clientOrigins";
import { SocketAuctionNotifier } from "../../../adapters/in/websocket/SocketAuctionNotifier";
import { JwtTokenService } from "../../../adapters/out/crypto/JwtTokenService";
import { Sha256HashService } from "../../../adapters/out/crypto/Sha256HashService";
import { GetSellerAuditUseCase } from "../../../application/use-cases/audit/GetSellerAuditUseCase";
import { GetPokemonDetailsUseCase } from "../../../application/use-cases/lot/GetPokemonDetailsUseCase";

describe("Sha256HashService", () => {
  it("returns the hex sha256 digest", () => {
    const expected = createHash("sha256").update("leilao").digest("hex");

    expect(new Sha256HashService().sha256("leilao")).toBe(expected);
  });
});

describe("SocketAuctionNotifier", () => {
  function createIo() {
    const roomEmit = vi.fn();
    const io = { to: vi.fn(() => ({ emit: roomEmit })), emit: vi.fn() };
    return { io, roomEmit, notifier: new SocketAuctionNotifier(io as unknown as Server) };
  }

  it("emits placed bids to the lot room", () => {
    const { io, roomEmit, notifier } = createIo();

    notifier.bidPlaced("lot-1", { amount: 10 });

    expect(io.to).toHaveBeenCalledWith("lot:lot-1");
    expect(roomEmit).toHaveBeenCalledWith("bid:placed", { amount: 10 });
  });

  it("emits lot updates to the lot room and broadcasts the list refresh", () => {
    const { io, roomEmit, notifier } = createIo();

    notifier.lotUpdated("lot-1", { status: "CLOSED" });

    expect(io.to).toHaveBeenCalledWith("lot:lot-1");
    expect(roomEmit).toHaveBeenCalledWith("lot:updated", { status: "CLOSED" });
    expect(io.emit).toHaveBeenCalledWith("lots:updated", { lotId: "lot-1" });
  });

  it("emits wallet updates to the user room", () => {
    const { io, roomEmit, notifier } = createIo();
    const wallet = { balance: 100, committed: 20, available: 80 };

    notifier.walletUpdated("user-1", wallet);

    expect(io.to).toHaveBeenCalledWith("user:user-1");
    expect(roomEmit).toHaveBeenCalledWith("wallet:updated", wallet);
  });
});

describe("GetSellerAuditUseCase", () => {
  it("returns the seller audit entries from the repository", async () => {
    const entries = [{ id: "audit-1" }];
    const getForSeller = vi.fn().mockResolvedValue(entries);

    await expect(new GetSellerAuditUseCase({ getForSeller }).execute("seller-1")).resolves.toBe(entries);
    expect(getForSeller).toHaveBeenCalledWith("seller-1");
  });
});

describe("GetPokemonDetailsUseCase", () => {
  it("delegates to the PokéAPI provider", async () => {
    const card = { id: 25, name: "pikachu" };
    const findPokemon = vi.fn().mockResolvedValue(card);

    await expect(new GetPokemonDetailsUseCase({ findPokemon, searchPokemon: vi.fn() }).execute("pikachu")).resolves.toBe(card);
    expect(findPokemon).toHaveBeenCalledWith("pikachu");
  });
});

describe("JwtTokenService", () => {
  const VALID_SECRET = "a".repeat(32);

  it("signs and verifies a round-trip payload", () => {
    process.env.JWT_SECRET = VALID_SECRET;
    const svc = new JwtTokenService();
    const token = svc.sign({ sub: "user-1", role: "BIDDER" });
    expect(svc.verify(token)).toMatchObject({ sub: "user-1", role: "BIDDER" });
    delete process.env.JWT_SECRET;
  });

  it("throws AppError 401 for an invalid token", () => {
    process.env.JWT_SECRET = VALID_SECRET;
    expect(() => new JwtTokenService().verify("not.a.token")).toThrow(
      expect.objectContaining({ statusCode: 401 })
    );
    delete process.env.JWT_SECRET;
  });

  it("throws when JWT_SECRET is missing or too short", () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "short";
    expect(() => new JwtTokenService().sign({ sub: "u", role: "BIDDER" })).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });
});

describe("getClientOrigins", () => {
  it("returns both localhost and 127.0.0.1 variants in development", () => {
    const origins = getClientOrigins("http://localhost:5173", false);
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://127.0.0.1:5173");
  });

  it("returns both 127.0.0.1 and localhost variants in development", () => {
    const origins = getClientOrigins("http://127.0.0.1:5173", false);
    expect(origins).toContain("http://127.0.0.1:5173");
    expect(origins).toContain("http://localhost:5173");
  });

  it("returns only the configured origin in production", () => {
    const origins = getClientOrigins("https://poke-lance.onrender.com", true);
    expect(origins).toEqual(["https://poke-lance.onrender.com"]);
  });
});
