import { describe, expect, it } from "vitest";
import { createSocketEventRateLimiter, isAllowedSocketOrigin } from "../../adapters/in/websocket/socketGuards";

describe("Socket.IO guards", () => {
  it("allows only the configured browser origin, while permitting clients without Origin", () => {
    expect(isAllowedSocketOrigin(undefined, "https://auction.example")).toBe(true);
    expect(isAllowedSocketOrigin("https://auction.example", "https://auction.example")).toBe(true);
    expect(isAllowedSocketOrigin("https://attacker.example", "https://auction.example")).toBe(false);
  });

  it("limits received events per connection and resets after the window", () => {
    const allowEvent = createSocketEventRateLimiter(2, 1_000);

    expect(allowEvent(0)).toBe(true);
    expect(allowEvent(1)).toBe(true);
    expect(allowEvent(2)).toBe(false);
    expect(allowEvent(1_000)).toBe(true);
  });
});
