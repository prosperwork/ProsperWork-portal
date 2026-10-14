import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user, profile } = await identity();
    if (!user) return NextResponse.json({ profile: null }, { status: 401 });
    return NextResponse.json({ profile, setupRequired: !process.env.PROSPERWORK_OWNER_EMAIL }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Account setup is unavailable. Please contact the academy." }, { status: 503 });
  }
}
