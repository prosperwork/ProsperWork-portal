import { google } from 'googleapis';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials missing in .env');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return oauth2Client;
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
 * Generates an automated, complete SQL dump of the database
 * and uploads it directly into the official Google Drive backups folder.
 */
export async function executeDatabaseBackup(): Promise<BackupResult> {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    return { success: false, error: 'Database connection string not configured.' };
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `prosperwork_db_backup_${timestamp}.sql`;
  const tempPath = path.resolve(fileName);

  try {
    await client.connect();

    let output = `-- ==================================================\n`;
    output += `-- ProsperWork Music Academy Database Production Backup\n`;
    output += `-- Generated At: ${new Date().toISOString()}\n`;
    output += `-- Target Account: ${process.env.GOOGLE_CALENDAR_ID || 'prosperworkmusicconcepts@gmail.com'}\n`;
    output += `-- ==================================================\n\n`;
    output += `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`;

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = tablesRes.rows.map(r => r.table_name);

    for (const table of tables) {
      output += `-- Table: public."${table}"\n`;
      const dataRes = await client.query(`SELECT * FROM public."${table}"`);
      if (dataRes.rows.length === 0) {
        output += `-- (0 rows)\n\n`;
        continue;
      }

      const cols = dataRes.fields.map(f => `"${f.name}"`).join(', ');

      for (const row of dataRes.rows) {
        const vals = dataRes.fields.map(f => {
          const val = row[f.name];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number' || typeof val === 'boolean') return val;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');

        output += `INSERT INTO public."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
      }
      output += `\n`;
    }

    fs.writeFileSync(tempPath, output, 'utf8');
    const stats = fs.statSync(tempPath);

    // Upload to Google Drive
    const auth = getGoogleOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;

    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: folderId ? [folderId] : []
      },
      media: {
        mimeType: 'application/sql',
        body: fs.createReadStream(tempPath)
      },
      fields: 'id, name, webViewLink'
    });

    // Record the backup event in pw_operations_events for admin visibility
    try {
      await client.query(`
        INSERT INTO public.pw_operations_events (event_type, details, created_at)
        VALUES (
          'database_backup',
          $1::jsonb,
          NOW()
        );
      `, [JSON.stringify({
        fileName,
        fileId: uploadRes.data.id,
        link: uploadRes.data.webViewLink,
        sizeBytes: stats.size,
        tableCount: tables.length,
        automated: true
      })]);
    } catch (logErr: any) {
      console.warn('Could not record event in pw_operations_events:', logErr.message);
    }

    // Auto-prune older backups (keep last 10)
    if (folderId) {
      try {
        const listRes = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false and mimeType = 'application/sql'`,
          orderBy: 'createdTime desc',
          fields: 'files(id, name, createdTime)'
        });
        const files = listRes.data.files || [];
        if (files.length > 10) {
          for (const oldFile of files.slice(10)) {
            if (oldFile.id) await drive.files.delete({ fileId: oldFile.id });
          }
        }
      } catch (pruneErr: any) {
        console.warn('Backup pruning note:', pruneErr.message);
      }
    }

    return {
      success: true,
      fileId: uploadRes.data.id || undefined,
      fileName,
      webViewLink: uploadRes.data.webViewLink || undefined,
      sizeBytes: stats.size,
      tableCount: tables.length
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Backup process failed.' };
  } finally {
    try { await client.end(); } catch {}
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

