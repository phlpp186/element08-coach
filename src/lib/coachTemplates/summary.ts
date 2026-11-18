/** One-line descriptions for the template library cards and the send sheet. */
import { FITNESS_WORKOUTS, textLines, type CoachTemplate, type TemplateBlock } from './model';
import { formatValue, targetUnit, type ResolvedTarget } from './resolve';
import type { Tr } from './deliver';

/** "CWT 80% PB", "DYN 75 m", "holds 50% STA", "table, 4 rows". */
export function blockSummary(b: TemplateBlock, imperial: boolean, t: Tr): string {
  const ex = b.exercise;
  switch (ex.kind) {
    case 'depth':
    case 'pool': {
      const unit = targetUnit(ex);
      const { kind, value } = ex.target;
      if (kind === 'pct') return t('summary.pct', { discipline: ex.discipline, pct: value });
      const v = formatValue(value, unit, imperial);
      return kind === 'minus'
        ? t('summary.minus', { discipline: ex.discipline, value: v })
        : t('summary.target', { discipline: ex.discipline, value: v });
    }
    case 'dry':
      if (ex.holdTarget?.kind === 'pct') return t('summary.holdsPct', { pct: ex.holdTarget.value });
      if (ex.holdTarget?.kind === 'minus') {
        return t('summary.holdsMinus', { value: formatValue(ex.holdTarget.value, 's', false) });
      }
      return t('summary.table', { n: ex.rows.length });
    case 'program':
      return t('summary.program', { n: ex.items.length });
    case 'fitness': {
      const w = FITNESS_WORKOUTS.find((x) => x.id === ex.workout);
      return w ? t(`trainingPlans:${w.titleKey}`) : ex.text.trim() || t('summary.text');
    }
    case 'text': {
      const lines = textLines(ex.text);
      return lines.length ? lines[0] : t('summary.text');
    }
  }
}

/** "3 blocks · CWT 80% PB · FIM 15 m": the count, then up to two distinct
 *  block summaries. */
export function templateSummary(tpl: CoachTemplate, imperial: boolean, t: Tr): string {
  const parts: string[] = [];
  for (const b of tpl.blocks) {
    const s = blockSummary(b, imperial, t);
    if (!parts.includes(s)) parts.push(s);
    if (parts.length === 2) break;
  }
  return [t('library.blocks', { count: tpl.blocks.length }), ...parts].join(' · ');
}

/** An athlete's resolved targets as "CWT 32 m · DYN 70 m". */
export function resolvedSummary(resolved: ResolvedTarget[], imperial: boolean): string {
  return resolved
    .filter((r) => r.value != null)
    .map((r) => `${r.discipline} ${formatValue(r.value!, r.unit, imperial)}`)
    .join(' · ');
}
