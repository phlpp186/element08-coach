import { describe, expect, it } from 'vitest';
import { isSessionExport, sessionFromSheets, SessionFileError, type SheetMap } from '../sessionFile';
import fx from './fixtures/sessionExports.json';

// The fixtures are the app's REAL export (Deeptimerapp buildSessionWorkbook,
// written to .xlsx bytes and read back), with and without the hidden data
// sheet. Regenerate them when the app's export changes, so drift shows here.
const S = fx as unknown as Record<string, SheetMap> & { sessions: Record<string, Record<string, unknown>> };

describe('sessionFromSheets: full data sheet', () => {
  it('returns the exact session the app exported', () => {
    const r = sessionFromSheets(S.depthFull);
    expect(r.complete).toBe(true);
    expect(r.session).toEqual(fx.sessions.depth);
  });

  it('keeps the dry breathing phases', () => {
    const r = sessionFromSheets(S.dryFull);
    expect(r.session).toEqual(fx.sessions.dry);
    expect(r.holds).toBeUndefined();
  });

  it('falls back to the visible sheets when the data sheet is damaged', () => {
    const broken = { ...S.depthFull, 'E08 data': [S.depthFull['E08 data'][0], ['{"mode":"de']] };
    const r = sessionFromSheets(broken);
    expect(r.complete).toBe(false);
    expect((r.session.dives as unknown[]).length).toBe(2);
  });
});

describe('sessionFromSheets: older export (visible sheets only)', () => {
  it('rebuilds depth dives with their 1 Hz profile', () => {
    const r = sessionFromSheets(S.depthOld);
    expect(r.complete).toBe(false);
    const s = r.session as { mode: string; maxDepth: number; dives: { depth: number; profile: { t: number; d: number; hr?: number }[]; remarks: string }[] };
    expect(s.mode).toBe('depth');
    expect(s.maxDepth).toBeCloseTo(30.4, 1);
    expect(s.dives[0].profile).toHaveLength(3);
    expect(s.dives[0].profile[2]).toMatchObject({ t: 2, d: 2.5, hr: 66 });
    expect(s.dives[0].remarks).toBe('clean turn');
    expect(s.dives[1].profile).toHaveLength(2);
  });

  it('converts an imperial export back to metres and °C', () => {
    const s = sessionFromSheets(S.depthOldImperial).session as { waterTemp: number; dives: { depth: number; profile: { d: number; temp?: number }[] }[] };
    // Rounded to 0.1 ft / 0.1 °F in the sheet.
    expect(s.dives[0].depth).toBeCloseTo(30.4, 1);
    expect(s.dives[0].profile[2].d).toBeCloseTo(2.5, 1);
    expect(s.dives[0].profile[2].temp).toBeCloseTo(23.8, 1);
    expect(s.waterTemp).toBeCloseTo(24, 1);
  });

  it('rebuilds pool dives with profile, laps and length', () => {
    const s = sessionFromSheets(S.poolOld).session as {
      poolLengthM: number;
      totalDistance: number;
      dives: { distance: number; lapTimes: number[]; profile: { t: number; hr: number; speed: number }[] }[];
    };
    expect(s.poolLengthM).toBe(25);
    expect(s.totalDistance).toBe(150);
    expect(s.dives[0].lapTimes).toEqual([20, 21, 22, 22]);
    expect(s.dives[0].profile[1]).toMatchObject({ t: 1, hr: 78, speed: 1.2 });
    expect(s.dives[1].lapTimes).toEqual([]);
  });

  it('lists dry holds beside the readings instead of a misplaced timeline', () => {
    const r = sessionFromSheets(S.dryOld);
    expect(r.holds).toEqual([
      { seconds: 90, contractions: 1, rating: 5, note: 'calm' },
      { seconds: 95, contractions: 2, rating: null, note: null },
    ]);
    const s = r.session as { blockTimeline: unknown[]; oxyReadings: { t: number }[]; contractions: { elapsed: number }[] };
    expect(s.blockTimeline).toEqual([]);
    expect(s.oxyReadings.map((o) => o.t)).toEqual([0, 1000, 2000]);
    expect(s.contractions.map((c) => c.elapsed)).toEqual([190, 400, 405]);
  });
});

describe('not an export', () => {
  it('says so for any other spreadsheet', () => {
    const other = { Sheet1: [['Name', 'PB'], ['Lena', 60]] };
    expect(isSessionExport(other)).toBe(false);
    expect(() => sessionFromSheets(other)).toThrow(SessionFileError);
  });

  it('recognises both kinds of export', () => {
    expect(isSessionExport(S.depthFull)).toBe(true);
    expect(isSessionExport(S.dryOld)).toBe(true);
  });
});
