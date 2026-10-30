import { describe, expect, it, vi } from "vitest";
import type { IBidRepository, ILotRepository } from "../../../core/ports/repositories";
import type { Bid, Lot } from "../../../core/domain/entities";
import type { IHashService } from "../../../core/ports/services";
import { ValidateAuditChainUseCase } from "../../../application/use-cases/audit/ValidateAuditChainUseCase";

const lot: Lot = {
  id: "lot-1",
  sellerId: "seller-1",
  title: "Pikachu",
  imagePath: "/uploads/cards/pikachu.png",
  startingBid: 1000,
  minimumIncrement: 100,
  currentBid: null,
  endsAt: new Date("2026-10-30T12:00:00.000Z"),
  status: "OPEN"
};

function createBid(overrides: Partial<Bid> = {}): Bid {
  return {
    id: "bid-1",
    lotId: lot.id,
    bidderId: "1234-5678",
    sequence: 1,
    amount: 1000,
    createdAt: new Date("2026-10-30T11:00:00.000Z"),
    previousHash: null,
    hash: "hash-1",
    ...overrides
  };
}

function createUseCase(
  bids: Bid[],
  lotResult: Lot | null = lot,
  bidRepositoryError?: Error
) {
  const hashService: IHashService = { sha256: vi.fn(() => "hash-1") };
  const findById = vi.fn<ILotRepository["findById"]>().mockResolvedValue(lotResult);
  const listByLotId = vi.fn<IBidRepository["listByLotId"]>().mockResolvedValue(bids);
  if (bidRepositoryError) listByLotId.mockRejectedValue(bidRepositoryError);
  const useCase = new ValidateAuditChainUseCase(
    hashService,
    { findById, listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenLot: vi.fn() },
    { listByLotId }
  );
  return { useCase, hashService, findById, listByLotId };
}

describe("ValidateAuditChainUseCase", () => {
  it("validates an empty bid chain", async () => {
    const { useCase, listByLotId } = createUseCase([]);

    await expect(useCase.execute(lot.id)).resolves.toEqual({
      lotId: lot.id,
      valid: true,
      bids: []
    });
    expect(listByLotId).toHaveBeenCalledWith(lot.id);
  });

  it("validates hashes and masks bidder identifiers in the audit history", async () => {
    const firstBid = createBid();
    const secondBid = createBid({
      id: "bid-2",
      bidderId: "abcd-5678",
      sequence: 2,
      amount: 1200,
      previousHash: "hash-1",
      hash: "hash-1",
      createdAt: new Date("2026-10-30T11:01:00.000Z")
    });
    const hashService: IHashService = {
      sha256: vi.fn()
        .mockReturnValueOnce("hash-1")
        .mockReturnValueOnce("hash-1")
    };
    const findById = vi.fn<ILotRepository["findById"]>().mockResolvedValue(lot);
    const listByLotId = vi.fn<IBidRepository["listByLotId"]>().mockResolvedValue([firstBid, secondBid]);
    const useCase = new ValidateAuditChainUseCase(
      hashService,
      { findById, listOpen: vi.fn(), createWithSellerWallet: vi.fn(), cancelOpenLot: vi.fn() },
      { listByLotId }
    );

    const result = await useCase.execute(lot.id);

    expect(result.valid).toBe(true);
    expect(result.bids.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(result.bids.map((entry) => entry.bidder)).toEqual(["Licitante #1234", "Licitante #ABCD"]);
    expect(hashService.sha256).toHaveBeenNthCalledWith(
      1,
      `${firstBid.id}${firstBid.lotId}${firstBid.bidderId}${firstBid.amount}${firstBid.createdAt.toISOString()}`
    );
    expect(hashService.sha256).toHaveBeenNthCalledWith(
      2,
      `${secondBid.id}${secondBid.lotId}${secondBid.bidderId}${secondBid.amount}${secondBid.createdAt.toISOString()}hash-1`
    );
  });

  it("marks the chain invalid when a stored hash does not match", async () => {
    const { useCase } = createUseCase([createBid({ hash: "tampered-hash" })]);

    const result = await useCase.execute(lot.id);

    expect(result.valid).toBe(false);
    expect(result.bids[0]?.hash).toBe("tampered-hash");
  });

  it("marks the chain invalid when a previous hash link is broken", async () => {
    const secondBid = createBid({
      id: "bid-2",
      sequence: 2,
      previousHash: "unexpected-hash"
    });
    const { useCase } = createUseCase([createBid(), secondBid]);

    const result = await useCase.execute(lot.id);

    expect(result.valid).toBe(false);
    expect(result.bids[1]?.previousHash).toBe("unexpected-hash");
  });

  it("does not load bids when the lot does not exist", async () => {
    const { useCase, listByLotId } = createUseCase([], null);

    await expect(useCase.execute("missing-lot")).rejects.toMatchObject({
      name: "AppError",
      message: "Lote não encontrado.",
      statusCode: 404
    });
    expect(listByLotId).not.toHaveBeenCalled();
  });

  it("propagates repository failures", async () => {
    const { useCase, listByLotId } = createUseCase([], lot, new Error("Falha ao carregar lances"));

    await expect(useCase.execute(lot.id)).rejects.toThrow("Falha ao carregar lances");
    expect(listByLotId).toHaveBeenCalledWith(lot.id);
  });
});
