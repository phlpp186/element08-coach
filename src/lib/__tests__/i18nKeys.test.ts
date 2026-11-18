/**
 * Every string a component passes to t() / tr() as a plain literal has a
 * translation in every locale file. English is the key and the fallback, so
 * a missing key shows English inside a translated screen without any error.
 * Strings built at run time (label tables, template literals) are not seen
 * here; KNOWN_TABLES lists the tables this suite reads as well.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../..');
const LOCALES = join(SRC, 'i18n/locales');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'dev' ? [] : files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Keys that were already untranslated when this test was added
 *  (2026-11-18). Translate one, then delete it here; never add to it. */
const BACKLOG = new Set<string>(JSON.parse(readFileSync(join(__dirname, 'fixtures/i18nBacklog.json'), 'utf8')));

const CALL = /\b(?:t|tr)\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*[,)]/g;

function keys(): Set<string> {
  const out = new Set<string>();
  for (const f of files(SRC)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(CALL)) {
      const raw = m[1] ?? m[2];
      out.add(raw.replace(/\\(["'\\])/g, '$1'));
    }
  }
  return out;
}

describe('portal translations', () => {
  const used = keys();
  for (const file of readdirSync(LOCALES).filter((n) => n.endsWith('.json'))) {
    it(`${file} has every literal string`, () => {
      const dict = JSON.parse(readFileSync(join(LOCALES, file), 'utf8')) as Record<string, string>;
      const missing = [...used].filter((k) => !(k in dict) && !BACKLOG.has(k)).sort();
      expect(missing).toEqual([]);
    });
  }
});
