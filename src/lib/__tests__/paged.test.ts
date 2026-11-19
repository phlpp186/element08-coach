import { describe, expect, it } from 'vitest';
import { fetchAll } from '../supabase/paged';

/** A table that, like Supabase, never returns more than `cap` rows at once. */
function table(n: number, cap: number) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe('fetchAll', () => {
  it('returns every row when the table is larger than one page', async () => {
    const { page, calls } = table(2350, 1000);
    const rows = await fetchAll(page, 1000);
    expect(rows).toHaveLength(2350);
    expect(rows[2349]).toBe(2349);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it('asks once more after a page that is exactly full', async () => {
    const { page, calls } = table(1000, 1000);
    expect(await fetchAll(page, 1000)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });
  it('stops after one short page', async () => {
    const { page, calls } = table(12, 1000);
    expect(await fetchAll(page, 1000)).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });
  it('throws the error of a failed page', async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});
