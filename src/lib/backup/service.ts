import { google } from "googleapis";
import pg from "pg";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

const { Client, types: pgTypes } = pg;

// Preserve PostgreSQL DATE (OID 1082) as exact YYYY-MM-DD strings without local-timezone drift
pgTypes.setTypeParser(1082, (val: string) => val);

function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth credentials missing in environment.");
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground",
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

function getPgSslConfig() {
  const caPath = path.resolve(process.cwd(), "config", "supabase-ca.crt");
  if (fs.existsSync(caPath)) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caPath, "utf8"),
    };
  }
  return { rejectUnauthorized: true };
}

function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatPgArray(arr: unknown[], udtName: string): string {
  const elemType = udtName.startsWith("_") ? udtName.slice(1) : "text";
  const serializeItem = (item: unknown): string => {
    if (item === null || item === undefined) return "NULL";
    const s = item instanceof Date ? item.toISOString() : String(item);
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  };
  return `${escapeSqlLiteral(`{${arr.map(serializeItem).join(",")}}`)}::${elemType}[]`;
}

function formatSqlValue(val: unknown, colMeta?: { data_type: string; udt_name: string }): string {
  if (val === null || val === undefined) return "NULL";
  const dataType = colMeta?.data_type || "";
  const udtName = colMeta?.udt_name || "";

  if (Buffer.isBuffer(val)) {
    return `'\\x${val.toString("hex")}'::bytea`;
  }
  if (val instanceof Date) {
    const iso = val.toISOString();
    return dataType === "date" ? `${escapeSqlLiteral(iso.slice(0, 10))}::date` : `${escapeSqlLiteral(iso)}::timestamptz`;
  }
  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "NULL";
  }
  if (Array.isArray(val) && dataType === "ARRAY") {
    return formatPgArray(val, udtName);
  }
  if (dataType === "jsonb" || dataType === "json") {
    return `${escapeSqlLiteral(JSON.stringify(val))}::${dataType}`;
  }
  if (typeof val === "object") {
    return `${escapeSqlLiteral(JSON.stringify(val))}::jsonb`;
  }
  return escapeSqlLiteral(String(val));
}

function orderTablesByForeignKeys(
  tables: string[],
  edges: Array<{ child: string; parent: string }>,
): string[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const tableSet = new Set(tables);

  for (const t of tables) {
    inDegree.set(t, 0);
    dependents.set(t, []);
  }
  for (const { child, parent } of edges) {
    if (child === parent || !tableSet.has(child) || !tableSet.has(parent)) continue;
    dependents.get(parent)!.push(child);
    inDegree.set(child, (inDegree.get(child) || 0) + 1);
  }

  const queue = tables.filter((t) => (inDegree.get(t) || 0) === 0).sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const dep of dependents.get(current) || []) {
      const nextDeg = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, nextDeg);
      if (nextDeg === 0) queue.push(dep);
    }
  }

  // Append any remaining cyclic tables deterministically
  for (const t of tables) {
    if (!ordered.includes(t)) ordered.push(t);
  }
  return ordered;
}

export interface BackupResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  webViewLink?: string;
  sizeBytes?: number;
  tableCount?: number;
  error?: string;
}

/**
 * Generates a consistent, type-accurate SQL backup inside a READ ONLY REPEATABLE READ
 * transaction and streams it directly to Google Drive without writing plaintext to disk.
 */
export async function executeDatabaseBackup(): Promise<BackupResult> {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    return { success: false, error: "Database connection string not configured." };
  }

  const client = new Client({
    connectionString,
    ssl: getPgSslConfig(),
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `prosperwork_db_backup_${timestamp}.sql`;

  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;");

    const chunks: string[] = [
      `-- ==================================================\n`,
      `-- ProsperWork Music Academy Database Production Backup\n`,
      `-- Generated At: ${new Date().toISOString()}\n`,
      `-- ==================================================\n\n`,
      `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`,
    ];

    const tablesRes = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const rawTables = tablesRes.rows.map((r) => r.table_name);

    const fkRes = await client.query<{ child: string; parent: string }>(`
      SELECT
        tc.table_name AS child,
        ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_schema = 'public';
    `);

    const colsRes = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_identity: string;
    }>(`
      SELECT table_name, column_name, data_type, udt_name, is_identity
      FROM information_schema.columns
      WHERE table_schema = 'public';
    `);

    const colMap = new Map<string, { data_type: string; udt_name: string }>();
    const identityTables = new Set<string>();
    for (const c of colsRes.rows) {
      colMap.set(`${c.table_name}.${c.column_name}`, { data_type: c.data_type, udt_name: c.udt_name });
      if (c.is_identity === "YES") identityTables.add(c.table_name);
    }

    const tables = orderTablesByForeignKeys(rawTables, fkRes.rows);

    for (const table of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(table)) continue;
      chunks.push(`-- Table: public."${table}"\n`);
      const dataRes = await client.query(`SELECT * FROM public."${table}"`);
      if (dataRes.rows.length === 0) {
        chunks.push(`-- (0 rows)\n\n`);
        continue;
      }

      const cols = dataRes.fields.map((f) => `"${f.name}"`).join(", ");
      const overriding = identityTables.has(table) ? " OVERRIDING SYSTEM VALUE" : "";
      for (const row of dataRes.rows) {
        const vals = dataRes.fields
          .map((f) => formatSqlValue(row[f.name], colMap.get(`${table}.${f.name}`)))
          .join(", ");
        chunks.push(`INSERT INTO public."${table}" (${cols})${overriding} VALUES (${vals}) ON CONFLICT DO NOTHING;\n`);
      }
      chunks.push(`\n`);
    }

    await client.query("COMMIT;");

    const sqlBuffer = Buffer.from(chunks.join(""), "utf8");
    const sizeBytes = sqlBuffer.byteLength;

    // Stream directly from memory to Google Drive (no plaintext file written to process.cwd())
    const auth = getGoogleOAuth2Client();
    const drive = google.drive({ version: "v3", auth });
    const rawFolderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || "";
    const folderId = /^[a-zA-Z0-9_-]{5,128}$/.test(rawFolderId) ? rawFolderId : "";

    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: folderId ? [folderId] : [],
      },
      media: {
        mimeType: "application/sql",
        body: Readable.from(sqlBuffer),
      },
      fields: "id, name, webViewLink",
    });

    // Record backup event using actual pw_operations_events schema (action, subject, actor, notes)
    try {
      await client.query(
        `INSERT INTO public.pw_operations_events (action, subject, actor, notes)
         VALUES ($1, $2, NULL, $3);`,
        [
          "database_backup",
          uploadRes.data.id || fileName,
          `Automated backup ${fileName} (${sizeBytes} bytes, ${tables.length} tables)`,
        ],
      );
    } catch (logErr) {
      console.warn("Could not record event in pw_operations_events:", logErr);
    }

    // Prune older academy backups only (strictly matching prosperwork_db_backup_ prefix)
    if (folderId) {
      try {
        const listRes = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false and mimeType = 'application/sql' and name contains 'prosperwork_db_backup_'`,
          orderBy: "createdTime desc",
          fields: "files(id, name, createdTime)",
        });
        const files = (listRes.data.files || []).filter(
          (f) => typeof f.name === "string" && f.name.startsWith("prosperwork_db_backup_"),
        );
        if (files.length > 10) {
          for (const oldFile of files.slice(10)) {
            if (oldFile.id) await drive.files.delete({ fileId: oldFile.id });
          }
        }
      } catch (pruneErr) {
        console.warn("Backup pruning note:", pruneErr);
      }
    }

    return {
      success: true,
      fileId: uploadRes.data.id || undefined,
      fileName,
      webViewLink: uploadRes.data.webViewLink || undefined,
      sizeBytes,
      tableCount: tables.length,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // ignore rollback failure
    }
    console.error("Database backup failed:", err);
    return { success: false, error: "Backup process failed." };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore disconnect failure
    }
  }
}
