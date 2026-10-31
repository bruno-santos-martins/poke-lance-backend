export function getClientOrigins(
  clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  isProduction = process.env.NODE_ENV === "production"
): string[] {
  if (isProduction) return [clientOrigin];

  const origins = new Set([clientOrigin]);
  const parsedOrigin = new URL(clientOrigin);

  if (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1") {
    const localAlias = parsedOrigin.hostname === "localhost" ? "127.0.0.1" : "localhost";
    parsedOrigin.hostname = localAlias;
    origins.add(parsedOrigin.origin);
  }

  return [...origins];
}
