import type { Role } from "../types";
import { provisioningClient, sessionClient } from "./server";
import { cookies } from "next/headers";
import { ensureParentPoliciesAccepted } from "../academy/policy-sync";

export interface AcademyProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
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
  const owner = process.env.PROSPERWORK_OWNER_EMAIL?.trim().toLowerCase();
  if (owner && data.role !== "super_admin" && user.email_confirmed_at && user.email?.toLowerCase() === owner) {
    const settingsResponse = await fetch(new URL("/auth/v1/settings", process.env.NEXT_PUBLIC_SUPABASE_URL!), {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, cache: "no-store",
    });
    const settings = await settingsResponse.json().catch(() => null);
    // Auto-confirming a public registration does not prove email ownership.
    if (!settingsResponse.ok || settings?.mailer_autoconfirm !== false) {
      throw new Error("Enable email confirmations in Supabase before activating the owner account.");
    }
    const admin = provisioningClient();
    // This RPC is callable by service_role only, and takes a transaction lock.
    const { error: setupError } = await admin.rpc("pw_bootstrap_owner", { target: user.id, designated_email: owner });
    if (setupError) throw new Error("Owner activation could not be completed.");
    const activated = await client.from("pw_profiles")
      .select("id,name,email,role,status,timezone,username").eq("id", user.id).single();
    data = activated.data; profileError = activated.error;
    if (profileError || !data) throw new Error("Owner activation could not be verified.");
  }

  // Super Admin "View As Any User" Impersonation:
  if (!options.rawOwner && data.role === "super_admin" && data.status === "active") {
    const cookieStore = await cookies();
    const viewAsId = cookieStore.get("pw_view_as")?.value;
    if (viewAsId && /^[0-9a-f-]{36}$/i.test(viewAsId) && viewAsId !== data.id) {
      const admin = provisioningClient();
      const targetUser = await admin.from("pw_profiles")
        .select("id,name,email,role,status,timezone,username").eq("id", viewAsId).single();
      if (targetUser.data && !targetUser.error) {
        let impersonatedProfile = {
          ...targetUser.data,
          impersonated: true,
          realAdminId: data.id,
          realAdminName: data.name,
        };
        if (!options.allowPolicy && ["parent", "student"].includes(impersonatedProfile.role) && impersonatedProfile.status === "active") {
          let gate = await client.rpc("pw_policy_ready");
          if (!gate.error && !gate.data && impersonatedProfile.role === "parent") {
            await ensureParentPoliciesAccepted(impersonatedProfile.id);
            gate = await client.rpc("pw_policy_ready");
          }
          if (!gate.error && !gate.data) {
            impersonatedProfile = { ...impersonatedProfile, status: "policy_required" };
          }
        }
        return { client, user, profile: impersonatedProfile as AcademyProfile };
      }
    }
  }

  if (!options.allowPolicy && data && ["parent","student"].includes(data.role) && data.status==="active") {
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
