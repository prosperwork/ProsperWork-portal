import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('portal/.env', 'utf8');
const match = env.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
const dbUrl = match[1];

const client = new Client({ connectionString: dbUrl });
await client.connect();
const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pw_leads' ORDER BY ordinal_position");
console.log(res.rows);
await client.end();
