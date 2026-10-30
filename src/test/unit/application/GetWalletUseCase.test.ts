import { describe, expect, it, vi } from "vitest";
import type { IWalletRepository } from "../../../core/ports/repositories";
import type { Wallet } from "../../../core/domain/entities";
import { GetWalletUseCase } from "../../../application/use-cases/wallet/GetWalletUseCase";

describe("GetWalletUseCase", () => {
  it("returns the bidder wallet", async () => {
    const wallet: Wallet = { userId: "bidder-1", balance: 5000, committed: 1000, available: 4000 };
    const findByUserId = vi.fn<IWalletRepository["findByUserId"]>().mockResolvedValue(wallet);
    const useCase = new GetWalletUseCase({
      findByUserId,
      deposit: vi.fn(),
      ensure: vi.fn()
    });

    await expect(useCase.execute("bidder-1")).resolves.toBe(wallet);
    expect(findByUserId).toHaveBeenCalledWith("bidder-1");
  });

  it("throws a not-found application error when the wallet does not exist", async () => {
    const findByUserId = vi.fn<IWalletRepository["findByUserId"]>().mockResolvedValue(null);
    const useCase = new GetWalletUseCase({
      findByUserId,
      deposit: vi.fn(),
      ensure: vi.fn()
    });

    await expect(useCase.execute("bidder-missing")).rejects.toMatchObject({
      name: "AppError",
      message: "Carteira não encontrada.",
      statusCode: 404
    });
  });

  it("propagates repository failures", async () => {
    const findByUserId = vi.fn<IWalletRepository["findByUserId"]>()
      .mockRejectedValue(new Error("Falha de leitura"));
    const useCase = new GetWalletUseCase({
      findByUserId,
      deposit: vi.fn(),
      ensure: vi.fn()
    });

    await expect(useCase.execute("bidder-1")).rejects.toThrow("Falha de leitura");
  });
});
