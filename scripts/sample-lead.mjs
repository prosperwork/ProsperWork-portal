import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('portal/.env', 'utf8');
const match = env.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
const dbUrl = match[1];

const client = new Client({ connectionString: dbUrl });
await client.connect();
const res = await client.query("SELECT id, payload FROM pw_leads LIMIT 1");
console.log(JSON.stringify(res.rows[0], null, 2));
await client.end();
