import { createClient } from "@supabase/supabase-js";

// Privileged system delivery, never used for ordinary academy data requests.
// Call only after owner authorization, or in the trusted background worker.
export function automationClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
