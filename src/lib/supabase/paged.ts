/**
 * Reading a whole table slice from Supabase. One request returns at most
 * 1000 rows (the API's row cap) and says nothing when it cut the answer off,
 * so a query over every athlete's completions silently lost rows once a
 * coach had more than that: whole athletes then read as "nothing done".
 * fetchAll asks page by page until a page comes back short.
 */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** `page(from, to)` must return rows `from..to` (inclusive) of a query with a
 *  stable order. Throws the first error. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  size = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const res = await page(from, from + size - 1);
    if (res.error) throw new Error(res.error.message);
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
