import type { Role } from "../types";
import { parseViewAsCookie, provisioningClient, sessionClient } from "./server";
import { cookies } from "next/headers";
import { ensureParentPoliciesAccepted } from "../academy/policy-sync";

export interface AcademyProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel?: string;
  permissions?: string[];
  status: string;
  timezone: string;
  username: string;
  impersonated?: boolean;
  realAdminId?: string;
  realAdminName?: string;
}

export async function identity(options: { allowPolicy?: boolean; rawOwner?: boolean } = {}) {
  const client = await sessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { client, user: null, profile: null };
  let { data, error: profileError } = await client.from("pw_profiles")
    .select("id,name,email,role,status,timezone,username").eq("id", user.id).single();
  if (profileError || !data) throw new Error("Academy account configuration is unavailable.");

  // Super Admin "View As Any User" Read-Only Impersonation:
  if (!options.rawOwner && data.role === "super_admin" && data.status === "active") {
    const cookieStore = await cookies();
    const viewAsId = parseViewAsCookie(cookieStore.get("pw_view_as")?.value, data.id);
    if (viewAsId) {
      const admin = provisioningClient();
      const targetUser = await admin.from("pw_profiles")
        .select("id,name,email,role,status,timezone,username").eq("id", viewAsId).single();
      if (targetUser.data && !targetUser.error && targetUser.data.role !== "super_admin") {
        let impersonatedProfile: AcademyProfile = {
          ...(targetUser.data as AcademyProfile),
          impersonated: true,
          realAdminId: data.id,
          realAdminName: data.name,
        };
        // Read-only policy status check — NEVER mutate legal acceptances while impersonating
        if (!options.allowPolicy && ["parent", "student"].includes(impersonatedProfile.role) && impersonatedProfile.status === "active") {
          let policyOwnerId = impersonatedProfile.id;
          if (impersonatedProfile.role === "student") {
            const { data: studentLink } = await admin
              .from("pw_students")
              .select("parent_id")
              .eq("student_user_id", impersonatedProfile.id)
              .limit(1)
              .maybeSingle();
            if (studentLink?.parent_id) policyOwnerId = studentLink.parent_id;
          }
          const { count: currentCount } = await admin
            .from("pw_policy_versions")
            .select("id", { count: "exact", head: true })
            .not("published_at", "is", null)
            .or(`audience_parent_id.is.null,audience_parent_id.eq.${policyOwnerId}`);
          const { count: acceptedCount } = await admin
            .from("pw_policy_acceptances")
            .select("policy_id", { count: "exact", head: true })
            .eq("parent_id", policyOwnerId);
          if (!currentCount || currentCount < 3 || !acceptedCount || acceptedCount < 3) {
            impersonatedProfile = { ...impersonatedProfile, status: "policy_required" };
          }
        }
        return { client, user, profile: impersonatedProfile };
      }
    }
  }

  if (!options.allowPolicy && data && ["parent", "student"].includes(data.role) && data.status === "active") {
    let gate = await client.rpc("pw_policy_ready");
    if (!gate.error && !gate.data && data.role === "parent") {
      await ensureParentPoliciesAccepted(data.id);
      gate = await client.rpc("pw_policy_ready");
    }
    if (gate.error) throw new Error("Policy acceptance could not be checked.");
    if (!gate.data) data = { ...data, status: "policy_required" };
  }
  return { client, user, profile: data as AcademyProfile };
}
