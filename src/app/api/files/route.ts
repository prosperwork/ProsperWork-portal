import { NextResponse } from "next/server";
import { identity } from "@/lib/supabase/identity";
import { sameOrigin } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const types = ["application/pdf", "image/png", "image/jpeg", "video/mp4", "video/webm","audio/mpeg","audio/wav","audio/x-wav","audio/ogg","audio/webm"];
function matches(bytes: Uint8Array, type: string) {
  const hex = (start: number, count: number) => Buffer.from(bytes.slice(start, start + count)).toString("hex");
  return type === "application/pdf" ? hex(0, 5) === "255044462d"
    : type === "image/png" ? hex(0, 8) === "89504e470d0a1a0a"
    : type === "image/jpeg" ? hex(0, 3) === "ffd8ff"
    : ["video/webm","audio/webm"].includes(type) ? hex(0, 4) === "1a45dfa3"
    : ["audio/wav","audio/x-wav"].includes(type) ? hex(0,4)==="52494646"&&hex(8,4)==="57415645"
    : type==="audio/ogg" ? hex(0,4)==="4f676753"
    : type==="audio/mpeg" ? hex(0,3)==="494433"||(bytes.length>=2&&bytes[0]===255&&(bytes[1]&224)===224)
    : type === "video/mp4" && hex(4, 4) === "66747970";
}
export async function GET(request: Request) {
  try {
    const { client, profile } = await identity({allowPolicy:true});
    if (!profile || !["active", "on_leave","applicant"].includes(profile.status)) return NextResponse.json({ error: "Sign in to open private files." }, { status: 403 });
    const urlObj = new URL(request.url);
    const id = urlObj.searchParams.get("id") || "";
    const download = urlObj.searchParams.get("download") === "1" || urlObj.searchParams.get("download") === "true";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid file." }, { status: 400 });
    const { data, error } = await client.from("pw_files").select("path, original_name").eq("id", id).eq("complete", true).single();
    if (error || !data) return NextResponse.json({ error: "File not available." }, { status: 404 });
    const signed = await client.storage.from("pw-private").createSignedUrl(data.path, 120, download ? { download: data.original_name || true } : undefined);
    if (signed.error || !signed.data) return NextResponse.json({ error: "The private file could not be opened." }, { status: 503 });
    const response = NextResponse.redirect(signed.data.signedUrl, 307);
    response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return NextResponse.json({ error: "The private file could not be opened." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 53_000_000) return NextResponse.json({ error: "Upload exceeds the 50 MiB limit." }, { status: 413 });
  try {
    const { client, profile } = await identity();
    if (!profile || profile.status !== "active") return NextResponse.json({ error: "An active academy account is required." }, { status: 403 });
    const form = await request.formData();
    const category = String(form.get("category") || ""), target = String(form.get("targetId") || ""), note = String(form.get("note") || "").trim();
    const file = form.get("file");
    if (!["receipt", "homework", "curriculum","policy","avatar","practice","hiring_evidence","hiring_guidelines","hiring_agreement", "lesson_recording"].includes(category) || !/^[a-zA-Z0-9_-]{1,100}$/.test(target) || note.length > 4000)
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) {
      if (category !== "homework" || !note) return NextResponse.json({ error: "Choose a file, or write a practice note for homework." }, { status: 400 });
      const { error } = await client.rpc("pw_submit_homework", { p_id: target, p_note: note });
      return NextResponse.json(error ? { error: "This homework cannot be submitted under your account or current status." } : { ok: true }, { status: error ? 403 : 200 });
    }
    const mime=file.type.split(";")[0].trim().toLowerCase();
    const max = category==="avatar"?5*1024*1024:category === "receipt" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max || !types.includes(mime) || (category === "receipt" && !["application/pdf","image/png","image/jpeg"].includes(mime)) ||(["policy","hiring_guidelines","hiring_agreement"].includes(category)&&mime!=="application/pdf")||(category==="avatar"&&!["image/png","image/jpeg"].includes(mime)))
      return NextResponse.json({ error: "Use PDF/images for receipts up to 10 MiB; supported audio/video/PDF/images up to 50 MiB for learning." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matches(bytes, mime)) return NextResponse.json({ error: "The file contents do not match its declared format." }, { status: 400 });
    const reservation = await client.rpc("pw_reserve_file", { p_category: category, p_target: target, p_name: file.name.slice(0, 200), p_mime: mime, p_bytes: file.size });
    if (reservation.error || !reservation.data) return NextResponse.json({ error: "You cannot attach a file to this record." }, { status: 403 });
    const { id, path } = reservation.data as { id: string; path: string };
    const upload = await client.storage.from("pw-private").upload(path, bytes, { contentType: mime, upsert: false });
    const finished = upload.error ? null : category==="practice"
      ? await client.rpc("pw_finish_practice_file",{p_id:id})
      : category==="lesson_recording"
      ? await client.rpc("pw_finish_recording_file",{p_id:id})
      : category.startsWith("hiring_")
      ? await client.rpc("pw_finish_hiring_file",{p_id:id})
      : ["policy","avatar"].includes(category)
      ? await client.rpc("pw_finish_profile_document",{p_id:id})
      : category==="curriculum"
      ? await client.rpc("pw_finish_curriculum_file",{p_id:id})
      : await client.rpc("pw_finish_file", { p_id: id, p_note: note });
    if (upload.error || finished?.error) {
      await client.storage.from("pw-private").remove([path]);
      await client.rpc("pw_abort_file", { p_id: id });
      return NextResponse.json({ error: "The upload was not submitted. Retry after refreshing the record." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "The submission could not be saved." }, { status: 400 }); }
}
