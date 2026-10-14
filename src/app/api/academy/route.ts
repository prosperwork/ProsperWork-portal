import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
import { academySnapshot, resolveChange } from "@/lib/academy/server-data";
import { batchSchema } from "@/lib/academy/schemas";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { client, profile } = await identity();
    if (!profile) return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    if (profile.status === "policy_required") {
      return NextResponse.json({ error: "Policy acknowledgement required.", policyRequired: true }, { status: 403 });
    }
    if (!["active", "on_leave"].includes(profile.status)) return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    return NextResponse.json(await academySnapshot(client, profile), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Academy records could not be loaded." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    const parsed = batchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid record change." }, { status: 400 });
    const changes = [];
    for (const change of parsed.data.changes) {
      if (change.operation === "update" && !change.revision) return NextResponse.json({ error: "Reload this record before changing it." }, { status: 409 });
      changes.push({
        table: `pw_${change.module}`, operation: change.operation, revision: change.revision,
        record: await resolveChange(client, change.module, change.record, change.operation, profile),
      });
    }
    const { error } = await client.rpc("pw_apply_changes", { changes });
    if (error) {
      const conflict = error.code === "40001";
      const calendar = error.code === "PW003" || error.code === "PW005";
      const message = conflict ? "Another user changed this record. Reload before saving."
        : error.code === "PW003" ? "This class conflicts with the teacher's calendar or exceeds the admin's concurrent class limit."
        : error.code === "PW005" ? "A future class cannot be marked done."
        : "The database rejected this change. Check your permissions and the record's current status.";
      return NextResponse.json({ error: message }, { status: conflict || calendar ? 409 : 403 });
    }
    return NextResponse.json(await academySnapshot(client, profile), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The change could not be saved." }, { status: 400 });
  }
}
