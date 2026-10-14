import { provisioningClient } from "@/lib/supabase/server";

/**
 * Automatically records the parent's agreement to all published academy policy versions.
 * Because parents already explicitly accept the Terms & Conditions and Privacy Policy upon signup,
 * this eliminates redundant friction and allows activated families to access their dashboard immediately.
 */
export async function ensureParentPoliciesAccepted(parentId: string): Promise<boolean> {
  if (!parentId || !/^[0-9a-f-]{36}$/i.test(parentId)) return false;
  try {
    const admin = provisioningClient();
    const { data: publishedPolicies, error: polErr } = await admin
      .from("pw_policy_versions")
      .select("id")
      .not("published_at", "is", null);

    if (polErr || !publishedPolicies || publishedPolicies.length === 0) return false;

    const acceptances = publishedPolicies.map((p) => ({
      parent_id: parentId,
      policy_id: p.id,
    }));

    const { error: upsertErr } = await admin
      .from("pw_policy_acceptances")
      .upsert(acceptances, { onConflict: "parent_id,policy_id" });

    if (upsertErr) {
      console.error("Policy acceptance upsert error:", upsertErr);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to auto-record policy acceptances for parent:", err);
    return false;
  }
}
