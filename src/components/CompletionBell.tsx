/**
 * CompletionBell — header notification bell for coaches: "your athlete marked
 * a session done". Feeds from the completions the coach can already read
 * (listRecentCompletions, RLS-scoped, filtered to their own assignments),
 * resolves each entry to athlete + session label + plan title via the cached
 * cloud plan definitions, and goes live over the same completions Realtime
 * channel the roster uses. Unread = completed after the locally stored
 * last-seen stamp (element08.coach.completionsSeen); opening the panel marks
 * everything read, clicking an entry jumps into the athlete's plan view.
 * Renders nothing when signed out or not a coach.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  getPlan,
  listCoachAssignments,
  listRecentCompletions,
  subscribeToTables,
  unsubscribeChannel,
} from '../lib/supabase/coachData';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';

const SEEN_KEY = 'element08.coach.completionsSeen';
const FEED_LIMIT = 30;

interface FeedEntry {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  planTitle: string;
  sessionLabel: string;
  completedAt: string;
  rating: number | null;
  hasRemarks: boolean;
}

/** Session label from a stored cloud plan definition (the app Plan shape:
 *  phases → weeks → plannedSessions), same fallback chain the plan view uses. */
function sessionLabelIn(definition: unknown, sessionId: string): string | null {
  const phases =
    (definition as { phases?: { weeks?: { plannedSessions?: { id?: string; label?: string; sessionType?: string }[] }[] }[] })
      ?.phases ?? [];
  for (const ph of phases) {
    for (const w of ph.weeks ?? []) {
      for (const s of w.plannedSessions ?? []) {
        if (s.id === sessionId) return s.label?.trim() || s.sessionType || null;
      }
    }
  }
  return null;
}

const REL_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function relTime(iso: string): string {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return REL_FMT.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return REL_FMT.format(hours, 'hour');
  return REL_FMT.format(Math.round(hours / 24), 'day');
}

export function CompletionBell() {
  const t = useT();
  const { session, isCoach } = useAuth();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string>(() => localStorage.getItem(SEEN_KEY) ?? '');
  // What "new" means inside an open panel: the seen stamp from before opening.
  const [openSnapshot, setOpenSnapshot] = useState<string>('');
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!session || !isCoach) {
      setEntries([]);
      return;
    }
    try {
      const [assignments, completions] = await Promise.all([
        listCoachAssignments(),
        listRecentCompletions(FEED_LIMIT),
      ]);
      const byAssignment = new Map(assignments.map((a) => [a.id, a]));
      const planCache = new Map<string, unknown>();
      const definitionFor = async (planId: string): Promise<unknown> => {
        if (!planCache.has(planId)) planCache.set(planId, (await getPlan(planId))?.definition ?? null);
        return planCache.get(planId);
      };
      const out: FeedEntry[] = [];
      for (const c of completions) {
        const a = byAssignment.get(c.assignment_id);
        if (!a || !c.completed_at) continue;
        const label = sessionLabelIn(await definitionFor(a.planId), c.exercise_id) ?? t('Session');
        out.push({
          id: c.id,
          assignmentId: a.id,
          studentId: a.studentId,
          studentName: a.studentName,
          planTitle: a.planTitle,
          sessionLabel: label,
          completedAt: c.completed_at,
          rating: c.rating,
          hasRemarks: !!c.remarks?.trim(),
        });
      }
      setEntries(out);
    } catch {
      // Keep whatever we had; the next Realtime tick or mount retries.
    }
  }, [session, isCoach, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session || !isCoach) return;
    const ch = subscribeToTables(['completions'], () => refresh());
    return () => unsubscribeChannel(ch);
  }, [session, isCoach, refresh]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = useMemo(
    () => entries.filter((e) => !seenAt || e.completedAt > seenAt).length,
    [entries, seenAt],
  );

  if (!session || !isCoach) return null;

  const toggle = () => {
    if (!open) {
      setOpenSnapshot(seenAt);
      const now = new Date().toISOString();
      localStorage.setItem(SEEN_KEY, now);
      setSeenAt(now);
    }
    setOpen(!open);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        title={t('Completed sessions')}
        aria-label={t('Completed sessions')}
        className={`relative rounded-lg border px-2.5 py-1.5 text-sm ${
          open ? 'border-accent text-accent' : 'border-border text-textDim hover:text-text'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-highlight text-ink text-[10px] font-bold leading-[18px] text-center tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto glass-card rounded-xl z-30 p-2">
          <div className="px-2 py-1.5 text-xs uppercase tracking-wide text-textDim">{t('Completed sessions')}</div>
          {entries.length === 0 ? (
            <div className="px-2 pb-2 text-sm text-textDim">{t('No completed sessions yet.')}</div>
          ) : (
            entries.map((e) => {
              const isNew = !openSnapshot || e.completedAt > openSnapshot;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/connected/${e.studentId}/plan/${e.assignmentId}`);
                  }}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-abyss/60"
                >
                  <div className="flex items-center gap-2 text-sm">
                    {isNew && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                    <span className="font-medium truncate">{e.studentName}</span>
                    <span className="text-textDim truncate flex-1">{e.sessionLabel}</span>
                    {e.rating != null && <span className="text-amber text-xs shrink-0">★ {e.rating}</span>}
                  </div>
                  <div className="text-xs text-textDim mt-0.5 truncate">
                    {e.planTitle} · {relTime(e.completedAt)}
                    {e.hasRemarks && <span> · ✎</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
