/**
 * The plan maker as a calendar (Philipp, 2026-11-21): "+ New plan" opens the
 * weeks straight away, one week opens in place to write it, a session is
 * edited in the side panel, templates and exercises come from the rail.
 * Mockups: element08-app/docs/mockups/portal-plan-a-plus-b.html (combination
 * 1) and portal-plan-calendar-step3.html.
 *
 * Saving, the library, Assign and the .e08plan download work as in the old
 * builder (PlanBuilderView, still reachable with ?classic=1): the plan is the
 * same BuilderPlan, lib/planCalendar only reads and writes it as weeks.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fill, tr, useT } from '../i18n';
import {
  addDays,
  calendarFormat,
  DAY_LABELS,
  downloadPlanFile,
  formatIso,
  initialPlan,
  newSession,
  normalizePlan,
  planIssues,
  planStats,
  todayIso,
  uid,
  type BuilderPlan,
  type BuilderSession,
  type IntensityPreset,
  type MesoType,
} from '../lib/e08plan';
import {
  addSession,
  addWeeks,
  calWeeks,
  clearWeek,
  copySessionTo,
  copyToNextWeek,
  copyToWeeks,
  deleteWeek,
  findSession,
  insertWeek,
  isBlankSession,
  isPastSession,
  keepBoth,
  moveSession,
  nextMonday,
  patchSession,
  phaseFrom,
  planCompetitions,
  removeSession,
  suggestPhases,
  updateWeek,
  weekIndexOf,
  weekMonday,
  weekStarted,
  weeksToReach,
  withCalWeeks,
  withCompetitions,
  withIntensityCurve,
  withoutPhases,
  type CalWeek,
  type PlanCompetition,
} from '../lib/planCalendar';
import { applyWeekTemplate, defaultDoseFor, recordUseByDescription, saveWeekTemplate, useWeekTemplates } from '../lib/library';
import { newPlanId, upsertPlan, useAthletes, useSavedPlan } from '../lib/store';
import type { Athlete } from '../lib/types';
import { navigate } from '../hooks/useHashRoute';
import { useLibrarySave } from '../components/LibrarySave';
import { useLibrary } from '../lib/supabase/planLibrary';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';
import { isAppPlan } from '../lib/planLibrary';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useTemplateChoices } from '../components/sessions';
import { CalendarGrid } from '../components/calendar/CalendarGrid';
import { PlanRail, type Placing } from '../components/calendar/PlanRail';
import { PlanTopBar } from '../components/calendar/PlanTopBar';
import { SessionPanel } from '../components/calendar/SessionPanel';
import { WeekMenu } from '../components/calendar/WeekMenu';
import { Toast, type ToastMsg } from '../components/calendar/Toast';
import type { DragItem } from '../components/calendar/dnd';

const DATE_FMT = calendarFormat({ weekday: 'short', day: 'numeric', month: 'short' });
const NEW_WEEKS = 4;

/** A saved plan as it was; a new one starts next Monday with four empty
 *  weeks, or for an athlete with a competition ahead, with the weeks up to it
 *  and phases suggested (as the old builder did). */
function makeInitial(saved: BuilderPlan | undefined, athlete: Athlete | undefined): BuilderPlan {
  if (saved) return normalizePlan(saved);
  const p: BuilderPlan = { ...initialPlan(), startDate: nextMonday(todayIso()) };
  let rows: CalWeek[] = addWeeks([], NEW_WEEKS);
  let comps: PlanCompetition[] = [];
  if (athlete) {
    p.name = `${athlete.name.trim() || tr('Athlete')} ${tr('plan')}`;
    const next = [...athlete.competitions]
      .filter((c) => c.date && c.date >= p.startDate)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      comps = [{ id: uid('comp'), date: next.date, name: next.name ?? '' }];
      rows = suggestPhases(addWeeks([], weeksToReach(p, next.date)));
    }
  }
  return withCompetitions(withCalWeeks(p, rows), comps);
}

export function PlanCalendarView({ planId, presetAthleteId }: { planId: string | null; presetAthleteId: string | null }) {
  const t = useT();
  const athletes = useAthletes();
  const saved = useSavedPlan(planId);
  const presetAthlete = athletes.find((a) => a.id === presetAthleteId);
  const { session: auth, isCoach, profile } = useAuth();
  const online = !!auth && isCoach;

  const [plan, setPlan] = useState<BuilderPlan>(() => makeInitial(saved?.plan, presetAthlete));
  const [recordId, setRecordId] = useState<string | null>(saved?.id ?? null);
  const [athleteId, setAthleteId] = useState<string | null>(saved?.athleteId ?? presetAthleteId);
  const [dirty, setDirty] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
  const [menu, setMenu] = useState<{ week: number; anchor: HTMLElement } | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const today = todayIso();
  const rows = useMemo(() => calWeeks(plan), [plan]);
  const [open, setOpen] = useState<number>(() => {
    if (!saved) return -1;
    const w = weekIndexOf(saved.plan, today);
    return w >= 0 && w < calWeeks(normalizePlan(saved.plan)).length ? w : -1;
  });
  const library = useLibrarySave();
  const templates = useTemplateChoices();
  const weekTemplates = useWeekTemplates();
  const competitions = planCompetitions(plan);

  // The library can bring in a newer copy of this plan (saved in the app, or
  // the version picked after a clash). Take it unless there are unsaved edits.
  const storedPlan = useSavedPlan(recordId)?.plan;
  useEffect(() => {
    if (storedPlan && !dirty) setPlan((cur) => (cur === storedPlan ? cur : normalizePlan(storedPlan)));
  }, [storedPlan, dirty]);

  // The author is the coach: a new plan takes the signed-in name.
  useEffect(() => {
    const name = profile?.display_name?.trim();
    if (name) setPlan((p) => (p.coach.trim() ? p : { ...p, coach: name }));
  }, [profile?.display_name]);

  const issues = useMemo(() => planIssues(plan), [plan]);
  const stats = useMemo(() => planStats(plan), [plan]);
  const ready = issues.length === 0;

  // ── updates ──
  const mutate = (fn: (p: BuilderPlan) => BuilderPlan) => {
    setPlan(fn);
    setDirty(true);
    setSavedTick(false);
  };
  const mutateRows = (fn: (r: CalWeek[]) => CalWeek[]) => mutate((p) => withCalWeeks(p, fn(calWeeks(p))));
  /** A change the coach can take back from the message. */
  const withUndo = (text: string, fn: (r: CalWeek[]) => CalWeek[], extra: ToastMsg['actions'] = []) => {
    const before = plan;
    mutateRows(fn);
    setToast({ text, actions: [{ label: t('Undo'), run: () => mutate(() => before) }, ...extra] });
  };
  const setMeta = (patch: Partial<BuilderPlan>) => mutate((p) => ({ ...p, ...patch }));
  const dayName = (w: number, d: number) => formatIso(DATE_FMT, addDays(weekMonday(plan, w), d));

  // ── the side panel ──
  const at = selected ? findSession(rows, selected) : null;
  /** Close the panel; a session opened with "+" and left empty goes again. */
  const closePanel = () => {
    if (at && isBlankSession(at.session)) mutateRows((r) => removeSession(r, at.session.id));
    setSelected(null);
  };
  const openSession = (id: string) => {
    if (at && at.session.id !== id && isBlankSession(at.session)) mutateRows((r) => removeSession(r, at.session.id));
    setSelected(id);
    setPlacing(null);
  };
  const addAt = (week: number, s: BuilderSession) => {
    if (at && isBlankSession(at.session)) mutateRows((r) => addSession(removeSession(r, at.session.id), week, s));
    else mutateRows((r) => addSession(r, week, s));
    setSelected(s.id);
  };

  // ── placing from the rail (click, then a day) and dropping ──
  const placeTemplate = (id: string, week: number, day: number) => {
    const make = templates.make(id);
    const s = make?.(day);
    if (s) addAt(week, { ...s, dayOfWeek: day });
  };
  const placeWeek = (id: string, week: number) => {
    const tpl = weekTemplates.find((x) => x.id === id);
    if (!tpl) return;
    mutateRows((r) => updateWeek(r, week, applyWeekTemplate(tpl, r[week].week)));
    setToast({ text: fill(t('{name}: added to week {n}'), { name: tpl.name, n: week + 1 }) });
  };
  const onPlace = (week: number, day: number | null) => {
    if (!placing) return;
    if (placing.k === 'template') {
      if (day == null) return;
      placeTemplate(placing.id, week, day);
    } else placeWeek(placing.id, week);
    setPlacing(null);
  };
  const onDrop = (item: DragItem, week: number, day: number | null, copy: boolean) => {
    if (item.k === 'week') return placeWeek(item.id, week);
    if (day == null) return;
    if (item.k === 'template') return placeTemplate(item.id, week, day);
    if (item.k !== 'session') return;
    const from = findSession(rows, item.id);
    if (!from) return;
    const to = dayName(week, day);
    // A past session is history: its report stays with it on its day.
    if (copy || isPastSession(plan, rows, item.id, today)) {
      withUndo(fill(t('Copied to {day}'), { day: to }), (r) => copySessionTo(r, item.id, week, day));
      return;
    }
    if (from.week === week && from.session.dayOfWeek === day) return;
    const back = { week: from.week, day: from.session.dayOfWeek };
    withUndo(fill(t('Moved to {day}'), { day: to }), (r) => moveSession(r, item.id, week, day), [
      {
        label: fill(t('Keep it on {day} too'), { day: dayName(back.week, back.day) }),
        // The original goes back to its day, the fresh copy stays here.
        run: () => mutateRows((r) => keepBoth(r, item.id, back, { week, day })),
      },
    ]);
  };
  const addExercise = (sessionId: string, description: string) => {
    recordUseByDescription([description]);
    const dose = defaultDoseFor(description);
    mutateRows((r) => {
      const s = findSession(r, sessionId)?.session;
      if (!s) return r;
      return patchSession(r, sessionId, {
        exercises: [...s.exercises, { id: uid('ex'), description, ...(dose ? { dose: dose.map((p) => ({ ...p })) } : {}) }],
      });
    });
  };

  // ── weeks ──
  const weekActions = (w: number, started = weekStarted(plan, w, today)) => ({
    onOpen: open === w ? undefined : () => setOpen(w),
    started,
    onInsert: started ? undefined : () => {
      setOpen((o) => (o >= w ? o + 1 : o));
      withUndo(fill(t('New week {n}: the weeks after it moved one week later'), { n: w + 1 }), (r) => insertWeek(r, w));
    },
    onCopyNext: () => {
      mutateRows((r) => copyToNextWeek(r, w));
      setToast({ text: fill(t('Week {a} copied into week {b}'), { a: w + 1, b: w + 2 }) });
    },
    onSaveTemplate: () => {
      const name = prompt(tr('Template name'), rows[w].week.focus || `${tr('Week')} ${w + 1}`);
      if (name === null || !name.trim()) return;
      saveWeekTemplate(name.trim(), rows[w].week);
      setToast({ text: fill(t('Saved as a week template: {name}'), { name: name.trim() }) });
    },
    onClear: () => withUndo(fill(t('Week {n}: sessions cleared'), { n: w + 1 }), (r) => clearWeek(r, w)),
    onDelete:
      started || rows.length < 2
        ? undefined
        : () => {
            if (selected && at?.week === w) setSelected(null);
            setOpen((o) => (o === w ? -1 : o > w ? o - 1 : o));
            withUndo(fill(t('Week {n} deleted, the weeks after it moved one week earlier'), { n: w + 1 }), (r) => deleteWeek(r, w));
          },
  });
  const onPhase = (w: number, type: MesoType | null) => {
    if (type) mutateRows((r) => phaseFrom(r, w, type));
    else withUndo(t('Phases removed'), withoutPhases);
  };

  // ── competitions ──
  const addCompetition = (date: string, name: string): string | null => {
    if (!date) return t('Pick a date.');
    if (date < plan.startDate) return t('That is before the plan starts.');
    const need = weeksToReach(plan, date);
    const grow = Math.max(0, need - rows.length);
    mutate((p) => {
      const r = calWeeks(p);
      const grown = grow ? withCalWeeks(p, addWeeks(r, grow)) : p;
      return withCompetitions(grown, [...planCompetitions(p), { id: uid('comp'), date, name }]);
    });
    setToast({
      text:
        `🏁 ${name || t('Competition')} · ${formatIso(DATE_FMT, date)}` +
        (grow ? ` · ${fill(t('plan now {n} weeks'), { n: need })}` : ''),
    });
    return null;
  };
  const removeCompetition = (id: string) => mutate((p) => withCompetitions(p, planCompetitions(p).filter((c) => c.id !== id)));
  const goCompetition = (id: string) => {
    const c = competitions.find((x) => x.id === id);
    if (!c) return;
    const w = weekIndexOf(plan, c.date);
    if (w < 0 || w >= rows.length) return;
    setOpen(w);
    window.setTimeout(() => document.getElementById(`cal-week-${w}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  // ── saving (as the old builder) ──
  const saveLocal = (): string => {
    const id = recordId ?? newPlanId();
    upsertPlan({ id, athleteId, plan, updatedAt: '' });
    setRecordId(id);
    setDirty(false);
    setSavedTick(true);
    return id;
  };
  const doSave = () => library.publish(saveLocal(), plan);
  const ensurePublished = async () => {
    const id = saveLocal();
    return (await library.publish(id, plan)) === 'ok' ? id : null;
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (placing) setPlacing(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [placing]);

  // A plan built in the app (an app block, a coach's copy for one athlete):
  // the calendar cannot keep its workouts, loads and tests, so it opens in
  // the block editor instead (saveToLibrary refuses it too).
  const libraryRows = useLibrary().rows;
  const cloudId = recordId ? getCloudPlanLink(recordId)?.cloudPlanId : undefined;
  const appPlan = !!cloudId && isAppPlan(libraryRows[cloudId]?.definition);
  useEffect(() => {
    if (appPlan && cloudId) navigate(`/block/${cloudId}`, { replace: true });
  }, [appPlan, cloudId]);
  if (appPlan && cloudId) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-6">
        <section className="board space-y-3 p-5">
          <p className="font-bold text-amber">{t('Built in the app')}</p>
          <button onClick={() => navigate(`/block/${cloudId}`, { replace: true })} className="pill pill-on btn-raised px-4 py-1.5 text-sm">
            {t('Open in the block editor')}
          </button>
        </section>
      </main>
    );
  }

  const placingName =
    placing?.k === 'template'
      ? templates.items.find((x) => x.id === placing.id)?.name
      : placing?.k === 'week'
        ? weekTemplates.find((x) => x.id === placing.id)?.name
        : undefined;
  const empty = rows.every((r) => r.week.sessions.length === 0);
  const status = (
    <>
      {stats.units} {t(stats.units === 1 ? 'week' : 'weeks')} · {stats.sessions} {t(stats.sessions === 1 ? 'session' : 'sessions')}
      {savedTick && !dirty && (
        <span className="ml-1 text-recover">
          · {t('Saved')} ✓{library.status === 'synced' && ` · ${t('synced to your app')}`}
        </span>
      )}
      {library.status === 'offline' && <span className="ml-1 text-amber">· {t('Not synced yet')}</span>}
      {dirty && <span className="ml-1">· {t('Unsaved changes')}</span>}
    </>
  );

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 px-4 py-4">
      <PlanTopBar
        plan={plan}
        weeks={rows.length}
        status={status}
        onMeta={setMeta}
        competitions={competitions}
        onAddCompetition={addCompetition}
        onRemoveCompetition={removeCompetition}
        onGoCompetition={goCompetition}
        hasPhases={rows.some((r) => r.phase)}
        onSuggestPhases={() => withUndo(t('Phases suggested from Base to Peak'), suggestPhases)}
        onCurve={(k: IntensityPreset) => withUndo(t('Intensity set for every week'), (r) => withIntensityCurve(r, k))}
        onNoPhases={() => withUndo(t('Phases removed'), withoutPhases)}
        athletes={athletes}
        athleteId={athleteId}
        onAthlete={(id) => {
          setAthleteId(id);
          setDirty(true);
          setSavedTick(false);
        }}
        ready={ready}
        issue={issues[0] ?? null}
        onSave={() => void doSave()}
        onDone={() => void doSave().then(() => navigate('/plan'))}
        onDownload={() => {
          void doSave();
          downloadPlanFile(plan);
        }}
        onOldBuilder={() => {
          const id = saveLocal();
          navigate(`/plan/${id}?classic=1`);
        }}
        ensurePublished={ensurePublished}
      />

      {placing && (
        <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm">
          <span>
            {fill(placing.k === 'template' ? t('Placing {name}: click a day.') : t('Placing {name}: click a week.'), {
              name: placingName ?? '',
            })}
          </span>
          <button onClick={() => setPlacing(null)} className="ml-auto text-xs text-textDim hover:text-text">
            {t('Cancel')} (Esc)
          </button>
        </div>
      )}

      <div
        className={`grid items-start gap-3 ${
          at ? 'lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_400px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'
        }`}
      >
        <div className="lg:sticky lg:top-2">
          <PlanRail
            templates={templates.items}
            weekTemplates={weekTemplates}
            placing={placing}
            onPlace={setPlacing}
            sessionOpen={!!at}
            onExercise={(d) => at && addExercise(at.session.id, d)}
            online={online}
          />
        </div>
        <div className="min-w-0 space-y-2">
          {empty && (
            <p className="rounded-lg border border-modePool/40 bg-modePool/10 px-3 py-1.5 text-sm">
              {t('Click + on a day to write a session, or drag a template from the library. Name the plan and add competitions in the top bar whenever you like.')}
            </p>
          )}
          <div className="overflow-x-auto pb-1">
            <CalendarGrid
              plan={plan}
              rows={rows}
              open={open}
              selected={selected}
              today={today}
              competitions={competitions}
              placing={!!placing}
              menuWeek={menu?.week ?? null}
              onToggle={(w) => setOpen((o) => (o === w ? -1 : w))}
              onAdd={(w, d) => addAt(w, newSession(d, plan.mode))}
              onOpenSession={openSession}
              onPlace={onPlace}
              onDrop={onDrop}
              onDropExercise={addExercise}
              onWeekMenu={(week, anchor) => setMenu((m) => (m?.week === week ? null : { week, anchor }))}
              onWeek={(w, patch) => mutateRows((r) => updateWeek(r, w, patch))}
              onPhase={onPhase}
              onAddWeeks={(n) => mutateRows((r) => addWeeks(r, n))}
            />
          </div>
        </div>
        {at && (
          <div className="lg:col-span-2 xl:sticky xl:top-2 xl:col-span-1 xl:max-h-[calc(100vh-1rem)] xl:overflow-y-auto">
            <SessionPanel
              plan={plan}
              rows={rows}
              week={at.week}
              session={at.session}
              today={today}
              onChange={(patch) => mutateRows((r) => patchSession(r, at.session.id, patch))}
              onClose={closePanel}
              onDelete={() => {
                const id = at.session.id;
                setSelected(null);
                withUndo(fill(t('{name} deleted'), { name: at.session.label.trim() || t('Untitled session') }), (r) => removeSession(r, id));
              }}
              onDay={(d) => mutateRows((r) => moveSession(r, at.session.id, at.week, d))}
              onCopyToWeeks={(weeks) =>
                withUndo(
                  fill(t('Copied to {day} in {n} weeks'), { day: t(DAY_LABELS[at.session.dayOfWeek]), n: weeks.length }),
                  (r) => copyToWeeks(r, at.session.id, weeks),
                )
              }
            />
          </div>
        )}
      </div>

      {menu && (
        <WeekMenu anchor={menu.anchor} onClose={() => setMenu(null)} actions={weekActions(menu.week)} />
      )}
      {library.dialogs}
      <Toast msg={toast} onClose={closeToast} />
    </main>
  );
}
