import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { impersonationBlocked, sameOrigin } from "@/lib/supabase/server";
import {
  PERMISSION_CATALOG,
  fetchRoleRecord,
  fetchRoles,
  roleActionSchema,
} from "@/lib/academy/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") {
      return NextResponse.json({ error: "Active academy session required." }, { status: 401 });
    }
    const [roles, myRole] = await Promise.all([
      fetchRoles(client),
      fetchRoleRecord(client, profile.role),
    ]);
    const myPermissions =
      profile.role === "super_admin" || profile.role === "owner"
        ? Array.from(new Set([...(myRole?.permissions ?? []), ...PERMISSION_CATALOG.map((p) => p.key)]))
        : myRole?.enabled
          ? myRole.permissions
          : [];
    return NextResponse.json(
      {
        roles,
        myPermissions,
        permissionCatalog: PERMISSION_CATALOG,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Roles could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const { client, profile } = await identity();
    if ((profile?.role !== "super_admin" && profile?.role !== "owner") || profile.status !== "active") {
      return NextResponse.json({ error: "Super Admin access is required to manage roles." }, { status: 403 });
    }
    const blocked = impersonationBlocked(profile);
    if (blocked) return blocked;

    const parsed = roleActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Check the role details and try again." },
        { status: 400 },
      );
    }

    const { action, ...payload } = parsed.data;
    const { data, error } = await client.rpc("pw_role_action", {
      p_action: action,
      p_data: payload,
    });
    if (error) {
      const msg = error.message || "Role update could not be saved.";
      const status = error.code === "42501" ? 403 : error.code === "23503" ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }

    const roles = await fetchRoles(client);
    return NextResponse.json({ ok: true, result: data, roles });
  } catch {
    return NextResponse.json({ error: "Role update could not be saved." }, { status: 400 });
  }
}
