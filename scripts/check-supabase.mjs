import pg from "pg";

// Deliberately never print configuration values, credentials, or raw provider errors.
const report = {};
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DATABASE_URL;

async function checkApi(key, path) {
  if (!projectUrl || !key) return { ok: false, reason: "missing_configuration" };
  try {
    const url = new URL(projectUrl);
    if (url.protocol !== "https:") return { ok: false, reason: "https_required" };
    const response = await fetch(new URL(path, url), {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, reason: error instanceof TypeError ? "invalid_url_or_connection_failed" : "connection_failed" };
  }
}

async function checkDatabase() {
  if (!databaseUrl) return { ok: false, reason: "missing_configuration" };
  let client;
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return { ok: false, reason: "postgresql_url_required" };
    const password = decodeURIComponent(url.password);
    // Brackets can be real password characters. Reject known placeholder tokens only.
    if (/^(?:\[|<)(?:YOUR[-_ ](?:DATABASE[-_ ])?PASSWORD|DATABASE[-_ ]PASSWORD|PASSWORD)(?:\]|>)$/i.test(password)) {
      return { ok: false, reason: "password_placeholder_not_replaced" };
    }
    if (!password) return { ok: false, reason: "missing_database_password" };
    // Passing parsed fields avoids connection-string SSL options overriding verification.
    client = new pg.Client({
      host: url.hostname, port: Number(url.port || 5432),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: url.pathname.slice(1), ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 15000, query_timeout: 15000,
    });
    await client.connect();
    const tables = await client.query("select tablename from pg_tables where schemaname = 'public' order by tablename limit 100");
    return { ok: true, publicTables: tables.rows.map((row) => row.tablename) };
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "CONNECTION_FAILED";
    return { ok: false, reason: code };
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

[report.publicApi, report.adminApi, report.database] = await Promise.all([
  checkApi(publicKey, "/auth/v1/settings"),
  checkApi(serverKey, "/auth/v1/admin/users?per_page=1"),
  checkDatabase(),
]);
console.log(JSON.stringify(report, null, 2));
process.exitCode = Object.values(report).every((result) => result.ok) ? 0 : 1;
