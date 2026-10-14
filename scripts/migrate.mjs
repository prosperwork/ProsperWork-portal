import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { databaseClient, safeFailure } from "./database-client.mjs";

if (!process.argv.includes("--development")) {
  console.error("Use --development only after confirming this is the intended development database.");
  process.exit(1);
}
const client = databaseClient();
try {
  await client.connect();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(1791819736)");
  await client.query(`create table if not exists public.pw_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now());
    alter table public.pw_migrations enable row level security;
    revoke all on public.pw_migrations from anon,authenticated;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("select checksum from public.pw_migrations where name=$1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error("APPLIED_MIGRATION_WAS_CHANGED");
      continue;
    }
    await client.query(sql);
    await client.query("insert into public.pw_migrations(name,checksum) values($1,$2)", [name, checksum]);
    console.log(`Applied ${name}`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(safeFailure(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
