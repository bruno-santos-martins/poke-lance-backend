export const AUTH_COOKIE_NAME = "auction-session";

// Secure must be true when TLS is terminated by an upstream proxy (Render, Railway, Fly.io, etc.).
// Override with COOKIE_SECURE=true/false when needed.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const cookieSecureEnv = process.env.COOKIE_SECURE;
export const isSecureCookie =
  cookieSecureEnv === "true" ||
  (cookieSecureEnv !== "false" && trustProxyHops >= 1);

// SameSite=lax is sufficient because frontend and backend share the same origin in production.
// SameSite=none + Secure is only required for cross-origin cookies, which this setup avoids.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 12 * 60 * 60 * 1000
};

export const CLEAR_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: "lax" as const,
  path: "/"
};
