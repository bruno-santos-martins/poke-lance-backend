import { describe, expect, it } from "vitest";
import { minimumBid } from "../../../core/domain/AuctionRules";

describe("minimumBid", () => {
  it("uses the starting bid when no bid has been placed", () => {
    expect(minimumBid(null, 1000, 100)).toBe(1000);
  });

  it("adds the minimum increment to the current bid", () => {
    expect(minimumBid(1250, 1000, 100)).toBe(1350);
  });
});
