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
  department?: string;
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
  const { data: rawProfile, error: profileError } = await client.from("pw_profiles")
    .select("id,name,email,role,status,timezone,username,department").eq("id", user.id).single();
  if (profileError || !rawProfile) throw new Error("Academy account configuration is unavailable.");

  let profileData: AcademyProfile = {
    ...(rawProfile as AcademyProfile),
  };

  const { data: roleRow } = await client
    .from("pw_roles")
    .select("label,permissions,department")
    .eq("code", rawProfile.role)
    .maybeSingle();

  if (roleRow) {
    profileData.roleLabel = roleRow.label;
    profileData.department = rawProfile.department || roleRow.department;
    profileData.permissions = roleRow.permissions ?? [];
  }

  // Super Admin / Owner "View As Any User" Read-Only Impersonation:
  if (!options.rawOwner && (profileData.role === "super_admin" || profileData.role === "owner") && profileData.status === "active") {
    const cookieStore = await cookies();
    const viewAsId = parseViewAsCookie(cookieStore.get("pw_view_as")?.value, profileData.id);
    if (viewAsId) {
      const admin = provisioningClient();
      const targetUser = await admin.from("pw_profiles")
        .select("id,name,email,role,status,timezone,username,department").eq("id", viewAsId).single();
      if (targetUser.data && !targetUser.error && targetUser.data.role !== "super_admin" && targetUser.data.role !== "owner") {
        const { data: targetRole } = await admin
          .from("pw_roles")
          .select("label,permissions,department")
          .eq("code", targetUser.data.role)
          .maybeSingle();

        let impersonatedProfile: AcademyProfile = {
          ...(targetUser.data as AcademyProfile),
          roleLabel: targetRole?.label,
          department: targetUser.data.department || targetRole?.department,
          permissions: targetRole?.permissions ?? [],
          impersonated: true,
          realAdminId: profileData.id,
          realAdminName: profileData.name,
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

  if (!options.allowPolicy && profileData && ["parent", "student"].includes(profileData.role) && profileData.status === "active") {
    let gate = await client.rpc("pw_policy_ready");
    if (!gate.error && !gate.data && profileData.role === "parent") {
      await ensureParentPoliciesAccepted(profileData.id);
      gate = await client.rpc("pw_policy_ready");
    }
    if (gate.error) throw new Error("Policy acceptance could not be checked.");
    if (!gate.data) profileData = { ...profileData, status: "policy_required" };
  }
  return { client, user, profile: profileData };
}
