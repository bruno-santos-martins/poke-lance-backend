import { describe, expect, it, vi } from "vitest";
import type { ILotListingRepository, LotSummary } from "../../../core/ports/repositories";
import { ListLotsUseCase } from "../../../application/use-cases/lot/ListLotsUseCase";

describe("ListLotsUseCase", () => {
  it.each(["OPEN", "CLOSED", "CANCELLED"] as const)("forwards the %s status filter", async (status) => {
    const lots: LotSummary[] = [];
    const list = vi.fn<ILotListingRepository["list"]>().mockResolvedValue(lots);
    const useCase = new ListLotsUseCase({ list });

    await expect(useCase.execute(status)).resolves.toBe(lots);
    expect(list).toHaveBeenCalledWith(status);
  });

  it("lists lots without a status filter", async () => {
    const list = vi.fn<ILotListingRepository["list"]>().mockResolvedValue([]);
    const useCase = new ListLotsUseCase({ list });

    await useCase.execute();

    expect(list).toHaveBeenCalledWith(undefined);
  });

  it("propagates repository failures", async () => {
    const list = vi.fn<ILotListingRepository["list"]>().mockRejectedValue(new Error("Falha de listagem"));
    const useCase = new ListLotsUseCase({ list });

    await expect(useCase.execute("OPEN")).rejects.toThrow("Falha de listagem");
  });
});
