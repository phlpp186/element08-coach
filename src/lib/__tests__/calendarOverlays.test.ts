/**
 * The plan calendar's library rail and session panel sit in sticky boxes. A
 * sticky box makes its own layer, so a full-screen overlay (`fixed inset-0`)
 * rendered inside it only layers within that box: the calendar grid drew over
 * the "All templates" picker (Philipp's screenshot, 2026-11-22). Every overlay
 * those two can open must go to the page root with createPortal.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../..');
const STICKY_CONTENTS = ['components/calendar/PlanRail.tsx', 'components/calendar/SessionPanel.tsx'];

function resolveImport(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec));
  for (const f of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(f)) return f;
  }
  return null;
}

/** Every source file a component pulls in, itself included (relative imports only). */
function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const todo = [join(SRC, entry)];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const r = resolveImport(f, m[1]);
      if (r && !seen.has(r)) todo.push(r);
    }
  }
  return [...seen];
}

describe('overlays opened from the plan calendar', () => {
  it('render at the page root, above the calendar grid', () => {
    const offenders = STICKY_CONTENTS.flatMap(reachable)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return src.includes('fixed inset-0') && !src.includes('createPortal');
      })
      .map((f) => relative(SRC, f));
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('the check sees the template picker', () => {
    // Guards the test itself: the picker is what broke.
    expect(reachable(STICKY_CONTENTS[0]).map((f) => relative(SRC, f))).toContain('components/TemplatePicker.tsx');
  });
});
