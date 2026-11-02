export const AUTH_COOKIE_NAME = "auction-session";

// Secure must be true when TLS is terminated by an upstream proxy (Render, Railway, Fly.io, etc.).
// Override with COOKIE_SECURE=true/false when needed.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const cookieSecureEnv = process.env.COOKIE_SECURE;
export const isSecureCookie =
  cookieSecureEnv === "true" ||
  (cookieSecureEnv !== "false" && trustProxyHops >= 1);

// SameSite=none is required when frontend and backend are on different origins (cross-origin cookies).
// SameSite=none requires Secure=true — browsers reject it over plain HTTP.
// In development (no proxy, plain HTTP) we fall back to "lax" so the cookie still works locally.
const sameSite = isSecureCookie ? ("none" as const) : ("lax" as const);

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite,
  path: "/",
  maxAge: 24 * 60 * 60 * 1000
};

export const CLEAR_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite,
  path: "/"
};
