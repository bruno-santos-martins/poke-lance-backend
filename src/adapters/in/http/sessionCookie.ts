export const AUTH_COOKIE_NAME = "auction-session";

// Use COOKIE_SECURE=true only when the app is served over HTTPS.
// NODE_ENV=production alone is not sufficient — a Docker local dev build runs
// in production mode over plain HTTP, and browsers block Secure cookies on HTTP.
const isSecure = process.env.COOKIE_SECURE === "true";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecure,
  sameSite: isSecure ? "none" as const : "lax" as const,
  path: "/",
  maxAge: 12 * 60 * 60 * 1000
};

export const CLEAR_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isSecure,
  sameSite: isSecure ? "none" as const : "lax" as const,
  path: "/"
};
