import { describe, expect, it } from 'vitest';
import { shownName } from '../typedName';

describe('a name that comes back trimmed', () => {
  it('keeps the space typed at the end, so the next word can follow', () => {
    expect(shownName('Barbell ', 'Barbell')).toBe('Barbell ');
    expect(shownName('Barbell S', 'Barbell S')).toBe('Barbell S');
  });

  it('shows the stored name once it changed from elsewhere', () => {
    expect(shownName('Barbell ', 'Plank')).toBe('Plank');
    expect(shownName('', 'Plank')).toBe('Plank');
  });
});
