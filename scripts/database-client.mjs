import pg from "pg";
import { readFileSync } from "node:fs";

export function databaseClient() {
  const uri = new URL(process.env.SUPABASE_DATABASE_URL || "");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const ref = api.hostname.split(".")[0];
  if (!["postgres:", "postgresql:"].includes(uri.protocol)) throw new Error("INVALID_DATABASE_URI");
  if (!(uri.hostname === `db.${ref}.supabase.co` || decodeURIComponent(uri.username).endsWith(`.${ref}`))) {
    throw new Error("DATABASE_API_PROJECT_MISMATCH");
  }
  return new pg.Client({
    host: uri.hostname, port: Number(uri.port || 5432),
    user: decodeURIComponent(uri.username), password: decodeURIComponent(uri.password),
    database: uri.pathname.slice(1),
    ssl: { rejectUnauthorized: true, ca: readFileSync(new URL("../config/supabase-ca.crt", import.meta.url), "utf8") },
    connectionTimeoutMillis: 15000, query_timeout: 30000,
  });
}
export function safeFailure(error) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  if (/^[A-Z0-9_]+$/.test(error?.message || "")) return error.message;
  return "DATABASE_OPERATION_FAILED";
}
