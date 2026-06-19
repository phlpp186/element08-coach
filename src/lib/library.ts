/**
 * Coach's personal exercise library. Persisted in the browser via localStorage
 * (no account, so it's per-browser) — Export/Import a file to back it up or move
 * it between machines. Exercises can also be imported from a .csv / .xlsx, where
 * the first column becomes the exercise descriptions.
 */
import { useCallback, useState } from 'react';
import { uid } from './e08plan';

export interface LibraryExercise {
  id: string;
  description: string;
}

const KEY = 'element08.coach.library';

export function loadLibrary(): LibraryExercise[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is LibraryExercise =>
          !!x && typeof (x as LibraryExercise).description === 'string',
      )
      .map((x) => ({ id: x.id || uid('lib'), description: x.description }));
  } catch {
    return [];
  }
}

function saveLibrary(items: LibraryExercise[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / blocked — keep working in-memory */
  }
}

/** Extract the first CSV field of a line, honouring a leading quoted value
 *  (so descriptions that contain commas survive). */
function firstCsvField(line: string): string {
  const t = line.trim();
  if (t.startsWith('"')) {
    const m = t.match(/^"((?:[^"]|"")*)"/);
    if (m) return m[1].replace(/""/g, '"');
  }
  return t.split(',')[0];
}

/** Parse a .csv or .xlsx file into a list of exercise descriptions (first column).
 *  SheetJS is loaded from a CDN on demand so it never bloats the normal bundle. */
export async function parseExerciseFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .map((l) => firstCsvField(l).trim())
      .filter(Boolean);
  }
  const xlsxUrl = 'https://esm.sh/xlsx@0.18.5';
  const XLSX = (await import(/* @vite-ignore */ xlsxUrl)) as {
    read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: (sheet: unknown, opts: { header: 1 }) => unknown[][] };
  };
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return rows.map((r) => (r && r[0] != null ? String(r[0]).trim() : '')).filter(Boolean);
}

/** Download the library as a simple one-per-line CSV (re-importable). */
export function exportLibraryCsv(items: LibraryExercise[]): void {
  const body = items.map((i) => `"${i.description.replace(/"/g, '""')}"`).join('\n');
  const blob = new Blob([body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'element08-exercises.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useLibrary() {
  const [items, setItems] = useState<LibraryExercise[]>(() => loadLibrary());
  const persist = useCallback((next: LibraryExercise[]) => {
    setItems(next);
    saveLibrary(next);
  }, []);

  return {
    items,
    add: (description: string) => {
      const d = description.trim();
      if (d) persist([...loadLibrary(), { id: uid('lib'), description: d }]);
    },
    addMany: (descriptions: string[]) => {
      const existing = loadLibrary();
      const seen = new Set(existing.map((i) => i.description.toLowerCase()));
      const fresh = descriptions
        .map((d) => d.trim())
        .filter((d) => d && !seen.has(d.toLowerCase()))
        .map((d) => ({ id: uid('lib'), description: d }));
      persist([...existing, ...fresh]);
      return fresh.length;
    },
    remove: (id: string) => persist(loadLibrary().filter((i) => i.id !== id)),
  };
}
