import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";

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

    return NextResponse.json({ profile, setupRequired: !process.env.PROSPERWORK_OWNER_EMAIL }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Account setup is unavailable. Please contact the academy." }, { status: 503 });
  }
}
