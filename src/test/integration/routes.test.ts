import express, { type Express } from "express";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtTokenService } from "../../adapters/out/crypto/JwtTokenService";
import type { IAuctionNotifier } from "../../core/ports/services";
import { configureApp } from "../../main/configureApp";

const routeMocks = vi.hoisted(() => ({
  createContainer: vi.fn(),
  listLotsExecute: vi.fn(),
  searchPokemonExecute: vi.fn(),
  getPokemonDetailsExecute: vi.fn(),
  createLotExecute: vi.fn(),
  cancelLotExecute: vi.fn(),
  placeBidExecute: vi.fn(),
  getWalletExecute: vi.fn(),
  depositBalanceExecute: vi.fn(),
  auditExecute: vi.fn(),
  bidderReportExecute: vi.fn(),
  sellerAuditExecute: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  auditCreate: vi.fn(),
  lotFindUnique: vi.fn(),
  lotFindMany: vi.fn()
}));

vi.mock("../../main/container", () => ({
  createContainer: routeMocks.createContainer
}));

vi.mock("../../adapters/out/database/prisma/client", () => ({
  prisma: {
    $transaction: async <T>(operation: (tx: {
      user: { create: typeof routeMocks.userCreate; findUnique: typeof routeMocks.userFindUnique };
      audit: { create: typeof routeMocks.auditCreate };
    }) => Promise<T>) => operation({
      user: { create: routeMocks.userCreate, findUnique: routeMocks.userFindUnique },
      audit: { create: routeMocks.auditCreate }
    }),
    user: {
      findUnique: routeMocks.userFindUnique,
      create: routeMocks.userCreate
    },
    lot: {
      findUnique: routeMocks.lotFindUnique,
      findMany: routeMocks.lotFindMany
    },
    audit: { create: routeMocks.auditCreate }
  }
}));

const routeUseCases = {
  listLots: { execute: routeMocks.listLotsExecute },
  searchPokemon: { execute: routeMocks.searchPokemonExecute },
  getPokemonDetails: { execute: routeMocks.getPokemonDetailsExecute },
  createLot: { execute: routeMocks.createLotExecute },
  cancelLot: { execute: routeMocks.cancelLotExecute },
  placeBid: { execute: routeMocks.placeBidExecute },
  getWallet: { execute: routeMocks.getWalletExecute },
  depositBalance: { execute: routeMocks.depositBalanceExecute },
  audit: { execute: routeMocks.auditExecute },
  bidderReport: { execute: routeMocks.bidderReportExecute },
  sellerAudit: { execute: routeMocks.sellerAuditExecute }
};

const notifier: IAuctionNotifier = {
  bidPlaced: () => undefined,
  lotUpdated: () => undefined,
  walletUpdated: () => undefined
};

describe("HTTP routes integration", () => {
  let app: Express;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.JWT_SECRET = "integration-test-secret-with-at-least-thirty-two-characters";
    routeMocks.createContainer.mockReturnValue(routeUseCases);
    routeMocks.auditCreate.mockResolvedValue({});
    app = express();
    configureApp(app, notifier);
  });

  it("returns a healthy response", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("lists open lots through the public route", async () => {
    const lots = [{ id: "lot-1", title: "Pikachu" }];
    routeMocks.listLotsExecute.mockResolvedValue(lots);

    const response = await request(app).get("/api/lots");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(lots);
    expect(routeMocks.listLotsExecute).toHaveBeenCalledWith("OPEN");
  });

  it("validates and normalizes Pokémon search input", async () => {
    routeMocks.searchPokemonExecute.mockResolvedValue([{ id: 25, name: "pikachu" }]);

    const response = await request(app).get("/api/pokemon/search?q=%20Pikachu%20");

    expect(response.status).toBe(200);
    expect(routeMocks.searchPokemonExecute).toHaveBeenCalledWith("Pikachu");
  });

  it("returns full Pokémon details for the lot-creation preview", async () => {
    const pokemon = {
      id: 25, name: "pikachu", imageUrl: "https://example.test/pikachu.png",
      types: ["electric"], height: 4, weight: 60, stats: { hp: 35, speed: 90 }
    };
    routeMocks.getPokemonDetailsExecute.mockResolvedValue(pokemon);

    const response = await request(app).get("/api/pokemon/25");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(pokemon);
    expect(routeMocks.getPokemonDetailsExecute).toHaveBeenCalledWith("25");
  });

  it("rejects protected routes when no authentication token is provided", async () => {
    const response = await request(app)
      .post("/api/wallet/deposits")
      .send({ amount: 1000 });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Autenticação necessária.");
    expect(routeMocks.depositBalanceExecute).not.toHaveBeenCalled();
  });

  it("rejects users with the wrong role", async () => {
    const token = new JwtTokenService().sign({ sub: "seller-1", role: "AUCTIONEER" });

    const response = await request(app)
      .get("/api/wallet")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Não tem permissão para esta operação.");
    expect(routeMocks.getWalletExecute).not.toHaveBeenCalled();
  });

  it("deposits funds for an authenticated bidder", async () => {
    const token = new JwtTokenService().sign({ sub: "bidder-1", role: "BIDDER" });
    const wallet = { balance: 5000, committed: 0, available: 5000 };
    routeMocks.depositBalanceExecute.mockResolvedValue(wallet);

    const response = await request(app)
      .post("/api/wallet/deposits")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 5000 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(wallet);
    expect(routeMocks.depositBalanceExecute).toHaveBeenCalledWith("bidder-1", 5000);
  });

  it("returns validation details when a deposit is outside the allowed range", async () => {
    const token = new JwtTokenService().sign({ sub: "bidder-1", role: "BIDDER" });

    const response = await request(app)
      .post("/api/wallet/deposits")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 99 });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Dados inválidos.");
    expect(response.body.details).toHaveProperty("amount");
    expect(routeMocks.depositBalanceExecute).not.toHaveBeenCalled();
  });

  it("returns not found when a requested lot does not exist", async () => {
    routeMocks.lotFindUnique.mockResolvedValue(null);

    const response = await request(app).get("/api/lots/missing-lot");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Lote não encontrado.");
  });

  it("registers bidders with a wallet and a normalized email", async () => {
    routeMocks.userFindUnique.mockResolvedValue(null);
    routeMocks.userCreate.mockResolvedValue({ id: "bidder-1", name: "Bruno", role: "BIDDER" });

    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bruno", email: "BRUNO@example.com", password: "password123", role: "BIDDER" });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: "bidder-1", name: "Bruno", role: "BIDDER" });
    expect(response.body.token).toBeUndefined();
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]?.[0]).toContain("Max-Age=3600");
    expect(routeMocks.userFindUnique).toHaveBeenCalledWith({ where: { email: "bruno@example.com" } });
    const createdUser = routeMocks.userCreate.mock.calls[0][0];
    expect(createdUser.data.wallet).toEqual({ create: {} });
    expect(await bcrypt.compare("password123", createdUser.data.passwordHash)).toBe(true);
    expect(routeMocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "USER_REGISTERED", actorId: "bidder-1" })
    }));
  });

  it("rejects duplicate registration and invalid registration data", async () => {
    routeMocks.userFindUnique.mockResolvedValue({ id: "existing-user" });

    const duplicateResponse = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bruno", email: "bruno@example.com", password: "password123", role: "BIDDER" });
    const invalidResponse = await request(app)
      .post("/api/auth/register")
      .send({ name: "B", email: "invalid", password: "short", role: "BIDDER" });

    expect(duplicateResponse.status).toBe(409);
    expect(invalidResponse.status).toBe(422);
    expect(routeMocks.userCreate).not.toHaveBeenCalled();
  });

  it("authenticates a user and rejects invalid credentials", async () => {
    const passwordHash = await bcrypt.hash("password123", 4);
    routeMocks.userFindUnique.mockResolvedValue({
      id: "bidder-1", name: "Bruno", role: "BIDDER", passwordHash
    });

    const successResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "BRUNO@example.com", password: "password123" });
    const invalidResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "bruno@example.com", password: "wrong-password" });

    expect(successResponse.status).toBe(200);
    expect(successResponse.body.user).toEqual({ id: "bidder-1", name: "Bruno", role: "BIDDER" });
    expect(successResponse.body.token).toBeUndefined();
    expect(invalidResponse.status).toBe(401);

    routeMocks.getWalletExecute.mockResolvedValue({ balance: 5000, committed: 0, available: 5000 });
    routeMocks.userFindUnique.mockResolvedValue({ id: "bidder-1", name: "Bruno", role: "BIDDER" });
    const cookie = successResponse.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(cookie).toBeDefined();
    const sessionResponse = await request(app)
      .get("/api/auth/session")
      .set("Cookie", cookie!);
    const walletResponse = await request(app)
      .get("/api/wallet")
      .set("Cookie", cookie!);
    const forbiddenCookieWrite = await request(app)
      .post("/api/wallet/deposits")
      .set("Cookie", cookie!)
      .set("Origin", "https://attacker.example")
      .send({ amount: 1000 });
    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie!)
      .set("Origin", "http://127.0.0.1:5173");

    expect(sessionResponse.body.user).toEqual({ id: "bidder-1", name: "Bruno", role: "BIDDER" });
    expect(walletResponse.body).toEqual({ balance: 5000, committed: 0, available: 5000 });
    expect(forbiddenCookieWrite.status).toBe(403);
    expect(logoutResponse.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(routeMocks.depositBalanceExecute).not.toHaveBeenCalled();
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers["set-cookie"]?.[0]).toContain("auction-session=;");
    expect(logoutResponse.headers["set-cookie"]?.[0]).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("rate limits repeated login attempts for the same account and IP", async () => {
    routeMocks.userFindUnique.mockResolvedValue(null);
    const responses = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      responses.push(await request(app)
        .post("/api/auth/login")
        .send({ email: "rate-limit@example.test", password: "wrong-password" }));
    }

    expect(responses.slice(0, 8).every((response) => response.status === 401)).toBe(true);
    expect(responses[8].status).toBe(429);
  });

  it("lists all lots when requested and rejects an invalid Pokémon search", async () => {
    routeMocks.listLotsExecute.mockResolvedValue([]);

    const lotsResponse = await request(app).get("/api/lots?status=all");
    const searchResponse = await request(app).get("/api/pokemon/search?q=%20%20");

    expect(lotsResponse.status).toBe(200);
    expect(routeMocks.listLotsExecute).toHaveBeenCalledWith(undefined);
    expect(searchResponse.status).toBe(422);
    expect(routeMocks.searchPokemonExecute).not.toHaveBeenCalled();
  });

  it("returns lot details with masked bidder identifiers", async () => {
    routeMocks.lotFindUnique.mockResolvedValue({
      id: "lot-1", pokemonId: 25, title: "Pikachu", imagePath: "/uploads/pikachu.png",
      types: ["electric"], height: 4, weight: 60, stats: [], startingBid: 1000,
      minimumIncrement: 100, currentBid: 1100, endsAt: "2030-01-01T00:00:00.000Z",
      status: "CLOSED", settledAt: "2030-01-01T00:00:00.000Z", winnerId: "1234-5678",
      seller: { name: "Seller" }, bids: [{ bidderId: "abcd-5678" }]
    });

    const response = await request(app).get("/api/lots/lot-1");

    expect(response.status).toBe(200);
    expect(response.body.winner).toBe("Licitante #1234");
    expect(response.body.latestBidder).toBe("Licitante #ABCD");
  });

  it("creates and cancels lots for an authenticated auctioneer", async () => {
    const token = new JwtTokenService().sign({ sub: "seller-1", role: "AUCTIONEER" });
    const createdLot = { id: "lot-1", status: "OPEN" };
    routeMocks.createLotExecute.mockResolvedValue(createdLot);
    routeMocks.cancelLotExecute.mockResolvedValue({
      lot: { id: "lot-1", status: "CANCELLED" },
      refundedAmount: 1100
    });

    const createResponse = await request(app)
      .post("/api/lots")
      .set("Authorization", `Bearer ${token}`)
      .send({ pokemon: "Pikachu", startingBid: 1000, minimumIncrement: 100, durationMinutes: 60 });
    const cancelResponse = await request(app)
      .delete("/api/lots/lot-1")
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(201);
    expect(routeMocks.createLotExecute).toHaveBeenCalledWith({
      pokemon: "Pikachu", startingBid: 1000, minimumIncrement: 100, durationMinutes: 60, sellerId: "seller-1"
    });
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body).toEqual({ lot: { id: "lot-1", status: "CANCELLED" }, refundedAmount: 1100 });
    expect(routeMocks.cancelLotExecute).toHaveBeenCalledWith("lot-1", "seller-1");
  });

  it("returns seller reports with masked winners and auctioned-lot summaries", async () => {
    const token = new JwtTokenService().sign({ sub: "seller-1", role: "AUCTIONEER" });
    routeMocks.lotFindMany
      .mockResolvedValueOnce([{
        id: "lot-1", title: "Pikachu", settledAt: "2030-01-01T00:00:00.000Z",
        winnerId: "1234-5678", bids: [{ amount: 1500 }]
      }])
      .mockResolvedValueOnce([{
        id: "lot-1", pokemonId: 25, title: "Pikachu", imagePath: "/uploads/pikachu.png",
        currentBid: 1500, settledAt: "2030-01-01T00:00:00.000Z",
        winner: { name: "Ash Ketchum", email: "ash@example.test" }, _count: { bids: 3 }
      }]);

    const reportResponse = await request(app)
      .get("/api/seller/reports")
      .set("Authorization", `Bearer ${token}`);
    const lotsResponse = await request(app)
      .get("/api/seller/auctioned-lots")
      .set("Authorization", `Bearer ${token}`);

    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.totalReceived).toBe(1500);
    expect(reportResponse.body.lots[0].winner).toBe("Licitante #1234");
    expect(lotsResponse.status).toBe(200);
    expect(lotsResponse.body[0]).toMatchObject({
      amount: 1500,
      bidCount: 3,
      winner: { name: "Ash Ketchum", email: "ash@example.test" }
    });
    expect(routeMocks.lotFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sellerId: "seller-1", status: "CLOSED" }),
      select: expect.objectContaining({ winner: { select: { name: true, email: true } } })
    }));
  });

  it("places bids and returns the bidder wallet and report", async () => {
    const token = new JwtTokenService().sign({ sub: "bidder-1", role: "BIDDER" });
    routeMocks.placeBidExecute.mockResolvedValue({
      bid: { id: "bid-1", amount: 1100, createdAt: "2030-01-01T00:00:00.000Z", hash: "hash" },
      lot: { id: "lot-1", currentBid: 1100, endsAt: "2030-01-01T00:02:00.000Z" }
    });
    routeMocks.getWalletExecute.mockResolvedValue({ balance: 5000, committed: 1100, available: 3900 });
    routeMocks.bidderReportExecute.mockResolvedValue({ bids: [], totalSpent: 0 });

    const bidResponse = await request(app)
      .post("/api/lots/lot-1/bids")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1100 });
    const walletResponse = await request(app).get("/api/wallet").set("Authorization", `Bearer ${token}`);
    const reportResponse = await request(app).get("/api/bidder/report").set("Authorization", `Bearer ${token}`);

    expect(bidResponse.status).toBe(201);
    expect(routeMocks.placeBidExecute).toHaveBeenCalledWith("lot-1", "bidder-1", 1100);
    expect(walletResponse.body).toEqual({ balance: 5000, committed: 1100, available: 3900 });
    expect(reportResponse.body).toEqual({ bids: [], totalSpent: 0 });
  });

  it("returns public audit history", async () => {
    const audit = { valid: true, bids: [] };
    routeMocks.auditExecute.mockResolvedValue(audit);

    const response = await request(app).get("/api/lots/lot-1/audit");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(audit);
    expect(routeMocks.auditExecute).toHaveBeenCalledWith("lot-1");
  });

  it("limits seller audit reports to authenticated auctioneers", async () => {
    const token = new JwtTokenService().sign({ sub: "seller-1", role: "AUCTIONEER" });
    const bidderToken = new JwtTokenService().sign({ sub: "bidder-1", role: "BIDDER" });
    const events = [{ action: "LOT_CANCELLED", actorName: "Bruno" }];
    routeMocks.sellerAuditExecute.mockResolvedValue(events);

    const response = await request(app)
      .get("/api/seller/audit")
      .set("Authorization", `Bearer ${token}`);
    const forbiddenResponse = await request(app)
      .get("/api/seller/audit")
      .set("Authorization", `Bearer ${bidderToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(events);
    expect(routeMocks.sellerAuditExecute).toHaveBeenCalledWith("seller-1");
    expect(forbiddenResponse.status).toBe(403);
  });

  it("returns a settled receipt with winner status and rejects unsettled lots", async () => {
    const token = new JwtTokenService().sign({ sub: "winner-1", role: "BIDDER" });
    routeMocks.lotFindUnique
      .mockResolvedValueOnce({
        id: "lot-1", title: "Pikachu", imagePath: "/uploads/pikachu.png", status: "CLOSED",
        settledAt: "2030-01-01T00:00:00.000Z", winnerId: "winner-1", bids: [{ amount: 1500 }]
      })
      .mockResolvedValueOnce({
        id: "lot-2", title: "Eevee", imagePath: "/uploads/eevee.png", status: "OPEN",
        settledAt: null, winnerId: null, bids: []
      });

    const receiptResponse = await request(app)
      .get("/api/receipts/lot-1")
      .set("Authorization", `Bearer ${token}`);
    const unsettledResponse = await request(app).get("/api/receipts/lot-2");

    expect(receiptResponse.status).toBe(200);
    expect(receiptResponse.body).toMatchObject({
      winner: "Licitante #WINN", isCurrentUserWinner: true, amount: 1500
    });
    expect(unsettledResponse.status).toBe(409);
  });
});

describe("configureApp", () => {
  const previousTrustProxyHops = process.env.TRUST_PROXY_HOPS;

  beforeEach(() => {
    vi.resetAllMocks();
    routeMocks.createContainer.mockReturnValue(routeUseCases);
  });

  afterEach(() => {
    if (previousTrustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = previousTrustProxyHops;
  });

  it("trusts the configured number of proxy hops", () => {
    process.env.TRUST_PROXY_HOPS = "1";
    const app = express();

    configureApp(app, notifier);

    expect(app.get("trust proxy")).toBe(1);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects an invalid TRUST_PROXY_HOPS value %s", (value) => {
    process.env.TRUST_PROXY_HOPS = value;

    expect(() => configureApp(express(), notifier)).toThrow("TRUST_PROXY_HOPS");
  });

  it("hides unexpected errors behind a generic 500", async () => {
    delete process.env.TRUST_PROXY_HOPS;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    routeMocks.listLotsExecute.mockRejectedValue(new Error("database exploded"));
    const app = express();
    configureApp(app, notifier);

    const response = await request(app).get("/api/lots");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Erro interno do servidor." });
    consoleError.mockRestore();
  });

  it("maps errors carrying a 404 status to not found", async () => {
    delete process.env.TRUST_PROXY_HOPS;
    routeMocks.listLotsExecute.mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }));
    const app = express();
    configureApp(app, notifier);

    const response = await request(app).get("/api/lots");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Recurso não encontrado." });
  });
});
