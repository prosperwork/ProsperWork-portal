import { NextResponse } from "next/server";
import{publicAppUrl}from"@/lib/supabase/app-url.mjs";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { provisioningClient, sameOrigin } from "@/lib/supabase/server";
import { accountSchema } from "@/lib/academy/schemas";
import { deliverEmail } from "@/lib/email/transport.mjs";
import { ensureParentPoliciesAccepted } from "@/lib/academy/policy-sync";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { profile, client } = await identity();
    const isManager = ["super_admin", "general_manager", "head_admin", "hr"].includes(profile?.role || "") && profile?.status === "active";
    if (!isManager) return NextResponse.json({ error: "Administrative staff or owner access required." }, { status: 403 });
    const { data, error } = await client.from("pw_profiles").select("id,name,email,role,status,timezone,username").order("name");
    if (error) throw error;
    return NextResponse.json({ accounts: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Accounts could not be loaded." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { profile } = await identity({ rawOwner: true });
    const isManager = ["super_admin", "general_manager", "head_admin", "hr"].includes(profile?.role || "") && profile?.status === "active";
    if (!isManager) return NextResponse.json({ error: "Administrative staff or owner access required." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const admin = provisioningClient();

    // Impersonation / View As User Action
    if (body?.action === "view_as") {
      if (profile.role !== "super_admin") return NextResponse.json({ error: "Owner access required for impersonation." }, { status: 403 });
      const targetId = String(body.targetId || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
      const { data: targetUser, error: targetErr } = await admin.from("pw_profiles")
        .select("id,name,role,email").eq("id", targetId).single();
      if (targetErr || !targetUser) return NextResponse.json({ error: "Account not found." }, { status: 404 });

      // Audit log the impersonation entry
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
      response.cookies.set("pw_view_as", targetUser.id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3600 * 4, // 4 hours max session
      });
      return response;
    }

    // Exit Impersonation / Return to Owner View
    if (body?.action === "exit_view_as") {
      // Audit log the impersonation exit
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

    if (body?.action === "delete") {
      if (profile.role !== "super_admin") return NextResponse.json({ error: "Owner access required for account deletion." }, { status: 403 });
      const targetId = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ error: "Invalid account identifier." }, { status: 400 });
      if (targetId === profile.id) return NextResponse.json({ error: "You cannot delete your own Super Admin account." }, { status: 400 });

      const { data: target, error: targetError } = await admin.from("pw_profiles").select("id,name,email,role,status").eq("id", targetId).single();
      if (targetError || !target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      if (target.role === "super_admin") return NextResponse.json({ error: "Owner accounts cannot be deleted through this workflow." }, { status: 403 });

      // Check immutable historical records
      const [payments, payroll, lessons] = await Promise.all([
        admin.from("pw_payments").select("id").or(`parent_id.eq.${targetId},verified_by.eq.${targetId}`).limit(1),
        admin.from("pw_payroll").select("id").or(`staff_id.eq.${targetId},prepared_by.eq.${targetId},approved_by.eq.${targetId}`).limit(1),
        admin.from("pw_lessons").select("id").or(`teacher_id.eq.${targetId},verified_by.eq.${targetId}`).not("verified_at", "is", null).limit(1),
      ]);

      const blockers: string[] = [];
      if (payments.data && payments.data.length > 0) blockers.push("financial payment records");
      if (payroll.data && payroll.data.length > 0) blockers.push("historical payroll statements");
      if (lessons.data && lessons.data.length > 0) blockers.push("verified lesson attendance records");

      if (blockers.length > 0) {
        return NextResponse.json({
          error: `Cannot permanently delete this account because it is linked to ${blockers.join(" and ")}. To preserve audit trails and financial evidence, set the account status to "Restricted" or "Paused" instead.`,
          blocked: true,
          blockers,
        }, { status: 409 });
      }

      // Safe deletion of transient / unverified dependencies
      await Promise.all([
        admin.from("pw_lessons").delete().eq("teacher_id", targetId).is("verified_at", null).is("teacher_done_at", null),
        admin.from("pw_students").delete().or(`parent_id.eq.${targetId},student_user_id.eq.${targetId}`),
        admin.from("pw_leads").update({ owner_id: null }).eq("owner_id", targetId),
        admin.from("pw_desk_actions").delete().eq("actor_id", targetId),
        admin.from("pw_desk_items").delete().or(`staff_id.eq.${targetId},assigned_to.eq.${targetId},created_by.eq.${targetId}`),
        admin.from("pw_operations_events").delete().eq("actor", targetId),
        admin.from("pw_leaves").delete().eq("staff_id", targetId),
        admin.from("pw_staff_compensation").delete().eq("staff_id", targetId),
        admin.from("pw_guardian_consents").delete().or(`guardian_id.eq.${targetId},recorded_by.eq.${targetId}`),
        admin.from("pw_profiles").update({ head_admin_id: null }).eq("head_admin_id", targetId),
        admin.from("pw_profiles").update({ qc_id: null }).eq("qc_id", targetId),
      ]);

      // Write permanent audit entry before removing profile
      const reason = String(body.reason || "Permanent purge requested by Super Admin").slice(0, 500);
      try {
        await admin.from("pw_audit").insert({
          actor_id: profile.id,
          actor_name: profile.name,
          actor_role: profile.role,
          entity_type: "pw_profiles",
          entity_id: targetId,
          action: "account_permanent_deleted",
          changed_fields: [
            `deleted_name:${target.name}`,
            `deleted_email:${target.email}`,
            `deleted_role:${target.role}`,
            `reason:${reason}`,
          ],
        });
      } catch {
        // Non-blocking
      }

      // Delete from pw_profiles
      const { error: deleteProfileErr } = await admin.from("pw_profiles").delete().eq("id", targetId);
      if (deleteProfileErr) {
        throw new Error(deleteProfileErr.message || "Failed to remove user profile.");
      }

      // Also delete from Supabase Auth so their credentials/login are permanently wiped
      try {
        await admin.auth.admin.deleteUser(targetId);
      } catch {
        // Auth user deletion may fail if user does not exist in Auth, but profile deletion succeeded
      }

      return NextResponse.json({ ok: true, message: `Account for ${target.name} (${target.email}) was permanently purged.` });
    }

    if (body?.action === "invite") {
      const parsed = accountSchema.safeParse(body.account);
      if (!parsed.success || parsed.data.role === "super_admin") return NextResponse.json({ error: "Check the invitation details. Additional owner access requires a separate approval." }, { status: 400 });
      const account = parsed.data;

      const redirectTo = publicAppUrl("/auth/confirm?next=/reset-password&reason=invite").href;
      let inviteLink = "";
      let userId: string | null = null;

      // 1. Generate direct action link
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

      // 2. Fallback to inviteUserByEmail if generateLink did not provide user
      if (!userId) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(account.email.toLowerCase(), {
          data: { name: account.name },
          redirectTo,
        });
        if (error || !data.user) return NextResponse.json({ error: "The invitation could not be sent. If this person has registered already, activate their existing account instead." }, { status: 400 });
        userId = data.user.id;
      }

      const { error: profileError } = await admin.rpc("pw_set_account", {
        actor: profile.id, target: userId, new_status: "active", new_role: account.role, new_timezone: account.timezone,
      });
      if (profileError) return NextResponse.json({ error: "The invitation was sent, but role assignment failed. This account remains pending; review it before use." }, { status: 503 });
      if (account.role === "parent") {
        await ensureParentPoliciesAccepted(userId);
      }

      // 3. Deliver official academy invitation email directly via SMTP
      if (inviteLink) {
        try {
          const roleTitle = account.role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
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

      const roleTitle = target.role.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
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
      action: z.literal("status"), id: z.string().uuid(),
      status: z.enum(["active", "on_leave", "paused", "restricted", "applicant", "pending"]),
    }).strict().safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid account action." }, { status: 400 });
    if (parsed.data.id === profile.id && parsed.data.status !== "active") return NextResponse.json({ error: "You cannot deactivate your own owner account." }, { status: 400 });
    const { data: target, error: targetError } = await admin.from("pw_profiles").select("id,name,email,role,status").eq("id", parsed.data.id).single();
    if (targetError || !target) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (target.role === "super_admin") return NextResponse.json({ error: "Owner status requires a separate safeguarded workflow." }, { status: 403 });
    const previousStatus = target.status;
    const { error } = await admin.rpc("pw_set_account", { actor: profile.id, target: parsed.data.id, new_status: parsed.data.status });
    if (error) throw error;

    // Auto-accept policies for parents upon activation so they aren't blocked by onboarding
    if (parsed.data.status === "active" && target.role === "parent") {
      await ensureParentPoliciesAccepted(target.id);
    }

    // When an account is activated (and was not active before), notify the user via SMTP
    if (parsed.data.status === "active" && previousStatus !== "active" && target.email) {
      const roleTitles: Record<string, string> = {
        parent: "Parent & Guardian",
        student: "Student",
        teacher: "Instructor",
        head_admin: "Head of Operations",
        billing_admin: "Finance & Accounts",
        quality_control: "Academic Quality Control",
        sales_marketing: "Admissions & Marketing",
      };
      const roleTitle = roleTitles[target.role] || "Academy Member";
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
        // Log email dispatch issue without rolling back database activation
        console.error("Failed to send account activation email:", emailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Account changes could not be completed. Reload before retrying." }, { status: 503 });
  }
}
