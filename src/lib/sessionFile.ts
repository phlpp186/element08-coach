/**
 * Read a session an athlete exported from the app (Logbook › session › Share ›
 * Data (spreadsheet)) back into the app's Session shape, so the portal can show
 * it with the same view as a session attached to a plan.
 *
 * Two kinds of file reach a coach:
 *  - exports from app builds with the hidden "E08 data" sheet: the whole
 *    Session as JSON, split across cells. Read that and nothing is lost.
 *  - older exports: only the visible sheets. Rebuilt from those the way the
 *    app's own importer does (Deeptimerapp src/services/sessionXlsxImport.ts):
 *    headers are fixed English and name their unit, so an imperial export
 *    converts back to metres. What a spreadsheet has no column for is gone,
 *    most visibly the breathing phases between dry holds.
 *
 * The three names below mirror Deeptimerapp src/lib/share/sessionWorkbook.ts.
 * Nothing here leaves the browser.
 */

export const SESSION_DATA_SHEET = 'E08 data';
export const SESSION_DATA_SIGNATURE = 'ELEMENT | 08 session data';
export const XLSX_EXPORT_SIGNATURE = 'ELEMENT | 08 — session export';

type Cell = string | number | boolean | null | undefined;
type Row = Cell[];
type Aoa = Row[];
/** Sheet name → rows, as SheetJS `sheet_to_json(ws, { header: 1 })` gives them. */
export type SheetMap = Record<string, Aoa>;

export interface DryHoldRow {
  seconds: number;
  contractions: number;
  rating: number | null;
  note: string | null;
}

export interface SessionFile {
  /** The app's Session shape (loose: older exports fill what they carry). */
  session: Record<string, unknown>;
  /** True when read from the full-data sheet, false when rebuilt from the
   *  visible sheets of an older export. */
  complete: boolean;
  /** Older dry exports only: the holds, listed beside the SpO₂ chart because
   *  without the breathing phases they cannot be placed on its time axis. */
  holds?: DryHoldRow[];
}

/** Error the view turns into a sentence. */
export class SessionFileError extends Error {
  code: 'not-export' | 'no-mode' | 'no-dives' | 'bad-data';
  constructor(code: SessionFileError['code']) {
    super(code);
    this.code = code;
  }
}

const M_PER_FT = 0.3048;

const str = (c: Cell): string => (c == null ? '' : String(c).trim());

function num(c: Cell): number | null {
  if (c == null || c === '' || typeof c === 'boolean') return null;
  const n = typeof c === 'number' ? c : Number(String(c).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function rating(v: number | null): number | null {
  if (v == null) return null;
  const n = Math.round(v);
  return n >= 1 && n <= 10 ? n : null;
}

function summaryValue(rows: Aoa, label: string): Cell {
  return rows.find((r) => str(r[0]).toLowerCase() === label.toLowerCase())?.[1];
}

/** Column by header, ignoring the unit in brackets ("Max depth (ft)"). */
function col(header: Row, name: string): number {
  const want = name.toLowerCase();
  return header.findIndex((h) => str(h).split('(')[0].trim().toLowerCase() === want);
}

function isImperial(header: Row, name: string): boolean {
  const i = col(header, name);
  if (i < 0) return false;
  const unit = str(header[i]).match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? '';
  return unit === 'ft' || unit === 'ft/s' || unit === '°f';
}

function reader(header: Row) {
  const n = (row: Row, name: string): number | null => {
    const i = col(header, name);
    return i < 0 ? null : num(row[i]);
  };
  return {
    n,
    s: (row: Row, name: string): string => {
      const i = col(header, name);
      return i < 0 ? '' : str(row[i]);
    },
    /** Back to metres (or m/s). */
    len: (row: Row, name: string): number | null => {
      const v = n(row, name);
      return v == null ? null : isImperial(header, name) ? v * M_PER_FT : v;
    },
    /** Back to °C. */
    temp: (row: Row, name: string): number | null => {
      const v = n(row, name);
      return v == null ? null : isImperial(header, name) ? ((v - 32) * 5) / 9 : v;
    },
  };
}

function tempFromSummary(summary: Aoa): number | null {
  const row = summary.find((r) => str(r[0]).toLowerCase().startsWith('water temp'));
  const v = num(row?.[1]);
  if (!row || v == null) return null;
  return str(row[0]).includes('°F') ? ((v - 32) * 5) / 9 : v;
}

/** Rows grouped by their "Dive #" column. */
function byDive(rows: Aoa): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  const header = rows[0] ?? [];
  const di = col(header, 'Dive #');
  if (di < 0) return out;
  for (const row of rows.slice(1)) {
    const idx = num(row[di]);
    if (idx == null) continue;
    if (!out.has(idx)) out.set(idx, []);
    out.get(idx)!.push(row);
  }
  return out;
}

/** The hidden sheet: signature row, then the JSON in column A. */
function fromDataSheet(rows: Aoa): SessionFile {
  const json = rows
    .slice(1)
    .map((r) => (r[0] == null ? '' : String(r[0])))
    .join('');
  try {
    const session = JSON.parse(json);
    if (!session || typeof session !== 'object') throw new Error();
    return { session, complete: true };
  } catch {
    throw new SessionFileError('bad-data');
  }
}

/** Is this an ELEMENT | 08 session export at all? */
export function isSessionExport(sheets: SheetMap): boolean {
  return (
    str(sheets[SESSION_DATA_SHEET]?.[0]?.[0]) === SESSION_DATA_SIGNATURE ||
    str(sheets.Summary?.[0]?.[0]) === XLSX_EXPORT_SIGNATURE
  );
}

export function sessionFromSheets(sheets: SheetMap): SessionFile {
  const data = sheets[SESSION_DATA_SHEET];
  if (data && str(data[0]?.[0]) === SESSION_DATA_SIGNATURE) {
    // A damaged data sheet should not hide a readable export behind it.
    try {
      return fromDataSheet(data);
    } catch (e) {
      if (str(sheets.Summary?.[0]?.[0]) !== XLSX_EXPORT_SIGNATURE) throw e;
    }
  }

  const summary = sheets.Summary ?? [];
  if (str(summary[0]?.[0]) !== XLSX_EXPORT_SIGNATURE) throw new SessionFileError('not-export');
  const m = str(summaryValue(summary, 'Mode')).toLowerCase();
  const mode = m.startsWith('depth') ? 'depth' : m.startsWith('pool') ? 'pool' : m.startsWith('dry') ? 'dry' : null;
  if (!mode) throw new SessionFileError('no-mode');

  const date = str(summaryValue(summary, 'Date'));
  const remarks = str(summaryValue(summary, 'Notes')) || null;
  if (mode === 'dry') return dryFromSheets(sheets, date, remarks);

  const diveRows = sheets.Dives ?? [];
  if (diveRows.length < 2) throw new SessionFileError('no-dives');
  const read = reader(diveRows[0]);
  const profRows = sheets.Profile ?? [];
  const pread = reader(profRows[0] ?? []);
  const profiles = byDive(profRows);
  const location = str(summaryValue(summary, 'Location')) || undefined;

  if (mode === 'pool') {
    const laps = byDive(sheets.Laps ?? []);
    const lread = reader(sheets.Laps?.[0] ?? []);
    const dives = diveRows.slice(1).map((row, i) => ({
      discipline: read.s(row, 'Discipline') || 'DYN',
      distance: read.n(row, 'Distance'),
      diveTime: read.n(row, 'Dive time') ?? 0,
      turns: read.n(row, 'Turns'),
      si: read.n(row, 'Surface int.') ?? 0,
      lungVol: read.s(row, 'Lung vol') || null,
      hrLowest: read.n(row, 'HR low'),
      hrHighest: read.n(row, 'HR high'),
      rating: rating(read.n(row, 'Rating')),
      remarks: read.s(row, 'Notes') || null,
      lapTimes: (laps.get(i + 1) ?? []).map((r) => lread.n(r, 'Lap time')).filter((v): v is number => v != null),
      profile: (profiles.get(i + 1) ?? [])
        .map((r) => ({ t: pread.n(r, 'Time'), hr: pread.n(r, 'HR'), depth: pread.len(r, 'Depth'), speed: pread.len(r, 'Speed') }))
        .filter((p) => p.t != null),
    }));
    const poolLengthM = num(String(summaryValue(summary, 'Pool') ?? '').replace(/[^0-9.,]/g, ''));
    return {
      complete: false,
      session: {
        mode: 'pool',
        date,
        location,
        remarks,
        waterTemp: tempFromSummary(summary),
        totalDistance: num(summaryValue(summary, 'Total distance (m)')) ?? dives.reduce((a, d) => a + (d.distance ?? 0), 0),
        ...(poolLengthM ? { poolLengthM } : {}),
        dives,
      },
    };
  }

  const dives = diveRows.slice(1).map((row, i) => ({
    discipline: read.s(row, 'Discipline') || 'CWT',
    depth: read.len(row, 'Max depth') ?? 0,
    diveTime: read.n(row, 'Dive time') ?? 0,
    descentTime: read.n(row, 'Descent') ?? 0,
    ascentTime: read.n(row, 'Ascent') ?? 0,
    descentSpeed: read.len(row, 'Descent speed') ?? 0,
    ascentSpeed: read.len(row, 'Ascent speed') ?? 0,
    hangTime: read.n(row, 'Hang') ?? 0,
    si: read.n(row, 'Surface int.') ?? 0,
    lungVol: read.s(row, 'Lung vol') || null,
    hr: read.n(row, 'Avg HR'),
    diveType: read.s(row, 'Dive type') || undefined,
    rating: rating(read.n(row, 'Rating')),
    remarks: read.s(row, 'Notes') || null,
    profile: (profiles.get(i + 1) ?? [])
      .map((r) => {
        const p: Record<string, number> = { t: pread.n(r, 'Time') ?? NaN, d: pread.len(r, 'Depth') ?? 0 };
        const v = pread.len(r, 'Speed');
        if (v != null) p.v = v;
        const hr = pread.n(r, 'HR');
        if (hr != null) p.hr = hr;
        const temp = pread.temp(r, 'Temp');
        if (temp != null) p.temp = temp;
        return p;
      })
      .filter((p) => Number.isFinite(p.t)),
  }));
  return {
    complete: false,
    session: {
      mode: 'depth',
      date,
      location,
      remarks,
      discipline: str(summaryValue(summary, 'Discipline')) || undefined,
      waterTemp: tempFromSummary(summary),
      maxDepth: dives.reduce((a, d) => (d.depth > a ? d.depth : a), 0),
      dives,
    },
  };
}

function dryFromSheets(sheets: SheetMap, date: string, remarks: string | null): SessionFile {
  const holdRows = sheets.Holds ?? [];
  if (holdRows.length < 2) throw new SessionFileError('no-dives');
  const read = reader(holdRows[0]);
  const holds: DryHoldRow[] = holdRows.slice(1).map((row) => ({
    seconds: read.n(row, 'Hold time') ?? 0,
    contractions: read.n(row, 'Contractions') ?? 0,
    rating: rating(read.n(row, 'Rating')),
    note: read.s(row, 'Note') || null,
  }));

  // Only real contraction times: the hold counts alone give no position.
  const contractions: { holdIdx: number; elapsed: number }[] = [];
  const timed = sheets.Contractions ?? [];
  const cread = reader(timed[0] ?? []);
  for (const row of timed.slice(1)) {
    const hold = cread.n(row, 'Hold #');
    const elapsed = cread.n(row, 'Time from start');
    if (hold != null && elapsed != null) contractions.push({ holdIdx: hold - 1, elapsed });
  }

  const oxyRows = sheets.Oximetry ?? [];
  const oread = reader(oxyRows[0] ?? []);
  const oxyReadings = oxyRows.slice(1).flatMap((row) => {
    const t = oread.n(row, 'Time');
    if (t == null) return [];
    return [{ t: t * 1000, s: oread.n(row, 'SpO2') ?? 0, h: oread.n(row, 'HR') ?? 0, p: oread.n(row, 'PI') ?? 0 }];
  });

  return {
    complete: false,
    holds,
    session: {
      mode: 'dry',
      date,
      remarks,
      // No timeline: without the breathing phases the holds would be drawn
      // back to back and drift away from the SpO₂ readings they belong to.
      blockTimeline: [],
      contractions,
      oxyReadings,
    },
  };
}

interface XlsxModule {
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (sheet: unknown, opts: { header: 1; blankrows: boolean; defval: null }) => Aoa };
}

/** Read an .xlsx file. SheetJS comes from a CDN on demand, as for the exercise import. */
export async function readSessionFile(file: File): Promise<SessionFile> {
  const xlsxUrl = 'https://esm.sh/xlsx@0.18.5';
  const XLSX = (await import(/* @vite-ignore */ xlsxUrl)) as XlsxModule;
  let wb: ReturnType<XlsxModule['read']>;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  } catch {
    throw new SessionFileError('not-export');
  }
  const sheets: SheetMap = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null });
  }
  return sessionFromSheets(sheets);
}
