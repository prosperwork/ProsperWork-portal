import type { SupabaseClient, User } from "@supabase/supabase-js";

export const STUDENT_EMAIL_DOMAIN = "student.prosperworkmusic.com";

/**
 * Generates an ordered list of candidate student emails based on student name:
 * 1. Default format: {studentname}@student.prosperworkmusic.com (e.g. devmartins@student.prosperworkmusic.com)
 * 2. Collision format: Full stop between first name and surname: {first}.{surname}@student.prosperworkmusic.com (e.g. dev.martins@student.prosperworkmusic.com)
 * 3. Additional fallback counters if both are already taken: devmartins2@..., dev.martins2@...
 */
export function getStudentEmailCandidates(fullName: string): string[] {
  const parts = fullName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    parts.push("student");
  }

  const candidates: string[] = [];
  const baseName = parts.join("");
  candidates.push(baseName);

  if (parts.length > 1) {
    const dotted = parts.join(".");
    if (!candidates.includes(dotted)) {
      candidates.push(dotted);
    }
    if (parts.length > 2) {
      const firstLastDotted = `${parts[0]}.${parts[parts.length - 1]}`;
      if (!candidates.includes(firstLastDotted)) {
        candidates.push(firstLastDotted);
      }
    }
  }

  for (let i = 2; i <= 50; i++) {
    candidates.push(`${baseName}${i}`);
    if (parts.length > 1) {
      candidates.push(`${parts.join(".")}${i}`);
    }
  }

  return candidates.map((slug) => `${slug}@${STUDENT_EMAIL_DOMAIN}`);
}

/**
 * Creates a student auth user using the next available student email candidate.
 * Guarantees collision-free account provisioning.
 */
export async function createStudentAuthUser(
  admin: SupabaseClient,
  params: { name: string; password: string }
): Promise<{ user: User; email: string }> {
  const candidates = getStudentEmailCandidates(params.name);

  // Fast-check candidates against existing profiles to skip already assigned emails
  const { data: existingProfiles } = await admin
    .from("pw_profiles")
    .select("email")
    .in("email", candidates.slice(0, 15));

  const takenEmails = new Set(
    (existingProfiles || [])
      .map((p) => (p.email || "").toLowerCase().trim())
      .filter(Boolean)
  );

  let lastError: unknown = null;

  for (const candidate of candidates) {
    if (takenEmails.has(candidate.toLowerCase())) {
      continue;
    }

    const created = await admin.auth.admin.createUser({
      email: candidate,
      password: params.password,
      email_confirm: true,
      user_metadata: { name: params.name.trim() },
    });

    if (created.data?.user) {
      return { user: created.data.user, email: candidate };
    }

    const errMsg = created.error?.message?.toLowerCase() || "";
    // If the error indicates email already exists, try the next candidate
    if (
      errMsg.includes("already registered") ||
      errMsg.includes("already been registered") ||
      errMsg.includes("unique") ||
      errMsg.includes("exists")
    ) {
      takenEmails.add(candidate.toLowerCase());
      continue;
    }

    lastError = created.error;
    break;
  }

  throw lastError || new Error("Failed to generate an available student email address.");
}

