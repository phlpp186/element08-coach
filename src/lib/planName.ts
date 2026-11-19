/**
 * Naming a plan that must not be mistaken for another one: a duplicate, or a
 * new version saved beside the one the athletes keep. The name has to be
 * filled in and must not be carried by another plan already (compared without
 * case and outer spaces).
 */
export type NameProblem = 'empty' | 'taken';

export function nameProblem(name: string, taken: readonly string[]): NameProblem | null {
  const n = name.trim().toLowerCase();
  if (!n) return 'empty';
  return taken.some((x) => x.trim().toLowerCase() === n) ? 'taken' : null;
}
