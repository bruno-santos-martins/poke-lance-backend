import { describe, expect, it, vi } from "vitest";
import type { ISettlementRepository, SettlementResult } from "../../../core/ports/repositories";
import type { IAuctionNotifier } from "../../../core/ports/services";
import { SettleExpiredLots } from "../../../application/use-cases/auction/SettleExpiredLots";

function makeRepo(settleExpired: ISettlementRepository["settleExpired"]): ISettlementRepository {
  return { settleExpired, settleLotNow: vi.fn() };
}

describe("SettleExpiredLots", () => {
  it("does not publish updates when there are no expired lots", async () => {
    const settleExpired = vi.fn<ISettlementRepository["settleExpired"]>().mockResolvedValue([]);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new SettleExpiredLots(makeRepo(settleExpired), notifier);

    await useCase.execute();

    expect(settleExpired).toHaveBeenCalledOnce();
    expect(notifier.lotUpdated).not.toHaveBeenCalled();
    expect(notifier.walletUpdated).not.toHaveBeenCalled();
  });

  it("publishes the closed lot and updated winner and seller wallets", async () => {
    const settledAt = new Date("2026-10-30T12:00:00.000Z");
    const settlement: SettlementResult = {
      id: "lot-1",
      sellerId: "seller-1",
      settledAt,
      winnerId: "bidder-1",
      winnerWallet: { userId: "bidder-1", balance: 4000, committed: 0 },
      sellerWallet: { userId: "seller-1", balance: 1000, committed: 200 }
    };
    const settleExpired = vi.fn<ISettlementRepository["settleExpired"]>().mockResolvedValue([settlement]);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new SettleExpiredLots(makeRepo(settleExpired), notifier);

    await useCase.execute();

    expect(notifier.lotUpdated).toHaveBeenCalledWith("lot-1", { status: "CLOSED", settledAt });
    expect(notifier.walletUpdated).toHaveBeenNthCalledWith(1, "bidder-1", {
      balance: 4000,
      committed: 0,
      available: 4000
    });
    expect(notifier.walletUpdated).toHaveBeenNthCalledWith(2, "seller-1", {
      balance: 1000,
      committed: 200,
      available: 800
    });
  });

  it("publishes only the lot update when it closes without a winner", async () => {
    const settlement: SettlementResult = {
      id: "lot-without-bids",
      sellerId: "seller-1",
      settledAt: null,
      winnerId: null,
      winnerWallet: null,
      sellerWallet: null
    };
    const settleExpired = vi.fn<ISettlementRepository["settleExpired"]>().mockResolvedValue([settlement]);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new SettleExpiredLots(makeRepo(settleExpired), notifier);

    await useCase.execute();

    expect(notifier.lotUpdated).toHaveBeenCalledWith("lot-without-bids", {
      status: "CLOSED",
      settledAt: null
    });
    expect(notifier.walletUpdated).not.toHaveBeenCalled();
  });

  it("skips a winner wallet update when the settlement has no winner ID", async () => {
    const settlement: SettlementResult = {
      id: "lot-1",
      sellerId: "seller-1",
      settledAt: new Date(),
      winnerId: null,
      winnerWallet: { userId: "bidder-1", balance: 0, committed: 0 },
      sellerWallet: null
    };
    const settleExpired = vi.fn<ISettlementRepository["settleExpired"]>().mockResolvedValue([settlement]);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new SettleExpiredLots(makeRepo(settleExpired), notifier);

    await useCase.execute();

    expect(notifier.walletUpdated).not.toHaveBeenCalled();
  });

  it("propagates settlement repository failures", async () => {
    const settleExpired = vi.fn<ISettlementRepository["settleExpired"]>()
      .mockRejectedValue(new Error("Falha de liquidação"));
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new SettleExpiredLots(makeRepo(settleExpired), notifier);

    await expect(useCase.execute()).rejects.toThrow("Falha de liquidação");
    expect(notifier.lotUpdated).not.toHaveBeenCalled();
  });
});
