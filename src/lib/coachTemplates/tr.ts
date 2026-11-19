/**
 * The translator the shared template files write a session's text with
 * (deliver.ts `Tr`): the app's own strings, copied into strings.json by
 * scripts/sync-shared-templates.mjs, so a session sent from the portal reads
 * word for word like one sent from the phone. Keys and {{slots}} are
 * i18next's; plurals use the `_one` / `_other` pair on `count`.
 */
import { getLang, type Lang } from '../../i18n/useLang';
import type { Tr } from './deliver';
import strings from './strings.json';

const ALL = strings as Record<string, Record<string, string>>;

export function templateTr(lang: Lang = getLang()): Tr {
  const dict = ALL[lang] ?? ALL.en;
  return (key, opts = {}) => {
    const plural = typeof opts.count === 'number' ? (opts.count === 1 ? '_one' : '_other') : '';
    const raw =
      dict[key + plural] ?? ALL.en[key + plural] ?? dict[key] ?? ALL.en[key] ?? key;
    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) =>
      k in opts ? String(opts[k]) : m,
    );
  };
}
