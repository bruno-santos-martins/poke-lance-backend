import { describe, expect, it, vi } from "vitest";
import type { ILotRepository } from "../../../core/ports/repositories";
import type { IAuctionNotifier } from "../../../core/ports/services";
import type { Lot } from "../../../core/domain/entities";
import { CancelLotUseCase } from "../../../application/use-cases/lot/CancelLotUseCase";

const cancelledLot: Lot = {
  id: "lot-1",
  sellerId: "seller-1",
  title: "Pikachu",
  imagePath: "/uploads/cards/pikachu.png",
  startingBid: 1000,
  minimumIncrement: 100,
  currentBid: null,
  endsAt: new Date("2026-10-30T12:00:00.000Z"),
  status: "CANCELLED"
};

describe("CancelLotUseCase", () => {
  it("cancels a lot, refunds the leading bidder and publishes updates", async () => {
    const result = {
      lot: cancelledLot,
      refundedBidderId: "bidder-1",
      refundedAmount: 1000,
      refundedWallet: { userId: "bidder-1", balance: 5000, committed: 0 }
    };
    const cancelOpenLot = vi.fn<ILotRepository["cancelOpenLot"]>().mockResolvedValue(result);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new CancelLotUseCase(
      { findById: vi.fn(), listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenLot },
      notifier
    );

    await expect(useCase.execute("lot-1", "seller-1")).resolves.toBe(result);
    expect(cancelOpenLot).toHaveBeenCalledWith("lot-1", "seller-1");
    expect(notifier.lotUpdated).toHaveBeenCalledWith("lot-1", { status: "CANCELLED" });
    expect(notifier.walletUpdated).toHaveBeenCalledWith("bidder-1", {
      balance: 5000,
      committed: 0,
      available: 5000
    });
  });

  it("does not publish an update when the repository rejects cancellation", async () => {
    const cancelOpenLot = vi.fn<ILotRepository["cancelOpenLot"]>()
      .mockRejectedValue(new Error("Falha ao cancelar lote"));
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new CancelLotUseCase(
      { findById: vi.fn(), listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenLot },
      notifier
    );

    await expect(useCase.execute("lot-1", "seller-1")).rejects.toThrow("Falha ao cancelar lote");
    expect(notifier.lotUpdated).not.toHaveBeenCalled();
  });
});
