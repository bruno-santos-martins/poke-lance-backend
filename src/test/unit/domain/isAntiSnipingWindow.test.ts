import { describe, expect, it } from "vitest";
import { isAntiSnipingWindow } from "../../../core/domain/AuctionRules";

describe("isAntiSnipingWindow", () => {
  it("includes auctions ending within the last two minutes", () => {
    const now = new Date("2026-10-29T12:00:00.000Z");

    expect(isAntiSnipingWindow(new Date(now.getTime() + 120_000), now)).toBe(true);
    expect(isAntiSnipingWindow(new Date(now.getTime() + 1), now)).toBe(true);
  });

  it("excludes auctions ending after the last two minutes or already expired", () => {
    const now = new Date("2026-10-29T12:00:00.000Z");

    expect(isAntiSnipingWindow(new Date(now.getTime() + 120_001), now)).toBe(false);
    expect(isAntiSnipingWindow(new Date(now.getTime() - 1), now)).toBe(false);
  });
});
