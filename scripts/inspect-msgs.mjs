import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('portal/.env', 'utf8');
const match = env.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
const dbUrl = match[1];

const client = new Client({ connectionString: dbUrl });
await client.connect();
const res = await client.query("SELECT id, direction, status, body, phone_number, created_at FROM pw_whatsapp_messages ORDER BY created_at DESC");
console.log(res.rows);
await client.end();
