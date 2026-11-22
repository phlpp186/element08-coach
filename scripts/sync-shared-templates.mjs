// The session template model is ONE set of files shared with the phone app
// (element08-app/src/lib/coachTemplates, listed in its
// scripts/shared-templates.txt). The app is the source: edit there, then run
//   npm run sync:shared      copy the files and the strings here
//   npm run check:shared     fail when this repo's copies differ
// APP_DIR picks the app checkout (default ../element08-app); point it at a
// worktree while a change is still on a feature branch.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(process.env.APP_DIR ?? join(here, '../../element08-app'));
const dest = join(here, '../src/lib/coachTemplates');
const check = process.argv.includes('--check');
const listFile = join(app, 'scripts/shared-templates.txt');

if (!existsSync(listFile)) {
  console.error(`No ${listFile}. Set APP_DIR to an app checkout that has the shared templates.`);
  process.exit(check ? 1 : 2);
}

const LANGS = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'th', 'zh-Hans', 'zh-Hant'];
// What deliver.ts and summary.ts write with: the text of a sent session.
const SUBTREES = ['deliver', 'summary'];
// editor.parts.dry: the name sessionParts.ts gives a table on an unnamed session.
const EXTRA = ['library.blocks_one', 'library.blocks_other', 'editor.parts.dry'];
const WORKOUT_TITLES = ['courses.circuit.title', 'courses.hiit.title', 'courses.apneaHiit.title'];
// The app's exercise names (exercises.ts lists the ids): the programme editor
// finds a typed exercise by any of them and suggests them.
const FITNESS_SUBTREES = ['exercise'];

const at = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function flatten(o, prefix, out) {
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
}

function strings() {
  const all = {};
  for (const lang of LANGS) {
    const dir = join(app, 'src/i18n/locales', lang);
    const tpl = JSON.parse(readFileSync(join(dir, 'coachTemplates.json'), 'utf8'));
    const plans = JSON.parse(readFileSync(join(dir, 'trainingPlans.json'), 'utf8'));
    const fitness = JSON.parse(readFileSync(join(dir, 'fitness.json'), 'utf8'));
    const out = {};
    for (const s of SUBTREES) flatten(tpl[s], `${s}.`, out);
    for (const k of EXTRA) if (at(tpl, k) != null) out[k] = at(tpl, k);
    for (const k of WORKOUT_TITLES) if (at(plans, k) != null) out[`trainingPlans:${k}`] = at(plans, k);
    for (const s of FITNESS_SUBTREES) flatten(fitness[s], `fitness:${s}.`, out);
    all[lang] = out;
  }
  return `${JSON.stringify(all, null, 2)}\n`;
}

const files = readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const wanted = files.map((f) => [f, readFileSync(join(app, 'src/lib/coachTemplates', f), 'utf8')]);
wanted.push(['strings.json', strings()]);

let drift = 0;
mkdirSync(dest, { recursive: true });
for (const [name, text] of wanted) {
  const target = join(dest, name);
  const have = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (have === text) continue;
  drift++;
  if (check) console.error(`DRIFT  src/lib/coachTemplates/${name}`);
  else {
    writeFileSync(target, text);
    console.log(`copied src/lib/coachTemplates/${name}`);
  }
}
if (check && drift) {
  console.error(`${drift} shared file(s) differ from ${app}. Edit in the app, then npm run sync:shared.`);
  process.exit(1);
}
console.log(check ? `shared templates match ${app}` : `in sync with ${app}`);
