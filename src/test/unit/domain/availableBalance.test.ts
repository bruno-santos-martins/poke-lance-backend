import { describe, expect, it } from "vitest";
import { availableBalance } from "../../../core/domain/AuctionRules";

describe("availableBalance", () => {
  it("subtracts committed funds from the total balance", () => {
    expect(availableBalance(5000, 1200)).toBe(3800);
  });
});
