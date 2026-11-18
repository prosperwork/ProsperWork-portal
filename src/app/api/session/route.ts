import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { PERMISSION_CATALOG, fetchRoleRecord, humanizeRoleCode } from "@/lib/academy/roles";
import { fetchPublicAcademyConfig } from "@/lib/academy/catalogs";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user, profile, client } = await identity();
    if (!user) return NextResponse.json({ profile: null }, { status: 401 });

    // Detect if the user's email has changed (exempt "View as user" impersonated previews)
    if (!profile?.impersonated && user.email && profile?.email && user.email.toLowerCase() !== profile.email.toLowerCase()) {
      await client?.auth.signOut().catch(() => undefined);
      return NextResponse.json({
        profile: null,
        revoked: true,
        reason: "email_changed",
        error: "Your email was updated. Please sign in again.",
      }, { status: 401 });
    }

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 401 });
    }

    let enrichedProfile = profile;
    let academyConfig = undefined;

    if (profile.status === "active") {
      const [roleRecord, config] = await Promise.all([
        fetchRoleRecord(client, profile.role),
        fetchPublicAcademyConfig(client),
      ]);
      const permissions =
        profile.role === "super_admin"
          ? Array.from(new Set([...(roleRecord?.permissions ?? []), ...PERMISSION_CATALOG.map((p) => p.key)]))
          : roleRecord?.enabled
            ? roleRecord.permissions
            : [];
      enrichedProfile = {
        ...profile,
        roleLabel: roleRecord?.label || humanizeRoleCode(profile.role),
        permissions,
      };
      academyConfig = config;
    }

    return NextResponse.json({ profile: enrichedProfile, academyConfig, setupRequired: false }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Account setup is unavailable. Please contact the academy." }, { status: 503 });
  }
}
