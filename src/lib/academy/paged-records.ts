import type { SupabaseClient } from "@supabase/supabase-js";

// Database page size, not a record cap. All reads retain the caller's RLS.
export async function loadAllRecords(
  client: SupabaseClient,
  table: string,
  columns = "*",
  options: {
    cursor?: string;
    sort?: string;
    ascending?: boolean;
    filter?: (query: any) => any;
  } = {},
) {
  const key = options.cursor ?? "id";
  const rows: Record<string, any>[] = [];
  let after: string | null = null;
  for (;;) {
    let query: any = client.from(table).select(columns).order(key, { ascending: true }).limit(500);
    if (options.filter) query = options.filter(query);
    if (after !== null) query = query.gt(key, after);
    const result = await query;
    if (result.error) return { data: [], error: result.error };
    if (!result.data?.length) break;
    const lastRow = result.data[result.data.length - 1] as Record<string, any>;
    const last = String(lastRow[key]);
    if (!last || last === "undefined" || last === after) throw new Error("Record paging could not advance.");
    rows.push(...result.data);
    after = last;
  }
  const sort = options.sort ?? "created_at";
  rows.sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * (options.ascending ? 1 : -1));
  return { data: rows, error: null };
}
