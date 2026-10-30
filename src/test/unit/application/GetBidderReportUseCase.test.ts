import { describe, expect, it, vi } from "vitest";
import type { IBidderReportRepository, BidderReport } from "../../../core/ports/repositories";
import { GetBidderReportUseCase } from "../../../application/use-cases/bidder/GetBidderReportUseCase";

describe("GetBidderReportUseCase", () => {
  it("returns the report for the requested bidder", async () => {
    const report: BidderReport = {
      wallet: { userId: "bidder-1", balance: 0, committed: 0, available: 0 },
      acquiredCards: [],
      bids: [],
      transactions: []
    };
    const getForBidder = vi.fn<IBidderReportRepository["getForBidder"]>().mockResolvedValue(report);
    const useCase = new GetBidderReportUseCase({ getForBidder });

    await expect(useCase.execute("bidder-1")).resolves.toBe(report);
    expect(getForBidder).toHaveBeenCalledWith("bidder-1");
  });

  it("propagates report repository failures", async () => {
    const getForBidder = vi.fn<IBidderReportRepository["getForBidder"]>()
      .mockRejectedValue(new Error("Falha ao gerar relatório"));
    const useCase = new GetBidderReportUseCase({ getForBidder });

    await expect(useCase.execute("bidder-1")).rejects.toThrow("Falha ao gerar relatório");
  });
});
