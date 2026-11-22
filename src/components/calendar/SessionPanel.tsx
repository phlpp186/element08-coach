/**
 * The session editor in a side panel, so the calendar stays in view (piece 1
 * of element08-app/docs/mockups/portal-plan-calendar-options.html). Inside is
 * today's editor as it is (Philipp's remark 3 on the mockup): + Exercise with
 * the saved exercises as suggestions, + Dry table, + Fitness, doses, notes,
 * type, target effort, Save as template. Around it: the day, and "Copy to…"
 * for several weeks at once.
 */
import { useEffect, useRef, useState } from 'react';
import { fill, useT } from '../../i18n';
import { addDays, calendarFormat, DAY_LABELS, formatIso, type BuilderSession } from '../../lib/e08plan';
import { beforeStart, isBlankSession, isPastSession, weekMonday, type CalWeek } from '../../lib/planCalendar';
import type { BuilderPlan } from '../../lib/e08plan';
import { SessionEditor } from '../sessions';

const DATE_FMT = calendarFormat({ weekday: 'short', day: 'numeric', month: 'short' });

export function SessionPanel({
  plan,
  rows,
  week,
  session,
  today,
  onChange,
  onClose,
  onDelete,
  onDay,
  onCopyToWeeks,
}: {
  plan: BuilderPlan;
  rows: CalWeek[];
  week: number;
  session: BuilderSession;
  today: string;
  onChange: (patch: Partial<BuilderSession>) => void;
  onClose: () => void;
  onDelete: () => void;
  onDay: (day: number) => void;
  onCopyToWeeks: (weeks: number[]) => void;
}) {
  const t = useT();
  const [copyOpen, setCopyOpen] = useState(false);
  const [pick, setPick] = useState<Set<number>>(() => new Set());
  const date = addDays(weekMonday(plan, week), session.dayOfWeek);
  const picked = [...pick].filter((w) => w !== week && w < rows.length);
  // The athlete's report is stored under the session's id, so a past session
  // stays on its day (Sarang's plan, 2026-11-22). Dragging copies it.
  const past = isPastSession(plan, rows, session.id, today);
  const ref = useRef<HTMLElement>(null);
  // A session just added with "+" starts at its title.
  useEffect(() => {
    if (isBlankSession(session)) ref.current?.querySelector('input')?.focus();
    // Only when another session opens, not on every keystroke.
  }, [session.id]);

  const dayPicker = (
    <div>
      <span className="mb-1 block text-xs uppercase tracking-wide text-textDim">{t('Day')}</span>
      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map((d, i) => (
          <button
            key={d}
            disabled={past || beforeStart(plan, week, i)}
            onClick={() => onDay(i)}
            className={`pill px-2.5 py-0.5 text-xs ${session.dayOfWeek === i ? 'pill-on' : ''} disabled:opacity-30`}
          >
            {t(d)}
          </button>
        ))}
      </div>
      {past && <p className="mt-1 text-xs text-textDim">{t('A past session stays on its day. Drag it to copy it.')}</p>}
    </div>
  );

  return (
    <aside ref={ref} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-textDim">
          {formatIso(DATE_FMT, date)} · {t('Week')} {week + 1}
        </span>
        <button onClick={onClose} title={t('Close')} aria-label={t('Close')} className="rounded border border-border px-2 text-xs text-textDim hover:text-text">
          ✕
        </button>
      </div>
      <SessionEditor key={session.id} session={session} onChange={onChange} onClose={onClose} onDelete={onDelete} extra={dayPicker} />
      <div className="rounded-lg border border-border bg-abyss/60 p-2">
        <button onClick={() => setCopyOpen(!copyOpen)} className="text-xs font-bold text-accent hover:underline">
          {t('Copy to…')}
        </button>
        {copyOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-textDim">{fill(t('A copy on {day} in each week you pick.'), { day: t(DAY_LABELS[session.dayOfWeek]) })}</p>
            <div className="flex flex-wrap gap-1">
              {rows.map((_, i) => (
                <button
                  key={i}
                  disabled={i === week}
                  onClick={() =>
                    setPick((cur) => {
                      const next = new Set(cur);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`h-6 min-w-[1.75rem] rounded-md border px-1 font-mono text-xs ${
                    i === week
                      ? 'border-dashed border-border text-textDim'
                      : pick.has(i)
                        ? 'border-accent bg-accent/20 text-text'
                        : 'border-border text-textDim hover:border-accent'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPick(new Set(rows.map((_, i) => i).filter((i) => i > week)))}
                className="text-xs text-accent hover:underline"
              >
                {t('Every week after this')}
              </button>
              <button onClick={() => setPick(new Set())} className="text-xs text-textDim hover:text-text">
                {t('None')}
              </button>
              <button
                disabled={!picked.length}
                onClick={() => {
                  onCopyToWeeks(picked);
                  setPick(new Set());
                  setCopyOpen(false);
                }}
                className="pill pill-on ml-auto px-3 py-0.5 text-xs disabled:opacity-40"
              >
                {fill(t('Copy to {n} weeks'), { n: picked.length })}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
