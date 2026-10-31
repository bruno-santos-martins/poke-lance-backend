export function isAllowedSocketOrigin(origin: string | undefined, clientOrigins: readonly string[]): boolean {
  return origin === undefined || clientOrigins.includes(origin);
}

export function createSocketEventRateLimiter(limit = 60, windowMs = 60_000) {
  let windowStartedAt: number | undefined;
  let eventCount = 0;

  return (now = Date.now()) => {
    if (windowStartedAt === undefined || now - windowStartedAt >= windowMs) {
      windowStartedAt = now;
      eventCount = 0;
    }

    if (eventCount >= limit) return false;

    eventCount += 1;
    return true;
  };
}
