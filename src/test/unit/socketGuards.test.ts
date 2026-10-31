import { describe, expect, it } from "vitest";
import { createSocketEventRateLimiter, isAllowedSocketOrigin } from "../../adapters/in/websocket/socketGuards";
import { getClientOrigins } from "../../adapters/in/http/clientOrigins";

describe("Socket.IO guards", () => {
  it("allows only the configured browser origin, while permitting clients without Origin", () => {
    const origins = ["https://auction.example"];
    expect(isAllowedSocketOrigin(undefined, origins)).toBe(true);
    expect(isAllowedSocketOrigin("https://auction.example", origins)).toBe(true);
    expect(isAllowedSocketOrigin("https://attacker.example", origins)).toBe(false);
  });

  it("allows both loopback hostnames only outside production", () => {
    expect(getClientOrigins("http://localhost:5173", false)).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]);
    expect(getClientOrigins("http://localhost:5173", true)).toEqual(["http://localhost:5173"]);
  });

  it("limits received events per connection and resets after the window", () => {
    const allowEvent = createSocketEventRateLimiter(2, 1_000);

    expect(allowEvent(0)).toBe(true);
    expect(allowEvent(1)).toBe(true);
    expect(allowEvent(2)).toBe(false);
    expect(allowEvent(1_000)).toBe(true);
  });
});
