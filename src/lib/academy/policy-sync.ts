import { provisioningClient } from "@/lib/supabase/server";

/**
 * Ensures that the specified parent (or guardian) has recorded acceptances for all
 * currently published academy policies. This fulfills Option 1 (auto-acknowledgement
 * on signup / activation), preventing redundant blocking gates on /onboarding.
 */
export async function ensureParentPoliciesAccepted(parentId: string): Promise<void> {
  if (!parentId) return;
  try {
    const admin = provisioningClient();

    // Verify user role
    const { data: profile } = await admin
      .from("pw_profiles")
      .select("id, role")
      .eq("id", parentId)
      .maybeSingle();

    if (!profile) return;
    const role = (profile.role ?? "").toLowerCase();
    if (role !== "parent" && role !== "student") {
      return;
    }

    // Fetch all published policies (generic or targeted to this parent)
    const { data: policies, error: fetchErr } = await admin
      .from("pw_policy_versions")
      .select("id, key, version, published_at, audience_parent_id")
      .not("published_at", "is", null)
      .or(`audience_parent_id.is.null,audience_parent_id.eq.${parentId}`)
      .order("version", { ascending: false });

    if (fetchErr || !policies || policies.length === 0) {
      return;
    }

    // Retain only latest version per policy key
    const latestByKey = new Map<string, string>();
    for (const p of policies) {
      if (!latestByKey.has(p.key)) {
        latestByKey.set(p.key, p.id);
      }
    }

    const acceptances = Array.from(latestByKey.values()).map(policyId => ({
      parent_id: parentId,
      policy_id: policyId,
    }));

    if (acceptances.length > 0) {
      await admin
        .from("pw_policy_acceptances")
        .upsert(acceptances, { onConflict: "parent_id,policy_id", ignoreDuplicates: true });
    }
  } catch (err) {
    console.error("[policy-sync] Failed to auto-accept policies:", err);
  }
}

