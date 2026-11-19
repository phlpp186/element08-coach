import { describe, expect, it } from 'vitest';
import { nameProblem } from '../planName';

describe('nameProblem', () => {
  const taken = ['CWT Base', ' Pool block '];
  it('refuses an empty name', () => {
    expect(nameProblem('   ', taken)).toBe('empty');
  });
  it('refuses the name of another plan, whatever the case or outer spaces', () => {
    expect(nameProblem('cwt base', taken)).toBe('taken');
    expect(nameProblem('Pool block', taken)).toBe('taken');
  });
  it('accepts a name of its own', () => {
    expect(nameProblem('CWT Base 2027', taken)).toBeNull();
  });
});
