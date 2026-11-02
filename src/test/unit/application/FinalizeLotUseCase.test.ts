import { describe, expect, it, vi } from "vitest";
import type { ISettlementRepository, SettlementResult } from "../../../core/ports/repositories";
import type { IAuctionNotifier } from "../../../core/ports/services";
import { FinalizeLotUseCase } from "../../../application/use-cases/lot/FinalizeLotUseCase";

function makeRepo(result: SettlementResult): ISettlementRepository {
  return {
    settleExpired: vi.fn(),
    settleLotNow: vi.fn().mockResolvedValue(result)
  };
}

function makeNotifier(): IAuctionNotifier {
  return { bidPlaced: vi.fn(), lotUpdated: vi.fn(), walletUpdated: vi.fn() };
}

const BASE: SettlementResult = {
  id: "lot-1",
  sellerId: "seller-1",
  settledAt: new Date("2026-11-01T12:00:00.000Z"),
  winnerId: null,
  winnerWallet: null,
  sellerWallet: null
};

describe("FinalizeLotUseCase", () => {
  it("notifies lot closed and returns the result", async () => {
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(makeRepo(BASE), notifier);

    const result = await useCase.execute("lot-1", "seller-1");

    expect(result).toBe(await makeRepo(BASE).settleLotNow("lot-1", "seller-1"));
    expect(notifier.lotUpdated).toHaveBeenCalledWith("lot-1", {
      status: "CLOSED",
      settledAt: BASE.settledAt
    });
    expect(notifier.walletUpdated).not.toHaveBeenCalled();
  });

  it("notifies winner wallet when there is a winning bid", async () => {
    const result: SettlementResult = {
      ...BASE,
      winnerId: "bidder-1",
      winnerWallet: { userId: "bidder-1", balance: 3000, committed: 0 }
    };
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(makeRepo(result), notifier);

    await useCase.execute("lot-1", "seller-1");

    expect(notifier.walletUpdated).toHaveBeenCalledWith("bidder-1", {
      balance: 3000,
      committed: 0,
      available: 3000
    });
  });

  it("notifies seller wallet when seller receives payment", async () => {
    const result: SettlementResult = {
      ...BASE,
      winnerId: "bidder-1",
      winnerWallet: { userId: "bidder-1", balance: 3000, committed: 0 },
      sellerWallet: { userId: "seller-1", balance: 5000, committed: 0 }
    };
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(makeRepo(result), notifier);

    await useCase.execute("lot-1", "seller-1");

    expect(notifier.walletUpdated).toHaveBeenCalledWith("seller-1", {
      balance: 5000,
      committed: 0,
      available: 5000
    });
  });

  it("notifies both winner and seller wallets with correct available amounts", async () => {
    const result: SettlementResult = {
      ...BASE,
      winnerId: "bidder-1",
      winnerWallet: { userId: "bidder-1", balance: 8000, committed: 500 },
      sellerWallet: { userId: "seller-1", balance: 9500, committed: 200 }
    };
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(makeRepo(result), notifier);

    await useCase.execute("lot-1", "seller-1");

    expect(notifier.walletUpdated).toHaveBeenCalledWith("bidder-1", {
      balance: 8000,
      committed: 500,
      available: 7500
    });
    expect(notifier.walletUpdated).toHaveBeenCalledWith("seller-1", {
      balance: 9500,
      committed: 200,
      available: 9300
    });
    expect(notifier.walletUpdated).toHaveBeenCalledTimes(2);
  });

  it("does not notify when the repository rejects the finalization", async () => {
    const repo: ISettlementRepository = {
      settleExpired: vi.fn(),
      settleLotNow: vi.fn().mockRejectedValue(new Error("Lote não encontrado."))
    };
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(repo, notifier);

    await expect(useCase.execute("lot-1", "seller-1")).rejects.toThrow("Lote não encontrado.");
    expect(notifier.lotUpdated).not.toHaveBeenCalled();
    expect(notifier.walletUpdated).not.toHaveBeenCalled();
  });

  it("does not notify winner wallet when winnerId is null even if winnerWallet exists", async () => {
    // Defensive: winnerWallet set but winnerId null — should not call walletUpdated for winner
    const result: SettlementResult = {
      ...BASE,
      winnerId: null,
      winnerWallet: { userId: "bidder-1", balance: 3000, committed: 0 },
      sellerWallet: { userId: "seller-1", balance: 5000, committed: 0 }
    };
    const notifier = makeNotifier();
    const useCase = new FinalizeLotUseCase(makeRepo(result), notifier);

    await useCase.execute("lot-1", "seller-1");

    const walletCalls = (notifier.walletUpdated as ReturnType<typeof vi.fn>).mock.calls;
    expect(walletCalls.every(([id]) => id !== "bidder-1")).toBe(true);
  });
});
