import { describe, expect, it, vi } from "vitest";
import { Bid, Lot, Wallet } from "../../../core/domain/entities";
import { IAuctionNotifier, IHashService } from "../../../core/ports/services";
import { IBidTransactionRepository, IAuctionTransaction, LotBidUpdate, NewBid, NewWalletTransaction, WalletAdjustment } from "../../../core/ports/repositories";
import { PlaceBidUseCase } from "../../../application/use-cases/bid/PlaceBidUseCase";

class MemoryAuctionRepository implements IBidTransactionRepository, IAuctionTransaction {
  lot: Lot;
  latestBid: Bid | null;
  wallets = new Map<string, Wallet>();
  bids: Bid[] = [];
  transactions: NewWalletTransaction[] = [];
  lockedLots: string[] = [];
  lockedWalletGroups: string[][] = [];

  constructor(lot: Lot, latestBid: Bid | null, wallets: Wallet[]) {
    this.lot = lot;
    this.latestBid = latestBid;
    for (const wallet of wallets) this.wallets.set(wallet.userId, wallet);
  }

  transaction<T>(operation: (tx: IAuctionTransaction) => Promise<T>): Promise<T> { return operation(this); }
  async lockLot(lotId: string): Promise<void> { this.lockedLots.push(lotId); }
  async findLot(): Promise<Lot | null> { return this.lot; }
  async findLatestBid(): Promise<Bid | null> { return this.latestBid; }
  async lockWallets(userIds: string[]): Promise<void> { this.lockedWalletGroups.push(userIds); }

  async findWallet(userId: string): Promise<Wallet | null> {
    return this.wallets.get(userId) ?? null;
  }

  async adjustWallet(userId: string, adjustment: WalletAdjustment): Promise<Wallet> {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error("Missing test wallet");
    const updated = {
      ...wallet,
      balance: wallet.balance + (adjustment.balanceDelta ?? 0),
      committed: wallet.committed + (adjustment.committedDelta ?? 0)
    };
    updated.available = updated.balance - updated.committed;
    this.wallets.set(userId, updated);
    return updated;
  }

  async recordWalletTransaction(transaction: NewWalletTransaction): Promise<void> {
    this.transactions.push(transaction);
  }

  async addBid(bid: NewBid): Promise<Bid> {
    this.latestBid = bid;
    this.bids.push(bid);
    return bid;
  }

  async updateLotBid(_lotId: string, update: LotBidUpdate): Promise<Lot> {
    this.lot = { ...this.lot, ...update };
    return this.lot;
  }
}

class MemoryNotifier implements IAuctionNotifier {
  wallets = new Map<string, Wallet>();
  bids: { lotId: string; payload: unknown }[] = [];
  lots: { lotId: string; payload: unknown }[] = [];
  bidPlaced(lotId: string, payload: unknown): void { this.bids.push({ lotId, payload }); }
  lotUpdated(lotId: string, payload: unknown): void { this.lots.push({ lotId, payload }); }
  walletUpdated(userId: string, wallet: Wallet): void { this.wallets.set(userId, wallet); }
}

const hashService: IHashService = { sha256: () => "new-hash" };

function setup() {
  const now = new Date();
  const endsAt = new Date(now.getTime() + 60_000);
  const lot: Lot = {
    id: "lot-1", sellerId: "seller-1", title: "Pikachu", imagePath: "/uploads/cards/pikachu.png",
    startingBid: 1000, minimumIncrement: 100, currentBid: 1000, endsAt, status: "OPEN"
  };
  const priorBid: Bid = {
    id: "bid-1", lotId: lot.id, bidderId: "bidder-old", sequence: 1, amount: 1000,
    createdAt: new Date(now.getTime() - 10_000), previousHash: null, hash: "prior-hash"
  };
  const oldWallet: Wallet = { userId: priorBid.bidderId, balance: 10000, committed: 1000, available: 9000 };
  const newWallet: Wallet = { userId: "bidder-new", balance: 10000, committed: 0, available: 10000 };
  const repository = new MemoryAuctionRepository(lot, priorBid, [oldWallet, newWallet]);
  const notifier = new MemoryNotifier();
  return { repository, notifier, lot, useCase: new PlaceBidUseCase(hashService, notifier, repository) };
}

describe("PlaceBidUseCase", () => {
  it("liberta o saldo superado, compromete o novo lance e prorroga o lote", async () => {
    const { repository, notifier, lot, useCase } = setup();
    const result = await useCase.execute(lot.id, "bidder-new", 1100);

    expect(repository.wallets.get("bidder-old")?.committed).toBe(0);
    expect(repository.wallets.get("bidder-new")?.committed).toBe(1100);
    expect(result.bid.previousHash).toBe("prior-hash");
    expect(result.bid.hash).toBe("new-hash");
    expect(result.lot.endsAt.getTime()).toBe(lot.endsAt.getTime() + 120_000);
    expect(notifier.wallets.get("bidder-old")?.available).toBe(10000);
    expect(repository.transactions.map((transaction) => transaction.type)).toEqual(["BID_RELEASED", "BID_COMMITTED"]);
  });

  it("rejeita lance que não cabe no saldo disponível", async () => {
    const { useCase } = setup();
    await expect(useCase.execute("lot-1", "bidder-new", 10001)).rejects.toThrow("Saldo disponível insuficiente");
  });

  it("rejeita um lote inexistente antes de procurar lances ou carteiras", async () => {
    const { repository, useCase, notifier } = setup();
    vi.spyOn(repository, "findLot").mockResolvedValue(null);

    await expect(useCase.execute("missing-lot", "bidder-new", 1000))
      .rejects.toMatchObject({ statusCode: 404, message: "Lote não encontrado." });

    expect(repository.lockedLots).toEqual(["missing-lot"]);
    expect(repository.lockedWalletGroups).toEqual([]);
    expect(notifier.bids).toEqual([]);
  });

  it.each([
    ["closed", (lot: Lot) => { lot.status = "CLOSED"; }],
    ["cancelled", (lot: Lot) => { lot.status = "CANCELLED"; }],
    ["expired", (lot: Lot) => { lot.endsAt = new Date(Date.now() - 1); }]
  ])("rejects a %s lot without changing wallets", async (_caseName, updateLot) => {
    const { repository, useCase, notifier } = setup();
    updateLot(repository.lot);
    const walletsBefore = new Map(repository.wallets);

    await expect(useCase.execute(repository.lot.id, "bidder-new", 1100))
      .rejects.toMatchObject({ statusCode: 409, message: "Este lote já não está aberto." });

    expect(repository.wallets).toEqual(walletsBefore);
    expect(repository.lockedWalletGroups).toEqual([]);
    expect(notifier.bids).toEqual([]);
  });

  it("rejects a bid from the current leader", async () => {
    const { repository, useCase } = setup();

    await expect(useCase.execute(repository.lot.id, "bidder-old", 1100))
      .rejects.toMatchObject({ statusCode: 409, message: "O líder atual não pode cobrir o próprio lance." });

    expect(repository.lockedWalletGroups).toEqual([]);
  });

  it("rejects a bid below the current minimum", async () => {
    const { repository, useCase } = setup();

    await expect(useCase.execute(repository.lot.id, "bidder-new", 1099))
      .rejects.toMatchObject({ statusCode: 422, message: "O lance mínimo para este lote é 1100." });

    expect(repository.lockedWalletGroups).toEqual([]);
  });

  it("rejects a bidder without a wallet", async () => {
    const { repository, useCase, notifier } = setup();
    repository.wallets.delete("bidder-new");

    await expect(useCase.execute(repository.lot.id, "bidder-new", 1100))
      .rejects.toMatchObject({ statusCode: 422, message: "Saldo disponível insuficiente para este lance." });

    expect(repository.wallets.get("bidder-old")?.committed).toBe(1000);
    expect(repository.transactions).toEqual([]);
    expect(notifier.bids).toEqual([]);
  });

  it("places the first bid without releasing a prior commitment", async () => {
    const { repository, useCase, notifier } = setup();
    repository.latestBid = null;
    repository.lot.currentBid = null;
    repository.lot.endsAt = new Date(Date.now() + 180_000);

    const result = await useCase.execute(repository.lot.id, "bidder-new", 1000);

    expect(result.bid.sequence).toBe(1);
    expect(result.bid.previousHash).toBeNull();
    expect(repository.wallets.get("bidder-new")?.committed).toBe(1000);
    expect(repository.wallets.get("bidder-old")?.committed).toBe(1000);
    expect(repository.transactions.map((transaction) => transaction.type)).toEqual(["BID_COMMITTED"]);
    expect(result.lot.endsAt.getTime()).toBe(repository.lot.endsAt.getTime());
    expect(notifier.bids).toHaveLength(1);
    expect(notifier.lots).toHaveLength(1);
    expect(notifier.wallets.has("bidder-new")).toBe(true);
    expect(notifier.wallets.has("bidder-old")).toBe(false);
  });

  it("does not notify clients if the transaction fails", async () => {
    const { repository, useCase, notifier } = setup();
    vi.spyOn(repository, "transaction").mockRejectedValue(new Error("Falha transacional"));

    await expect(useCase.execute(repository.lot.id, "bidder-new", 1100))
      .rejects.toThrow("Falha transacional");

    expect(notifier.bids).toEqual([]);
    expect(notifier.lots).toEqual([]);
    expect(notifier.wallets).toEqual(new Map());
  });
});
