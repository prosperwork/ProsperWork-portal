import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('portal/.env', 'utf8');
const match = env.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
const dbUrl = match[1];

const client = new Client({ connectionString: dbUrl });
await client.connect();
const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
console.log(res.rows.map(r => r.table_name));
await client.end();
