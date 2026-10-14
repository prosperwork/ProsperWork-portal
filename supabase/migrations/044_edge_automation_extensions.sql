-- Supabase's supported scheduler and asynchronous HTTP transport.
-- Credentials are stored separately in Vault by the deployment script.
create extension if not exists pg_cron;
create extension if not exists pg_net;
