import { describe, expect, it, vi } from "vitest";
import type { IWalletRepository } from "../../../core/ports/repositories";
import type { Wallet } from "../../../core/domain/entities";
import { DepositBalanceUseCase } from "../../../application/use-cases/wallet/DepositBalanceUseCase";

describe("DepositBalanceUseCase", () => {
  it("delegates the bidder and deposit amount to the wallet repository", async () => {
    const wallet: Wallet = { userId: "bidder-1", balance: 2500, committed: 0, available: 2500 };
    const deposit = vi.fn<IWalletRepository["deposit"]>().mockResolvedValue(wallet);
    const useCase = new DepositBalanceUseCase({
      deposit,
      findByUserId: vi.fn(),
      ensure: vi.fn()
    });

    await expect(useCase.execute("bidder-1", 2500)).resolves.toBe(wallet);
    expect(deposit).toHaveBeenCalledWith("bidder-1", 2500);
  });

  it("propagates deposit failures", async () => {
    const deposit = vi.fn<IWalletRepository["deposit"]>().mockRejectedValue(new Error("Depósito inválido"));
    const useCase = new DepositBalanceUseCase({
      deposit,
      findByUserId: vi.fn(),
      ensure: vi.fn()
    });

    await expect(useCase.execute("bidder-1", 2500)).rejects.toThrow("Depósito inválido");
  });
});
