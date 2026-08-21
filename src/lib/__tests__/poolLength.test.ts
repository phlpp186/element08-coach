/**
 * The gap this closes: the app made `poolLengthM` the truth on 2026-08-09 and
 * the coach portal kept reading the `poolType` enum, so an attached session from
 * a 33 m pool showed the coach no pool length at all.
 *
 * Attached session blobs are unversioned, so both shapes have to keep reading.
 */
import { describe, expect, it } from 'vitest';
import { poolLengthLabel, poolMeters } from '../poolLength';

describe('pool length reads metres first, enum second', () => {
  it('shows a non-competition pool the enum cannot name', () => {
    const blob = { poolType: '-', poolLengthM: 33 };
    expect(poolMeters(blob)).toBe(33);
    expect(poolLengthLabel(blob)).toBe('33m');
  });

  it('reads sessions attached before the metres change', () => {
    expect(poolMeters({ poolType: '25m' })).toBe(25);
    expect(poolMeters({ poolType: '50m' })).toBe(50);
    expect(poolLengthLabel({ poolType: '50m' })).toBe('50m');
  });

  it('still says nothing when the length is genuinely unknown', () => {
    expect(poolMeters({ poolType: '-' })).toBe(0);
    expect(poolMeters({})).toBe(0);
    expect(poolMeters(undefined)).toBe(0);
    expect(poolLengthLabel({ poolType: '-' })).toBe('-');
  });

  it('prefers metres over a stale enum rather than averaging the two', () => {
    expect(poolMeters({ poolType: '25m', poolLengthM: 50 })).toBe(50);
  });

  it('ignores a metre value that is not one', () => {
    expect(poolMeters({ poolType: '25m', poolLengthM: 0 })).toBe(25);
    expect(poolMeters({ poolType: '25m', poolLengthM: null })).toBe(25);
    expect(poolMeters({ poolType: '-', poolLengthM: Number.NaN })).toBe(0);
  });

  it('prints a fractional length without a float tail', () => {
    expect(poolLengthLabel({ poolLengthM: 16.6666666 })).toBe('16.7m');
  });
});
