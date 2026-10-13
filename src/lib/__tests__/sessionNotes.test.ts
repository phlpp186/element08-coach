import { describe, expect, it } from 'vitest';
import { diveRemarks, holdNotes, sessionChips, sessionNoteLines } from '../sessionNotes';

describe('diveRemarks', () => {
  it('keeps the dive index and drops blank or missing remarks', () => {
    const dives = [{ remarks: 'squeeze at 30' }, { remarks: '  ' }, {}, { remarks: null }, { remarks: ' early turn ' }];
    expect(diveRemarks(dives)).toEqual([
      { index: 0, text: 'squeeze at 30' },
      { index: 4, text: 'early turn' },
    ]);
  });
  it('tolerates a missing dive list', () => {
    expect(diveRemarks(undefined)).toEqual([]);
  });
});

describe('holdNotes', () => {
  it('numbers holds among Hold blocks only', () => {
    const tl = [
      { type: 'Rest', seconds: 120, note: 'ignored, not a hold' },
      { type: 'Hold', seconds: 90 },
      { type: 'Recover', seconds: 30 },
      { type: 'Rest', seconds: 120 },
      { type: 'Hold', seconds: 225, note: 'first contraction late' },
    ];
    expect(holdNotes(tl)).toEqual([{ holdNumber: 2, seconds: 225, text: 'first contraction late' }]);
  });
});

describe('sessionNoteLines', () => {
  it('reads hold notes for dry and dive remarks otherwise', () => {
    expect(sessionNoteLines({ mode: 'dry', blockTimeline: [{ type: 'Hold', seconds: 60, note: 'ok' }] })).toEqual([
      { kind: 'hold', n: 1, text: 'ok' },
    ]);
    expect(sessionNoteLines({ mode: 'pool', dives: [{}, { remarks: 'cramp' }] })).toEqual([
      { kind: 'dive', n: 2, text: 'cramp' },
    ]);
    expect(sessionNoteLines(null)).toEqual([]);
  });
});

describe('sessionChips', () => {
  it('depth: dive count + deepest dive', () => {
    const c = sessionChips({ mode: 'depth', maxDepth: 0, dives: [{ depth: 32 }, { depth: 41.5 }, { depth: 12 }] });
    expect(c).toMatchObject({ mode: 'depth', diveCount: 3, maxDepth: 41.5 });
  });
  it('pool: best distance from dynamic dives, STA as a hold', () => {
    const c = sessionChips({
      mode: 'pool',
      dives: [
        { discipline: 'DYN', distance: 100 },
        { discipline: 'DNF', distance: 75 },
        { discipline: 'STA', diveTime: 240, distance: 0 },
      ],
    });
    expect(c).toMatchObject({ diveCount: 3, bestDistance: 100, longestHoldSec: 240 });
  });
  it('dry: longest hold', () => {
    const c = sessionChips({ mode: 'dry', blockTimeline: [{ type: 'Hold', seconds: 90 }, { type: 'Rest', seconds: 300 }, { type: 'Hold', seconds: 150 }] });
    expect(c).toMatchObject({ mode: 'dry', longestHoldSec: 150, diveCount: null });
  });
});
