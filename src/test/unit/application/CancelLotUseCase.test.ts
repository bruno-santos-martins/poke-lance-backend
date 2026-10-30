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
  it("cancels the seller's lot and publishes its new status", async () => {
    const cancelOpenUnbidLot = vi.fn<ILotRepository["cancelOpenUnbidLot"]>().mockResolvedValue(cancelledLot);
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new CancelLotUseCase(
      { findById: vi.fn(), listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenUnbidLot },
      notifier
    );

    await expect(useCase.execute("lot-1", "seller-1")).resolves.toBe(cancelledLot);
    expect(cancelOpenUnbidLot).toHaveBeenCalledWith("lot-1", "seller-1");
    expect(notifier.lotUpdated).toHaveBeenCalledWith("lot-1", { status: "CANCELLED" });
  });

  it("does not publish an update when the repository rejects cancellation", async () => {
    const cancelOpenUnbidLot = vi.fn<ILotRepository["cancelOpenUnbidLot"]>()
      .mockRejectedValue(new Error("Lote possui lances"));
    const notifier: IAuctionNotifier = {
      bidPlaced: vi.fn(),
      lotUpdated: vi.fn(),
      walletUpdated: vi.fn()
    };
    const useCase = new CancelLotUseCase(
      { findById: vi.fn(), listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenUnbidLot },
      notifier
    );

    await expect(useCase.execute("lot-1", "seller-1")).rejects.toThrow("Lote possui lances");
    expect(notifier.lotUpdated).not.toHaveBeenCalled();
  });
});
