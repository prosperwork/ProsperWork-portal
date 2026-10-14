import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  try {
    const { user, profile, client } = await identity();
    if (!user || !profile || !["active", "on_leave", "applicant"].includes(profile.status)) {
      return reply({ error: "Sign in to view profile photos." }, 403);
    }

    const rawIds = new URL(request.url).searchParams.get("ids") || "";
    const ids = [...new Set(rawIds.split(",").filter(Boolean))];
    if (ids.length > 50 || ids.some((id) => !uuid.test(id))) {
      return reply({ error: "Invalid profile list." }, 400);
    }
    if (!ids.length) return reply({ avatars: [] });

    // Profile rows and avatar files are both read with the caller's RLS-bound
    // client. Only files attached to visible profiles can receive signed URLs.
    const { data: profiles, error: profileError } = await client
      .from("pw_profiles")
      .select("id,avatar_file_id")
      .in("id", ids);
    if (profileError) throw profileError;

    const fileOwners = new Map(
      (profiles || [])
        .filter((row) => row.avatar_file_id)
        .map((row) => [row.avatar_file_id as string, row.id as string]),
    );
    if (!fileOwners.size) return reply({ avatars: [] });

    const { data: files, error: fileError } = await client
      .from("pw_files")
      .select("id,path,target_id")
      .in("id", [...fileOwners.keys()])
      .eq("category", "avatar")
      .eq("complete", true);
    if (fileError) throw fileError;

    const permittedFiles = (files || []).filter((file) => fileOwners.get(file.id) === file.target_id);
    if (!permittedFiles.length) return reply({ avatars: [] });

    const { data: signed, error: signError } = await client.storage
      .from("pw-private")
      .createSignedUrls(permittedFiles.map((file) => file.path), 300);
    if (signError || !signed) throw signError || new Error("Avatar URL signing failed");

    const signedByPath = new Map(signed.map((item) => [item.path, item.signedUrl]));
    return reply({
      avatars: permittedFiles.flatMap((file) => {
        const id = fileOwners.get(file.id);
        const url = signedByPath.get(file.path);
        return id && url ? [{ id, url }] : [];
      }),
    });
  } catch {
    return reply({ error: "Profile photos could not be loaded." }, 503);
  }
}
