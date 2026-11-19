/**
 * Exercises picked on the Exercises page, on their way into a new session
 * template: the template editor opens on another route, so the lines wait
 * here until it has read them. Memory only: a reload starts a blank template.
 */
let lines: string[] | null = null;

export function stashTemplateLines(next: string[]): void {
  lines = next.map((l) => l.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
}

/** The waiting lines. They stay until cleared, because React may build the
 *  editor's first state twice. */
export function stashedTemplateLines(): string[] | null {
  return lines?.length ? lines : null;
}

export function clearTemplateLines(): void {
  lines = null;
}
