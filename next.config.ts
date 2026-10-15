import type { NextConfig } from "next";

const allowedDevOrigins = [
  process.env.REPLIT_DEV_DOMAIN,
  "*.replit.dev",
  "*.repl.co",
  "127.0.0.1",
  "localhost",
].filter((origin): origin is string => Boolean(origin));

const nextConfig: NextConfig = { allowedDevOrigins, experimental: { proxyClientMaxBodySize: "500mb" } };

export default nextConfig;
