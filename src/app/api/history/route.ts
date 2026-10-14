import { NextResponse } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/supabase/identity";
import { historyCollections } from "@/lib/academy/history-collections";
export const dynamic = "force-dynamic";
const params = z.object({
  collection: z.string().refine(value => Object.hasOwn(historyCollections, value)),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(10).max(100).default(50),
  search: z.string().trim().max(120).default(""),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to);
export async function GET(request: Request) {
  try {
    const { client, profile } = await identity();
    if (!profile || !["active", "on_leave"].includes(profile.status)) return NextResponse.json({ error: "Sign in to browse your records." }, { status: 403 });
    const parsed = params.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid record type, date range and page." }, { status: 400 });
    const p = parsed.data, definition = historyCollections[p.collection];
    if (p.collection.startsWith("salary_") && ["parent", "student", "general_manager"].includes(profile.role)) return NextResponse.json({ error: "Staff salary access is required." }, { status: 403 });
    let query = client.from(`pw_${p.collection}`).select("*", { count: "exact" }).order(definition.date, { ascending: false }).order("id", { ascending: false });
    if (p.from) query = query.gte(definition.date, `${p.from}T00:00:00Z`);
    if (p.to) {
      const end = new Date(`${p.to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
      query = query.lt(definition.date, end.toISOString());
    }
    if (p.search) {
      const text = p.search.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "\\%").replaceAll("_", "\\_");
      query = query.or(definition.search.map(column => `${column}.ilike."%${text}%"`).join(","));
    }
    const result = await query.range((p.page - 1) * p.size, p.page * p.size - 1);
    if (result.error) return NextResponse.json({ error: "These records could not be loaded." }, { status: 503 });
    return NextResponse.json({ records: result.data, total: result.count ?? 0, page: p.page, size: p.size, profile: { role: profile.role } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Record history is unavailable." }, { status: 503 }); }
}
