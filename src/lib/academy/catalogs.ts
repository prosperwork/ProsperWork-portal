import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CATALOG_KEYS = [
  "instruments",
  "student_ranks",
  "lesson_durations",
  "complaint_categories",
  "expense_categories",
  "lead_sources",
] as const;

export type CatalogKey = (typeof CATALOG_KEYS)[number];

export interface CatalogMeta {
  key: CatalogKey;
  label: string;
  description: string;
  codeHint: string;
}

export const CATALOG_META: CatalogMeta[] = [
  {
    key: "instruments",
    label: "Instruments & Subjects",
    description: "Selectable instruments for students, leads, lessons, and curriculum.",
    codeHint: "e.g. Piano, Acoustic Guitar, Harp",
  },
  {
    key: "student_ranks",
    label: "Student Ranks / Levels",
    description: "Skill tiers assigned to enrolled learners.",
    codeHint: "e.g. Novice, Beginner, Intermediate, Master",
  },
  {
    key: "lesson_durations",
    label: "Lesson Durations",
    description: "Duration choices shown on enrollment and scheduling forms.",
    codeHint: "e.g. 30 minutes, 45 minutes, 1 hour (Standard)",
  },
  {
    key: "complaint_categories",
    label: "Complaint Categories",
    description: "Ticket categories parents choose when submitting feedback.",
    codeHint: "Lowercase slug, e.g. lesson_quality, billing",
  },
  {
    key: "expense_categories",
    label: "Expense Categories",
    description: "Categories used when logging academy operating expenses.",
    codeHint: "e.g. Equipment, Software & Hosting, Marketing",
  },
  {
    key: "lead_sources",
    label: "Lead Sources",
    description: "Marketing and enquiry channels tracked in Admissions.",
    codeHint: "e.g. Website, WhatsApp, Instagram, Referral",
  },
];

export interface CatalogItemRow {
  id: string;
  catalog: CatalogKey;
  code: string;
  label: string;
  sort_order: number;
  enabled: boolean;
  meta?: Record<string, unknown>;
  updated_at?: string;
}

export interface AcademyEmails {
  admissions: string;
  complaints: string;
  support: string;
  fees: string;
  info: string;
  [key: string]: string | undefined;
}

export interface PublicAcademyConfig {
  inactivityTimeoutMinutes: number;
  defaultTimezone: string;
  emails: AcademyEmails;
}

export const DEFAULT_ACADEMY_EMAILS: AcademyEmails = {
  admissions: "admissions@prosperworkmusic.com",
  complaints: "complaints@prosperworkmusic.com",
  support: "support@prosperworkmusic.com",
  fees: "fees@prosperworkmusic.com",
  info: "info@prosperworkmusic.com",
};

export const DEFAULT_PUBLIC_ACADEMY_CONFIG: PublicAcademyConfig = {
  inactivityTimeoutMinutes: 60,
  defaultTimezone: "Africa/Lagos",
  emails: DEFAULT_ACADEMY_EMAILS,
};

export const catalogActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    catalog: z.enum(CATALOG_KEYS),
    code: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(10000).default(100),
    enabled: z.boolean().default(true),
  }).strict().superRefine((data, ctx) => {
    if (data.catalog === "complaint_categories" && !/^[a-z0-9_-]{2,64}$/.test(data.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "Complaint category code must use 2-64 lowercase letters, numbers, underscores, or hyphens.",
      });
    }
  }),
  z.object({
    action: z.literal("delete"),
    catalog: z.enum(CATALOG_KEYS),
    code: z.string().trim().min(1).max(80),
  }).strict(),
]);

export function normalizePublicAcademyConfig(raw: unknown): PublicAcademyConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawEmails = obj.emails && typeof obj.emails === "object" ? (obj.emails as Record<string, unknown>) : {};
  const pickEmail = (key: "admissions" | "complaints" | "support" | "fees" | "info"): string => {
    const val = rawEmails[key];
    return typeof val === "string" && val.includes("@") ? val.trim() : (DEFAULT_ACADEMY_EMAILS[key] ?? "");
  };
  const rawTimeout = Number(obj.inactivityTimeoutMinutes);
  const inactivityTimeoutMinutes =
    Number.isFinite(rawTimeout) && rawTimeout >= 15 && rawTimeout <= 480
      ? Math.trunc(rawTimeout)
      : DEFAULT_PUBLIC_ACADEMY_CONFIG.inactivityTimeoutMinutes;
  const defaultTimezone =
    typeof obj.defaultTimezone === "string" && obj.defaultTimezone.trim().length > 0
      ? obj.defaultTimezone.trim()
      : DEFAULT_PUBLIC_ACADEMY_CONFIG.defaultTimezone;

  return {
    inactivityTimeoutMinutes,
    defaultTimezone,
    emails: {
      admissions: pickEmail("admissions"),
      complaints: pickEmail("complaints"),
      support: pickEmail("support"),
      fees: pickEmail("fees"),
      info: pickEmail("info"),
    },
  };
}

export async function fetchCatalogItems(
  client: SupabaseClient,
  catalog?: CatalogKey,
): Promise<CatalogItemRow[]> {
  let query = client
    .from("pw_catalog_items")
    .select("id,catalog,code,label,sort_order,enabled,meta,updated_at")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (catalog) query = query.eq("catalog", catalog);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as CatalogItemRow[];
}

export async function fetchPublicAcademyConfig(client: SupabaseClient): Promise<PublicAcademyConfig> {
  const { data, error } = await client.rpc("pw_public_academy_config");
  if (!error && data && typeof data === "object" && Object.keys(data as Record<string, unknown>).length > 0) {
    return normalizePublicAcademyConfig(data);
  }
  // Fallback for service-role callers (where auth.uid() is null so pw_active() is false)
  const { data: settingsRow } = await client
    .from("pw_settings")
    .select("settings")
    .eq("singleton", true)
    .maybeSingle();
  if (settingsRow?.settings) {
    return normalizePublicAcademyConfig(settingsRow.settings);
  }
  return DEFAULT_PUBLIC_ACADEMY_CONFIG;
}
