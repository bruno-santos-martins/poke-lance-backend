import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAudit } from "../../../adapters/out/database/prisma/PrismaAuditWriter";
import { PrismaAuctionTransactionRepository } from "../../../adapters/out/database/prisma/PrismaAuctionTransactionRepository";
import { PrismaBidderReportRepository } from "../../../adapters/out/database/prisma/PrismaBidderReportRepository";
import { PrismaBidRepository } from "../../../adapters/out/database/prisma/PrismaBidRepository";
import { PrismaLotListingRepository } from "../../../adapters/out/database/prisma/PrismaLotListingRepository";
import { PrismaLotRepository } from "../../../adapters/out/database/prisma/PrismaLotRepository";
import { PrismaSellerAuditRepository } from "../../../adapters/out/database/prisma/PrismaSellerAuditRepository";
import { PrismaSettlementRepository } from "../../../adapters/out/database/prisma/PrismaSettlementRepository";
import { PrismaUserRepository } from "../../../adapters/out/database/prisma/PrismaUserRepository";
import { PrismaWalletRepository } from "../../../adapters/out/database/prisma/PrismaWalletRepository";

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn()
  });
  return {
    user: model(),
    lot: model(),
    bid: model(),
    wallet: model(),
    walletTransaction: model(),
    audit: model(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn()
  };
});

vi.mock("../../../adapters/out/database/prisma/client", () => ({ prisma: db }));

const future = new Date(Date.now() + 60 * 60_000);
const past = new Date(Date.now() - 60_000);

function persistedLot(overrides: Record<string, unknown> = {}) {
  return {
    id: "lot-1",
    sellerId: "seller-1",
    pokemonId: 25,
    title: "Pikachu",
    imagePath: "/uploads/cards/pokemon-25-abc.png",
    types: ["electric"],
    height: 4,
    weight: 60,
    stats: { hp: 35 },
    startingBid: 100,
    minimumIncrement: 10,
    currentBid: null,
    endsAt: future,
    status: "OPEN",
    winnerId: null,
    settledAt: null,
    ...overrides
  };
}

const domainLot = {
  id: "lot-1",
  sellerId: "seller-1",
  title: "Pikachu",
  imagePath: "/uploads/cards/pokemon-25-abc.png",
  startingBid: 100,
  minimumIncrement: 10,
  currentBid: null,
  endsAt: future,
  status: "OPEN"
};

function resetModels() {
  for (const value of Object.values(db)) {
    if (typeof value === "function") value.mockReset();
    else for (const fn of Object.values(value)) fn.mockReset();
  }
  db.$transaction.mockImplementation((operation: (tx: typeof db) => unknown) => operation(db));
  db.user.findUnique.mockResolvedValue({ name: "Ash" });
}

describe("Prisma repositories", () => {
  beforeEach(resetModels);

  describe("recordAudit", () => {
    const event = {
      actorRole: "BIDDER" as const,
      action: "WALLET_DEPOSITED",
      entityType: "WALLET",
      details: { amount: 10 }
    };

    it("resolves the actor name from the user when it is not provided", async () => {
      await recordAudit(db as never, { ...event, actorId: "user-1" });

      expect(db.audit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actorId: "user-1", actorName: "Ash", entityId: null, lotId: null })
      });
    });

    it("uses the given actor name without querying the user", async () => {
      await recordAudit(db as never, { ...event, actorId: "user-1", actorName: "Misty", entityId: "w", lotId: "l" });

      expect(db.user.findUnique).not.toHaveBeenCalled();
      expect(db.audit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actorName: "Misty", entityId: "w", lotId: "l" })
      });
    });

    it("records system events as 'Sistema'", async () => {
      await recordAudit(db as never, { ...event, actorId: null });

      expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorName: "Sistema" }) });
    });

    it("fails when the actor does not exist", async () => {
      db.user.findUnique.mockResolvedValue(null);

      await expect(recordAudit(db as never, { ...event, actorId: "ghost" })).rejects.toMatchObject({ statusCode: 500 });
      expect(db.audit.create).not.toHaveBeenCalled();
    });
  });

  describe("PrismaUserRepository", () => {
    const user = { id: "u1", name: "Ash", email: "ash@poke.com", role: "BIDDER", passwordHash: "secret" };

    it("finds users by email and id without exposing the password hash", async () => {
      db.user.findUnique.mockResolvedValue(user);
      const repository = new PrismaUserRepository();

      const expected = { id: "u1", name: "Ash", email: "ash@poke.com", role: "BIDDER" };
      await expect(repository.findByEmail("ash@poke.com")).resolves.toEqual(expected);
      await expect(repository.findById("u1")).resolves.toEqual(expected);
    });

    it("returns null when the user does not exist", async () => {
      db.user.findUnique.mockResolvedValue(null);
      const repository = new PrismaUserRepository();

      await expect(repository.findByEmail("x")).resolves.toBeNull();
      await expect(repository.findById("x")).resolves.toBeNull();
    });
  });

  describe("PrismaBidRepository", () => {
    it("lists bids of a lot in sequence order", async () => {
      db.bid.findMany.mockResolvedValue([{ id: "b1" }]);

      await expect(new PrismaBidRepository().listByLotId("lot-1")).resolves.toEqual([{ id: "b1" }]);
      expect(db.bid.findMany).toHaveBeenCalledWith({ where: { lotId: "lot-1" }, orderBy: { sequence: "asc" } });
    });
  });

  describe("PrismaWalletRepository", () => {
    it("maps the wallet with the available balance", async () => {
      db.wallet.findUnique.mockResolvedValue({ userId: "u1", balance: 100, committed: 30 });

      await expect(new PrismaWalletRepository().findByUserId("u1"))
        .resolves.toEqual({ userId: "u1", balance: 100, committed: 30, available: 70 });
    });

    it("returns null when the wallet does not exist", async () => {
      db.wallet.findUnique.mockResolvedValue(null);

      await expect(new PrismaWalletRepository().findByUserId("u1")).resolves.toBeNull();
    });

    it("deposits, records the transaction and the audit", async () => {
      db.wallet.upsert.mockResolvedValue({ userId: "u1", balance: 150, committed: 0 });

      const wallet = await new PrismaWalletRepository().deposit("u1", 50);

      expect(wallet).toEqual({ userId: "u1", balance: 150, committed: 0, available: 150 });
      expect(db.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: { balance: { increment: 50 } },
        create: { userId: "u1", balance: 50 }
      }));
      expect(db.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ walletUserId: "u1", type: "DEPOSIT", amount: 50 })
      });
      expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "WALLET_DEPOSITED" }) });
    });

    it("ensures a wallet exists", async () => {
      await new PrismaWalletRepository().ensure("u1");

      expect(db.wallet.upsert).toHaveBeenCalledWith({ where: { userId: "u1" }, update: {}, create: { userId: "u1" } });
    });
  });

  describe("PrismaLotListingRepository", () => {
    it("lists lots with seller name and pseudonymised latest bidder", async () => {
      db.lot.findMany.mockResolvedValue([
        { ...persistedLot(), seller: { name: "Oak" }, bids: [{ bidderId: "ab-cd-ef" }] },
        { ...persistedLot({ id: "lot-2" }), seller: { name: "Oak" }, bids: [] }
      ]);

      const lots = await new PrismaLotListingRepository().list("OPEN");

      expect(db.lot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "OPEN" } }));
      expect(lots[0]).toMatchObject({ seller: "Oak", latestBidder: "Licitante #ABCD", types: ["electric"], stats: { hp: 35 } });
      expect(lots[1].latestBidder).toBeNull();
    });

    it("lists every status when no filter is given", async () => {
      db.lot.findMany.mockResolvedValue([]);

      await new PrismaLotListingRepository().list();

      expect(db.lot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it.each([
      ["non-array types", { types: "electric" }],
      ["non-string types", { types: [1] }],
      ["array stats", { stats: [1] }],
      ["null stats", { stats: null }],
      ["non-numeric stats", { stats: { hp: "35" } }]
    ])("rejects lots with %s", async (_label, overrides) => {
      db.lot.findMany.mockResolvedValue([{ ...persistedLot(overrides), seller: { name: "Oak" }, bids: [] }]);

      await expect(new PrismaLotListingRepository().list()).rejects.toThrow();
    });
  });

  describe("PrismaSellerAuditRepository", () => {
    it("returns audit events for the seller lots and actions", async () => {
      db.lot.findMany.mockResolvedValue([{ id: "lot-1" }]);
      const createdAt = new Date();
      db.audit.findMany.mockResolvedValue([
        { id: "a1", actorId: "seller-1", actorName: "Oak", actorRole: "AUCTIONEER", action: "LOT_CREATED", entityType: "LOT", entityId: "lot-1", lotId: "lot-1", lot: { title: "Pikachu" }, details: { a: 1 }, createdAt },
        { id: "a2", actorId: "seller-1", actorName: "Oak", actorRole: "AUCTIONEER", action: "X", entityType: "WALLET", entityId: null, lotId: null, lot: null, details: {}, createdAt }
      ]);

      const entries = await new PrismaSellerAuditRepository().getForSeller("seller-1");

      expect(db.audit.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { OR: [{ lotId: { in: ["lot-1"] } }, { actorId: "seller-1" }] }
      }));
      expect(entries.map((entry) => entry.lotTitle)).toEqual(["Pikachu", null]);
    });

    it.each([[null], [[1]], ["text"]])("rejects invalid details %j", async (details) => {
      db.lot.findMany.mockResolvedValue([]);
      db.audit.findMany.mockResolvedValue([{ id: "a1", details, lot: null }]);

      await expect(new PrismaSellerAuditRepository().getForSeller("s")).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe("PrismaBidderReportRepository", () => {
    const createdAt = new Date();
    const settledAt = new Date();

    function bidOn(lot: Record<string, unknown>, id = "b") {
      return { id, lotId: "lot-1", amount: 100, createdAt, lot: { title: "Pikachu", winnerId: null, bids: [], ...lot } };
    }

    it("builds the report with bid statuses, cards and transactions", async () => {
      db.wallet.findUnique.mockResolvedValue({ userId: "me", balance: 500, committed: 100 });
      db.bid.findMany.mockResolvedValue([
        bidOn({ status: "CANCELLED" }, "cancelled"),
        bidOn({ status: "CLOSED", winnerId: "me" }, "won"),
        bidOn({ status: "CLOSED", winnerId: "other" }, "lost"),
        bidOn({ status: "OPEN", bids: [{ bidderId: "me" }] }, "leading"),
        bidOn({ status: "OPEN", bids: [{ bidderId: "other" }] }, "outbid"),
        bidOn({ status: "OPEN", bids: [] }, "empty")
      ]);
      db.walletTransaction.findMany.mockResolvedValue([
        { id: "t1", type: "DEPOSIT", amount: 500, lotId: null, lotTitle: null, description: "d", createdAt, walletUserId: "me" }
      ]);
      db.lot.findMany.mockResolvedValue([
        { id: "lot-9", title: "Mew", imagePath: "/x.png", settledAt, bids: [{ amount: 300 }] },
        { id: "lot-8", title: "Eevee", imagePath: "/y.png", settledAt, bids: [] }
      ]);

      const report = await new PrismaBidderReportRepository().getForBidder("me");

      expect(report.wallet).toEqual({ userId: "me", balance: 500, committed: 100, available: 400 });
      expect(report.bids.map((bid) => bid.status)).toEqual(["CANCELLED", "WON", "LOST", "LEADING", "OUTBID", "OUTBID"]);
      expect(report.acquiredCards.map((card) => card.amount)).toEqual([300, 0]);
      expect(report.transactions).toEqual([
        { id: "t1", type: "DEPOSIT", amount: 500, lotId: null, lotTitle: null, description: "d", createdAt }
      ]);
    });

    it("fails when the wallet does not exist", async () => {
      db.wallet.findUnique.mockResolvedValue(null);
      db.bid.findMany.mockResolvedValue([]);
      db.walletTransaction.findMany.mockResolvedValue([]);
      db.lot.findMany.mockResolvedValue([]);

      await expect(new PrismaBidderReportRepository().getForBidder("me")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("fails when an acquired card has no settlement date", async () => {
      db.wallet.findUnique.mockResolvedValue({ userId: "me", balance: 0, committed: 0 });
      db.bid.findMany.mockResolvedValue([]);
      db.walletTransaction.findMany.mockResolvedValue([]);
      db.lot.findMany.mockResolvedValue([{ id: "l", title: "t", imagePath: "/i", settledAt: null, bids: [] }]);

      await expect(new PrismaBidderReportRepository().getForBidder("me")).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe("PrismaLotRepository", () => {
    it("finds a lot by id mapped to the domain", async () => {
      db.lot.findUnique.mockResolvedValue(persistedLot());

      await expect(new PrismaLotRepository().findById("lot-1")).resolves.toEqual(domainLot);
    });

    it("returns null for unknown lots", async () => {
      db.lot.findUnique.mockResolvedValue(null);

      await expect(new PrismaLotRepository().findById("x")).resolves.toBeNull();
    });

    it("lists open lots", async () => {
      db.lot.findMany.mockResolvedValue([persistedLot()]);

      await expect(new PrismaLotRepository().listOpen()).resolves.toEqual([domainLot]);
      expect(db.lot.findMany).toHaveBeenCalledWith({ where: { status: "OPEN" }, orderBy: { endsAt: "asc" } });
    });

    it("creates a lot ensuring the seller wallet and auditing it", async () => {
      db.lot.create.mockResolvedValue(persistedLot());
      const input = {
        sellerId: "seller-1", pokemonId: 25, title: "Pikachu", imagePath: "/i.png", types: ["electric"],
        height: 4, weight: 60, stats: { hp: 35 }, startingBid: 100, minimumIncrement: 10, endsAt: future
      };

      await expect(new PrismaLotRepository().createWithSellerWallet(input)).resolves.toEqual(domainLot);
      expect(db.wallet.upsert).toHaveBeenCalledWith({ where: { userId: "seller-1" }, update: {}, create: { userId: "seller-1" } });
      expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "LOT_CREATED", lotId: "lot-1" }) });
    });

    it("checks whether an image is used by another active lot", async () => {
      const repository = new PrismaLotRepository();
      db.lot.findFirst.mockResolvedValueOnce({ id: "lot-2" }).mockResolvedValueOnce(null);

      await expect(repository.isImageUsedByOtherActiveLot("/i.png", "lot-1")).resolves.toBe(true);
      await expect(repository.isImageUsedByOtherActiveLot("/i.png", "lot-1")).resolves.toBe(false);
    });

    describe("cancelOpenLot", () => {
      it("cancels a lot without bids", async () => {
        db.lot.findUnique.mockResolvedValue(persistedLot());
        db.bid.findFirst.mockResolvedValue(null);
        db.lot.update.mockResolvedValue(persistedLot({ status: "CANCELLED" }));

        const result = await new PrismaLotRepository().cancelOpenLot("lot-1", "seller-1");

        expect(result).toEqual({
          lot: { ...domainLot, status: "CANCELLED" },
          refundedBidderId: null,
          refundedAmount: 0,
          refundedWallet: null
        });
        expect(db.wallet.update).not.toHaveBeenCalled();
      });

      it("refunds the committed balance of the leading bidder", async () => {
        db.lot.findUnique.mockResolvedValue(persistedLot());
        db.bid.findFirst.mockResolvedValue({ bidderId: "bidder-1", amount: 120 });
        db.wallet.findUnique.mockResolvedValue({ userId: "bidder-1", balance: 500, committed: 120 });
        db.wallet.update.mockResolvedValue({ userId: "bidder-1", balance: 500, committed: 0 });
        db.lot.update.mockResolvedValue(persistedLot({ status: "CANCELLED" }));

        const result = await new PrismaLotRepository().cancelOpenLot("lot-1", "seller-1");

        expect(result.refundedBidderId).toBe("bidder-1");
        expect(result.refundedAmount).toBe(120);
        expect(result.refundedWallet).toEqual({ userId: "bidder-1", balance: 500, committed: 0 });
        expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: "bidder-1" }, data: { committed: { decrement: 120 } } });
        expect(db.walletTransaction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ type: "BID_REFUNDED", amount: 120, walletUserId: "bidder-1" })
        });
      });

      it.each([
        ["the lot does not exist", null, "seller-1", 404],
        ["the seller does not own the lot", persistedLot(), "intruder", 403],
        ["the lot is not open", persistedLot({ status: "CLOSED" }), "seller-1", 409],
        ["the lot has already ended", persistedLot({ endsAt: past }), "seller-1", 409]
      ])("fails when %s", async (_label, lot, sellerId, statusCode) => {
        db.lot.findUnique.mockResolvedValue(lot);

        await expect(new PrismaLotRepository().cancelOpenLot("lot-1", sellerId)).rejects.toMatchObject({ statusCode });
        expect(db.lot.update).not.toHaveBeenCalled();
      });

      it.each([
        ["missing", null],
        ["without enough committed balance", { userId: "bidder-1", balance: 500, committed: 50 }]
      ])("fails when the bidder wallet is %s", async (_label, wallet) => {
        db.lot.findUnique.mockResolvedValue(persistedLot());
        db.bid.findFirst.mockResolvedValue({ bidderId: "bidder-1", amount: 120 });
        db.wallet.findUnique.mockResolvedValue(wallet);

        await expect(new PrismaLotRepository().cancelOpenLot("lot-1", "seller-1")).rejects.toMatchObject({ statusCode: 500 });
        expect(db.wallet.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("PrismaSettlementRepository", () => {
    it("closes expired lots without bids", async () => {
      db.lot.findMany.mockResolvedValue([{ id: "lot-1" }]);
      db.lot.findUnique.mockResolvedValue(persistedLot({ endsAt: past }));
      db.bid.findFirst.mockResolvedValue(null);
      db.lot.update.mockImplementation(({ data }) => Promise.resolve(persistedLot({ ...data, endsAt: past })));

      const results = await new PrismaSettlementRepository().settleExpired();

      expect(results).toEqual([{
        id: "lot-1", sellerId: "seller-1", settledAt: expect.any(Date), winnerId: null, winnerWallet: null, sellerWallet: null
      }]);
      expect(db.wallet.update).not.toHaveBeenCalled();
      expect(db.audit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: "LOT_SETTLED", actorName: "Sistema" })
      });
    });

    it("transfers the winning bid from the bidder to the seller", async () => {
      db.lot.findMany.mockResolvedValue([{ id: "lot-1" }]);
      db.lot.findUnique.mockResolvedValue(persistedLot({ endsAt: past }));
      db.bid.findFirst.mockResolvedValue({ bidderId: "bidder-1", amount: 200 });
      db.wallet.update.mockResolvedValue({ userId: "bidder-1", balance: 300, committed: 0, id: "w1" });
      db.wallet.upsert.mockResolvedValue({ userId: "seller-1", balance: 200, committed: 0, id: "w2" });
      db.lot.update.mockImplementation(({ data }) => Promise.resolve(persistedLot({ ...data, endsAt: past })));

      const [result] = await new PrismaSettlementRepository().settleExpired();

      expect(result).toMatchObject({
        winnerId: "bidder-1",
        winnerWallet: { userId: "bidder-1", balance: 300, committed: 0 },
        sellerWallet: { userId: "seller-1", balance: 200, committed: 0 }
      });
      expect(db.wallet.update).toHaveBeenCalledWith({
        where: { userId: "bidder-1" },
        data: { balance: { decrement: 200 }, committed: { decrement: 200 } }
      });
      expect(db.walletTransaction.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ walletUserId: "bidder-1", type: "AUCTION_DEBIT", amount: 200 }),
          expect.objectContaining({ walletUserId: "seller-1", type: "AUCTION_CREDIT", amount: 200 })
        ]
      });
    });

    it.each([
      ["was deleted", null],
      ["is no longer open", persistedLot({ status: "CANCELLED", endsAt: past })],
      ["was extended", persistedLot({ endsAt: future })]
    ])("skips lots that %s after being selected", async (_label, lot) => {
      db.lot.findMany.mockResolvedValue([{ id: "lot-1" }]);
      db.lot.findUnique.mockResolvedValue(lot);

      await expect(new PrismaSettlementRepository().settleExpired()).resolves.toEqual([]);
      expect(db.lot.update).not.toHaveBeenCalled();
    });
  });

  describe("PrismaAuctionTransactionRepository", () => {
    async function inTransaction<T>(operation: Parameters<PrismaAuctionTransactionRepository["transaction"]>[0]) {
      return new PrismaAuctionTransactionRepository().transaction(operation) as Promise<T>;
    }

    it("runs the operation inside a read-committed transaction", async () => {
      await inTransaction(async () => "done");

      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
    });

    it("locks the lot and wallets in a stable order without duplicates", async () => {
      await inTransaction(async (tx) => {
        await tx.lockLot("lot-1");
        await tx.lockWallets(["b", "a", "b"]);
      });

      expect(db.$queryRaw).toHaveBeenCalledTimes(3);
      expect(db.$queryRaw.mock.calls.map((call) => call.slice(1))).toEqual([["lot-1"], ["a"], ["b"]]);
    });

    it("maps lots, bids and wallets", async () => {
      db.lot.findUnique.mockResolvedValueOnce(persistedLot()).mockResolvedValueOnce(null);
      db.bid.findFirst.mockResolvedValue({ id: "b1" });
      db.wallet.findUnique.mockResolvedValueOnce({ userId: "u", balance: 50, committed: 20 }).mockResolvedValueOnce(null);

      await inTransaction(async (tx) => {
        await expect(tx.findLot("lot-1")).resolves.toEqual(domainLot);
        await expect(tx.findLot("x")).resolves.toBeNull();
        await expect(tx.findLatestBid("lot-1")).resolves.toEqual({ id: "b1" });
        await expect(tx.findWallet("u")).resolves.toEqual({ userId: "u", balance: 50, committed: 20, available: 30 });
        await expect(tx.findWallet("x")).resolves.toBeNull();
      });
    });

    it("adjusts only the provided wallet deltas", async () => {
      db.wallet.update.mockResolvedValue({ userId: "u", balance: 50, committed: 30 });

      await inTransaction(async (tx) => {
        await tx.adjustWallet("u", { committedDelta: 10 });
        await tx.adjustWallet("u", { balanceDelta: -5, committedDelta: -5 });
      });

      expect(db.wallet.update.mock.calls[0][0].data).toEqual({ committed: { increment: 10 } });
      expect(db.wallet.update.mock.calls[1][0].data).toEqual({ balance: { increment: -5 }, committed: { increment: -5 } });
    });

    it("writes bids, wallet transactions, lot updates and audits", async () => {
      db.bid.create.mockResolvedValue({ id: "b1" });
      db.lot.update.mockResolvedValue(persistedLot({ currentBid: 110 }));
      const bid = { lotId: "lot-1", bidderId: "u", amount: 110 };
      const walletTransaction = { walletUserId: "u", type: "BID_COMMITTED", amount: 110, description: "d" };

      await inTransaction(async (tx) => {
        await expect(tx.addBid(bid as never)).resolves.toEqual({ id: "b1" });
        await expect(tx.updateLotBid("lot-1", { currentBid: 110 } as never)).resolves.toEqual({ ...domainLot, currentBid: 110 });
        await tx.recordWalletTransaction(walletTransaction as never);
        await tx.recordAudit({ actorId: "u", actorRole: "BIDDER", action: "BID_PLACED", entityType: "BID", details: {} });
      });

      expect(db.bid.create).toHaveBeenCalledWith({ data: bid });
      expect(db.walletTransaction.create).toHaveBeenCalledWith({ data: walletTransaction });
      expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BID_PLACED" }) });
    });
  });
});
