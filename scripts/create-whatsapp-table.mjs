import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('portal/.env', 'utf8');
const match = env.match(/SUPABASE_DATABASE_URL="([^"]+)"/);
const dbUrl = match[1];

const client = new Client({ connectionString: dbUrl });
await client.connect();

const migrationSql = `
CREATE TABLE IF NOT EXISTS pw_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  lead_id text REFERENCES pw_leads(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_name text,
  message_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  interactive_type text,
  selected_button_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_pw_whatsapp_messages_lead ON pw_whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_pw_whatsapp_messages_phone ON pw_whatsapp_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_pw_whatsapp_messages_created ON pw_whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pw_whatsapp_messages_wamid ON pw_whatsapp_messages(wa_message_id);

ALTER TABLE pw_whatsapp_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pw_whatsapp_messages' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON pw_whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pw_whatsapp_messages' AND policyname = 'authenticated_read'
  ) THEN
    CREATE POLICY authenticated_read ON pw_whatsapp_messages FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pw_whatsapp_messages' AND policyname = 'authenticated_insert'
  ) THEN
    CREATE POLICY authenticated_insert ON pw_whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pw_whatsapp_messages' AND policyname = 'authenticated_update'
  ) THEN
    CREATE POLICY authenticated_update ON pw_whatsapp_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

await client.query(migrationSql);
console.log("Migration executed successfully!");
await client.end();
