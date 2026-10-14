import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
export async function GET() {
  try {
    const { client, profile } = await identity();
    if (profile?.role !== "super_admin" || profile.status !== "active") return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
    const [history, smtpTest] = await Promise.all([
      client.from("pw_emails").select("id,category,status,subject,created_at,sent_at,attempts").order("created_at", { ascending: false }).limit(50),
      client.from("pw_emails").select("status,created_at,sent_at").eq("recipient_id", profile.id).eq("template", "owner_test").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (history.error || smtpTest.error) return NextResponse.json({ error: "Email delivery history is unavailable." }, { status: 503 });
    return NextResponse.json({ messages: history.data, smtpTest: smtpTest.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Email delivery history is unavailable." }, { status: 503 }); }
}
