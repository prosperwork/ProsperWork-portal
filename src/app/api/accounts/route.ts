import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { publicAppUrl } from "@/lib/supabase/app-url.mjs";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { createViewAsCookie, parseViewAsCookie, provisioningClient, sameOrigin } from "@/lib/supabase/server";
import { accountSchema } from "@/lib/academy/schemas";
import { deliverEmail } from "@/lib/email/transport.mjs";
import { ensureParentPoliciesAccepted } from "@/lib/academy/policy-sync";
import { getRoleLabel, hasPermission } from "@/lib/academy/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, client } = await identity();
    const canView = await hasPermission(client, profile, "accounts.view");
    if (!canView) return NextResponse.json({ error: "Administrative staff or owner access required." }, { status: 403 });
    const { data, error } = await client.from("pw_profiles").select("id,name,email,role,status,timezone,username").order("name");
    if (error) throw error;
    return NextResponse.json({ accounts: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Accounts could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { profile, client } = await identity({ rawOwner: true });
    const canView = await hasPermission(client, profile, "accounts.view");
    if (!profile || !canView) return NextResponse.json({ error: "Administrative staff or owner access required." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const admin = provisioningClient();

    // Impersonation / View As User Action (Read-Only)
    if (body?.action === "view_as") {
      if (profile.role !== "super_admin" && profile.role !== "owner") return NextResponse.json({ error: "Owner access required for impersonation." }, { status: 403 });
      const targetId = String(body.targetId || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === profile.id) {
        return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
      }
      const { data: targetUser, error: targetErr } = await admin.from("pw_profiles")
        .select("id,name,role,email").eq("id", targetId).single();
      if (targetErr || !targetUser) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      if (targetUser.role === "super_admin" || targetUser.role === "owner") {
        return NextResponse.json({ error: "Super Admin accounts cannot be impersonated." }, { status: 403 });
      }

      try {
        await admin.from("pw_audit").insert({
          actor_id: profile.id,
          actor_name: profile.name,
          actor_role: profile.role,
          entity_type: "pw_profiles",
          entity_id: targetUser.id,
          action: "impersonation_start",
          changed_fields: ["view_as_role:" + targetUser.role],
        });
      } catch {
        // audit insert failure should not block support view
      }

      const response = NextResponse.json({ ok: true, target: targetUser });
      response.cookies.set("pw_view_as", createViewAsCookie(profile.id, targetUser.id), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3600 * 4,
      });
      return response;
    }

    // Exit Impersonation / Return to Owner View
    if (body?.action === "exit_view_as") {
      try {
        await admin.from("pw_audit").insert({
          actor_id: profile.id,
          actor_name: profile.name,
          actor_role: profile.role,
          entity_type: "pw_profiles",
          entity_id: profile.id,
          action: "impersonation_exit",
          changed_fields: [],
        });
      } catch {
        // ignore audit failure
      }

      const response = NextResponse.json({ ok: true });
      response.cookies.set("pw_view_as", "", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
      });
      return response;
    }

    // All remaining mutations require Super Admin authority and must NOT run during read-only View-As mode
    if (profile.role !== "super_admin" && profile.role !== "owner") {
      return NextResponse.json({ error: "Owner (Super Admin) access is required to modify, invite, or delete accounts." }, { status: 403 });
    }
    const cookieStore = await cookies();
    if (parseViewAsCookie(cookieStore.get("pw_view_as")?.value, profile.id)) {
      return NextResponse.json({ error: "View-As mode is read-only. Exit View-As before modifying accounts." }, { status: 403 });
    }

    if (body?.action === "delete") {
      const targetId = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
      if (targetId === profile.id) return NextResponse.json({ error: "You cannot delete your own Super Admin account." }, { status: 400 });

      const { data: target, error: targetError } = await admin.from("pw_profiles").select("id,name,email,role,status").eq("id", targetId).single();
      if (targetError || !target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      if (target.role === "super_admin" || target.role === "owner") return NextResponse.json({ error: "Owner accounts cannot be deleted through this workflow." }, { status: 403 });

      const reason = String(body.reason || "Permanent purge requested by Super Admin").slice(0, 500);
      const { data: purgeResult, error: purgeError } = await admin.rpc("pw_purge_account", {
        actor: profile.id,
        target: targetId,
        reason,
      });

      if (purgeError) {
        console.error("pw_purge_account failed:", purgeError);
        return NextResponse.json({ error: "Account deletion could not be completed. Ensure latest database migrations are applied." }, { status: 503 });
      }

      const outcome = purgeResult as { allowed?: boolean; reasons?: string[]; message?: string } | null;
      if (!outcome?.allowed) {
        return NextResponse.json({
          error: outcome?.message || "Cannot permanently delete this account because it is linked to protected records.",
          blocked: true,
          blockers: outcome?.reasons || [],
        }, { status: 409 });
      }

      try {
        await admin.auth.admin.deleteUser(targetId);
      } catch (authDelErr) {
        console.warn("Supabase Auth user cleanup note after profile purge:", authDelErr);
      }

      return NextResponse.json({ ok: true, message: `Account for ${target.name} (${target.email}) was permanently purged.` });
    }

    if (body?.action === "invite") {
      const parsed = accountSchema.safeParse(body.account);
      if (!parsed.success || parsed.data.role === "super_admin" || parsed.data.role === "owner") {
        return NextResponse.json({ error: "Check the invitation details. Additional owner access requires a separate approval." }, { status: 400 });
      }
      const account = parsed.data;

      const redirectTo = publicAppUrl("/auth/confirm?next=/reset-password&reason=invite").href;
      let inviteLink = "";
      let userId: string | null = null;

      const linkResult = await admin.auth.admin.generateLink({
        type: "invite",
        email: account.email.toLowerCase(),
        options: {
          data: { name: account.name },
          redirectTo,
        },
      });

      if (linkResult.data?.properties?.action_link) {
        inviteLink = linkResult.data.properties.action_link;
        userId = linkResult.data.user?.id ?? null;
      }

      if (!userId) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(account.email.toLowerCase(), {
          data: { name: account.name },
          redirectTo,
        });
        if (error || !data.user) {
          return NextResponse.json({ error: "The invitation could not be sent. If this person has registered already, activate their existing account instead." }, { status: 400 });
        }
        userId = data.user.id;
      }

      const { error: profileError } = await admin.rpc("pw_set_account", {
        actor: profile.id, target: userId, new_status: "active", new_role: account.role, new_timezone: account.timezone,
      });
      if (profileError) {
        return NextResponse.json({ error: "The invitation was sent, but role assignment failed. This account remains pending; review it before use." }, { status: 503 });
      }
      if (account.role === "parent") {
        await ensureParentPoliciesAccepted(userId);
      }

      if (inviteLink) {
        try {
          const roleTitle = await getRoleLabel(admin, account.role);
          await deliverEmail({
            id: `invite-${Date.now()}`,
            category: "admissions",
            email: account.email.toLowerCase(),
            subject: "Welcome to ProsperWork Music Academy — Complete Your Account Setup",
            template: "account_invitation",
            payload: {
              name: account.name,
              role: account.role,
              roleTitle,
              inviteLink,
            },
          }, publicAppUrl("/").origin);
        } catch (mailErr) {
          console.error("Direct invitation email dispatch failed:", mailErr);
        }
      }

      return NextResponse.json({ ok: true, message: `Invitation sent to ${account.name} (${account.email}).` });
    }

    if (body?.action === "resend_invite") {
      const targetId = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
      const { data: target, error: targetError } = await admin.from("pw_profiles").select("id,name,email,role").eq("id", targetId).single();
      if (targetError || !target || !target.email) return NextResponse.json({ error: "Account not found or missing email." }, { status: 404 });
      if (target.role === "super_admin" || target.role === "owner") return NextResponse.json({ error: "Owner invitations cannot be resent through this workflow." }, { status: 403 });

      const redirectTo = publicAppUrl("/auth/confirm?next=/reset-password&reason=invite").href;
      const linkResult = await admin.auth.admin.generateLink({
        type: "invite",
        email: target.email.toLowerCase(),
        options: {
          data: { name: target.name },
          redirectTo,
        },
      });

      if (!linkResult.data?.properties?.action_link) {
        return NextResponse.json({ error: "Could not generate an invitation link for this account." }, { status: 500 });
      }

      const roleTitle = await getRoleLabel(admin, target.role);
      await deliverEmail({
        id: `invite-${Date.now()}`,
        category: "admissions",
        email: target.email.toLowerCase(),
        subject: "Welcome to ProsperWork Music Academy — Complete Your Account Setup",
        template: "account_invitation",
        payload: {
          name: target.name,
          role: target.role,
          roleTitle,
          inviteLink: linkResult.data.properties.action_link,
        },
      }, publicAppUrl("/").origin);

      return NextResponse.json({ ok: true, message: `Invitation email resent to ${target.name} (${target.email}).` });
    }

    const parsed = z.object({
      action: z.literal("status"),
      id: z.string().uuid(),
      status: z.enum(["active", "on_leave", "paused", "restricted", "applicant", "pending"]),
    }).strict().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid account action." }, { status: 400 });
    if (parsed.data.id === profile.id && parsed.data.status !== "active") {
      return NextResponse.json({ error: "You cannot deactivate your own owner account." }, { status: 400 });
    }
    const { data: target, error: targetError } = await admin.from("pw_profiles").select("id,name,email,role,status").eq("id", parsed.data.id).single();
    if (targetError || !target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (target.role === "super_admin" || target.role === "owner") return NextResponse.json({ error: "Owner status requires a separate safeguarded workflow." }, { status: 403 });
    const previousStatus = target.status;
    const { error } = await admin.rpc("pw_set_account", { actor: profile.id, target: parsed.data.id, new_status: parsed.data.status });
    if (error) throw error;

    if (parsed.data.status === "active" && target.role === "parent") {
      await ensureParentPoliciesAccepted(target.id);
    }

    if (parsed.data.status === "active" && previousStatus !== "active" && target.email) {
      const roleTitle = await getRoleLabel(admin, target.role);
      try {
        await deliverEmail({
          id: crypto.randomUUID(),
          lease_id: crypto.randomUUID(),
          email: target.email,
          category: "automated",
          subject: "Your ProsperWork Music Academy Account is Active",
          template: "account_activated",
          payload: {
            name: target.name || "",
            roleTitle,
            role: target.role,
          },
        }, publicAppUrl("/").origin);
      } catch (emailErr) {
        console.error("Failed to send account activation email:", emailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/accounts error:", err);
    return NextResponse.json({ error: "Account changes could not be completed. Reload before retrying." }, { status: 503 });
  }
}
