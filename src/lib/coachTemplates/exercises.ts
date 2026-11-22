/**
 * The app's exercise list (lib/fitness/catalogue) as a coach's fitness
 * programme can name it. A programme exercise with one of these ids runs as
 * that exercise in the app: its name in the athlete's language, and its clip
 * or photo (lib/fitness/media) above the timer when `media` is set. A name
 * that is not on the list stays the coach's own (id custom:<name>).
 *
 * Shared with the coach portal, which has no catalogue of its own: the coach
 * types a name, the portal finds the exercise (recognizeExercise) and the
 * programme carries its id (ProgramItem.exerciseId; Philipp, 2026-11-22).
 * coachExercises.test.ts keeps this list equal to the catalogue and its media.
 */

export interface CoachExercise {
  id: string;
  /** The app has a clip or a photo for it. */
  media: boolean;
}

export const COACH_EXERCISES: readonly CoachExercise[] = [
  { id: 'back-squat', media: true },
  { id: 'front-squat', media: true },
  { id: 'goblet-squat', media: true },
  { id: 'air-squat', media: true },
  { id: 'leg-press', media: true },
  { id: 'lunge', media: true },
  { id: 'walking-lunge', media: true },
  { id: 'bulgarian-split-squat', media: true },
  { id: 'deadlift', media: true },
  { id: 'romanian-deadlift', media: true },
  { id: 'hip-thrust', media: true },
  { id: 'glute-bridge', media: true },
  { id: 'calf-raise', media: false },
  { id: 'box-jump', media: true },
  { id: 'donkey-kick', media: true },
  { id: 'trap-bar-deadlift', media: true },
  { id: 'broad-jump', media: true },
  { id: 'squat-jump', media: false },
  { id: 'nordic-curl', media: false },
  { id: 'single-leg-ball-hamstring-curl', media: true },
  { id: 'ffe-split-squat', media: false },
  { id: 'kettlebell-swing', media: false },
  { id: 'bench-press', media: true },
  { id: 'overhead-press', media: false },
  { id: 'landmine-press', media: false },
  { id: 'push-up', media: true },
  { id: 'pike-push-up', media: true },
  { id: 'dips', media: true },
  { id: 'assisted-dips', media: true },
  { id: 'triceps-pushdown', media: true },
  { id: 'pull-up', media: true },
  { id: 'weighted-pull-up', media: true },
  { id: 'assisted-pull-up', media: true },
  { id: 'chin-up', media: true },
  { id: 'lat-pulldown', media: true },
  { id: 'row', media: true },
  { id: 'barbell-row', media: true },
  { id: 'dumbbell-row', media: false },
  { id: 'dumbbell-pullover', media: true },
  { id: 'standing-lat-pushdown', media: true },
  { id: 'face-pull', media: false },
  { id: 'chest-supported-row', media: false },
  { id: 'rope-pull', media: false },
  { id: 'plank', media: true },
  { id: 'side-plank-left', media: true },
  { id: 'side-plank-right', media: true },
  { id: 'alternate-plank', media: true },
  { id: 'reverse-plank', media: false },
  { id: 'inchworm', media: true },
  { id: 'superman', media: true },
  { id: 'swimmers', media: true },
  { id: 'leg-raises', media: true },
  { id: 'hanging-leg-raise', media: true },
  { id: 'hanging-leg-raise-straight', media: true },
  { id: 'flutter-kicks', media: true },
  { id: 'crunches', media: true },
  { id: 'sit-up-crossover', media: true },
  { id: 'russian-twist', media: false },
  { id: 'boat-hold', media: true },
  { id: 'windshield-wipers', media: true },
  { id: 'jack-knives', media: true },
  { id: 'copenhagen-plank', media: true },
  { id: 'pallof-press', media: true },
  { id: 'suitcase-carry', media: true },
  { id: 'neck-isometrics', media: false },
  { id: 'burpee', media: false },
  { id: 'bar-facing-burpee', media: true },
  { id: 'mountain-climbers', media: true },
  { id: 'in-and-out-jump', media: true },
  { id: 'high-knees', media: false },
  { id: 'knee-kicks', media: false },
  { id: 'hand-to-foot-reach', media: false },
  { id: 'ball-slam', media: true },
  { id: 'ski-erg', media: true },
  { id: 'ski-erg-straight', media: true },
  { id: 'stationary-bike', media: true },
  { id: 'farmer-carry', media: false },
  { id: 'ribcage-stretch', media: true },
  { id: 'diaphragm-stretch', media: false },
  { id: 'thoracic-extension', media: true },
  { id: 'open-book', media: true },
  { id: 'hip-flexor-stretch', media: false },
  { id: 'ankle-stretch', media: false },
  { id: 'chin-tucks', media: false },
  { id: 'eq-practice', media: false },
];

const IDS = new Set(COACH_EXERCISES.map((e) => e.id));

export function isCoachExercise(id: string | null | undefined): boolean {
  return !!id && IDS.has(id);
}

/** Gym names that are no catalogue name in any language, as exerciseKey()s. */
const ALIASES: Record<string, string> = {
  barbellsquat: 'back-squat',
  barbellbacksquat: 'back-squat',
  bench: 'bench-press',
  rdl: 'romanian-deadlift',
  ohp: 'overhead-press',
  militarypress: 'overhead-press',
  shoulderpress: 'overhead-press',
  plank: 'plank',
  kbswing: 'kettlebell-swing',
};

/** Lower case, letters and digits only, accents dropped: "Pull-up", "pull
 *  up" and "Pullup" are one name. */
export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** A plural "s" or "es" does not make another exercise ("Lunge", "Lunges"). */
const loose = (key: string) => key.replace(/e?s$/, '');

/** The list exercise a typed name is, or null. `names(id)` gives its names
 *  in every language the caller has; the id itself counts as one ("ski-erg").
 *  Whole names only: "Squat" alone could be several. */
export function recognizeExercise(
  name: string,
  names: (id: string) => readonly string[],
): string | null {
  const key = exerciseKey(name);
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  const want = loose(key);
  for (const ex of COACH_EXERCISES) {
    if ([ex.id, ...names(ex.id)].some((n) => loose(exerciseKey(n)) === want)) return ex.id;
  }
  return null;
}
