import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import {
  CATALOG_META,
  catalogActionSchema,
  fetchCatalogItems,
  fetchPublicAcademyConfig,
} from "@/lib/academy/catalogs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy session required." }, { status: 401 });
    }
    const [items, config] = await Promise.all([
      fetchCatalogItems(client),
      fetchPublicAcademyConfig(client),
    ]);
    return NextResponse.json(
      {
        items,
        config,
        catalogs: CATALOG_META,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Academy catalogs could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const { client, profile } = await identity();
    if (profile?.role !== "super_admin" || profile.status !== "active") {
      return NextResponse.json({ error: "Super Admin access is required to manage catalogs." }, { status: 403 });
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const parsed = catalogActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Check the catalog item details." },
        { status: 400 },
      );
    }

    const { action, ...payload } = parsed.data;
    const { data, error } = await client.rpc("pw_catalog_action", {
      p_action: action,
      p_data: payload,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : 400;
      return NextResponse.json({ error: error.message || "Catalog update failed." }, { status });
    }

    const items = await fetchCatalogItems(client);
    return NextResponse.json({ ok: true, result: data, items });
  } catch {
    return NextResponse.json({ error: "Catalog update failed." }, { status: 400 });
  }
}
