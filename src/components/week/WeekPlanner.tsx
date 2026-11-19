/**
 * Plan a week for one athlete, on their page (option 2A of the app repo's
 * docs/mockups/week-plan-and-portal.html, Philipp 2026-11-19): the same week
 * as the phone app's Coaching > Athletes > Plan a week. Each day shows what
 * the athlete's regular plans ask (dim PLAN rows), what was sent, and the
 * unsent draft; "+ Add" opens the session editor, where a session can start
 * from a template. The draft is saved with the coach's account, so a week
 * started on the phone can be finished here and the other way round. Nothing
 * reaches the athlete until "Send week".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fill, useT } from '../../i18n';
import { todayIso, type BuilderSession } from '../../lib/e08plan';
import { builderToDraft, draftToBuilder } from '../../lib/weekSession';
import { sessionFromTemplate } from '../../lib/coachTemplates/planInsert';
import { missingTargets, pbMapFrom, resolveTemplate } from '../../lib/coachTemplates/resolve';
import type { CoachTemplate } from '../../lib/coachTemplates/model';
import { modeOfType } from '../../lib/coachTemplates/portal';
import { templateTr } from '../../lib/coachTemplates/tr';
import {
  addSessionItem,
  buildWeekDelivery,
  copyLastWeek,
  editSentItem,
  fillItemFromTemplate,
  isEmptySession,
  itemsInWeek,
  moveItem,
  planInWeek,
  removeItem,
  sentInWeek,
  setItemSession,
  shiftWeeks,
  weekDays,
  weekNumber,
  type SentSession,
  type WeekDraftItem,
} from '../../lib/coachTemplates/week';
import { useAuth } from '../../lib/supabase/AuthProvider';
import type { AthletePB } from '../../lib/supabase/athleteProfileCloud';
import { useSharedTemplates } from '../../lib/supabase/templateLibrary';
import {
  loadAthleteWeek,
  removeSentSession,
  sendWeek,
  setWeekDraft,
  syncWeekDrafts,
  useDraftSyncState,
  useWeekDraft,
  weekDraftOf,
  type AthleteWeekData,
} from '../../lib/supabase/weekCloud';
import { SessionEditor } from '../sessions';
import { TemplatePicker } from '../TemplatePicker';

const TAG: Record<string, string> = {
  depth: 'bg-accent/20 text-accent',
  pool: 'bg-highlight/20 text-highlight',
  dry: 'bg-recover/20 text-recover',
  general: 'bg-amber/20 text-amber',
};
const MODE_LABEL: Record<string, string> = {
  depth: 'Depth',
  pool: 'Pool',
  dry: 'Dry',
  general: 'General',
};

const dayHead = (iso: string, lang?: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return {
    wd: d.toLocaleDateString(lang, { weekday: 'short' }).toUpperCase(),
    n: d.getDate(),
    long: d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' }),
  };
};

export function WeekPlanner({
  studentId,
  name,
  pbs,
}: {
  studentId: string;
  name: string;
  pbs: AthletePB[];
}) {
  const t = useT();
  const { profile } = useAuth();
  const coachName = profile?.display_name ?? '';
  const items = useWeekDraft(studentId);
  const syncState = useDraftSyncState();
  const templates = useSharedTemplates().map((x) => x.template);
  const pbMap = useMemo(() => pbMapFrom(pbs), [pbs]);
  const today = todayIso();
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<AthleteWeekData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [openSent, setOpenSent] = useState<SentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const reload = useCallback(() => {
    loadAthleteWeek(studentId)
      .then(setData)
      .catch((e: unknown) => setMsg({ text: e instanceof Error ? e.message : String(e), ok: false }));
  }, [studentId]);
  useEffect(() => {
    reload();
    void syncWeekDrafts();
  }, [reload]);
  // A session opened and never written (the tab was closed on it) is not
  // part of the week.
  useEffect(() => {
    const cur = weekDraftOf(studentId);
    const kept = cur.filter((i) => !i.session || !isEmptySession(i.session));
    if (kept.length !== cur.length) setWeekDraft(studentId, kept);
  }, [studentId]);

  const days = weekDays(anchor, 1);
  const prevDays = weekDays(shiftWeeks(anchor, -1), 1);
  const completions = data?.completions ?? [];
  const sent = sentInWeek(data?.inbox ?? null, days, completions);
  const prevSent = sentInWeek(data?.inbox ?? null, prevDays, completions);
  const planned = planInWeek(data?.plans ?? [], days, completions);
  const weekItems = itemsInWeek(items, days);
  const replaced = new Set(items.map((i) => i.replaces).filter(Boolean));
  const sendable = weekItems.filter((i) => !i.session || !isEmptySession(i.session)).length;
  const update = (fn: (xs: WeekDraftItem[]) => WeekDraftItem[]) =>
    setWeekDraft(studentId, fn(weekDraftOf(studentId)));

  const add = (date: string) => {
    const added = addSessionItem(items, date);
    if (!added) return setMsg({ text: t('That day is full.'), ok: false });
    setMsg(null);
    setWeekDraft(studentId, added.items);
    setEditing(added.id);
  };

  const copy = () => {
    if (!prevSent.length) return setMsg({ text: t('Nothing was sent the week before.'), ok: false });
    const res = copyLastWeek({ previous: prevSent, current: sent, draft: items, templates, today });
    setWeekDraft(studentId, res.items);
    setMsg(
      res.copied
        ? { text: fill(t('Copied {n} session(s) from the week before.'), { n: res.copied }), ok: true }
        : { text: t('Nothing to copy: those sessions are on past days or already planned.'), ok: false },
    );
  };

  const send = async () => {
    const delivery = buildWeekDelivery(weekItems, templates, pbMap, {
      imperial: false,
      author: coachName,
      t: templateTr(),
    });
    if (delivery.blocked.length) {
      return setMsg({
        text: t('A session placed on the phone still needs a value or its template. Open it on the phone, or remove it.'),
        ok: false,
      });
    }
    if (!delivery.deliveries.length) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendWeek({ studentId, delivery, coachName, t: templateTr() });
      const gone = new Set(delivery.itemIds);
      update((xs) => xs.filter((x) => !gone.has(x.id)));
      setMsg({ text: fill(t('Sent {n} session(s) to {name}.'), { n: delivery.deliveries.length, name }), ok: true });
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const changeSent = (x: SentSession) => {
    const res = editSentItem(items, x);
    setWeekDraft(studentId, res.items);
    setOpenSent(null);
    setEditing(res.id);
  };
  const removeSent = async (x: SentSession) => {
    if (!confirm(fill(t('Remove this session from {name}’s week? It disappears from their plan.'), { name })))
      return;
    setOpenSent(null);
    try {
      await removeSentSession(studentId, x.session.id);
      update((xs) => xs.filter((i) => i.replaces !== x.session.id));
      reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    }
  };

  // "16 - 22 Nov", or both months where the week crosses one.
  const dm = (iso: string, month: boolean) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, month ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  const range = `${dm(days[0], days[0].slice(0, 7) !== days[6].slice(0, 7))} - ${dm(days[6], true)}`;
  const tag = (mode: string | undefined) => (
    <span className={`rounded px-1 text-[9px] font-extrabold uppercase tracking-wide ${TAG[mode ?? 'general'] ?? TAG.general}`}>
      {t(MODE_LABEL[mode ?? 'general'] ?? 'General')}
    </span>
  );
  const row = 'flex w-full flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-[11px]';
  const editingItem = items.find((i) => i.id === editing);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading tracking-wide text-text">{t('PLAN A WEEK')}</h3>
        <span className="text-sm text-textDim">
          {fill(t('Week {n}'), { n: weekNumber(days) })} · {range}
        </span>
        <button onClick={() => setAnchor(shiftWeeks(anchor, -1))} className="pill px-2 py-0.5 text-sm" aria-label={t('Previous week')}>‹</button>
        <button onClick={() => setAnchor(shiftWeeks(anchor, 1))} className="pill px-2 py-0.5 text-sm" aria-label={t('Next week')}>›</button>
        {!days.includes(today) && (
          <button onClick={() => setAnchor(today)} className="text-xs text-accent hover:underline">
            {t('Back to this week')}
          </button>
        )}
        <span className="flex-1" />
        {weekItems.length > 0 && (
          <span className={`pill px-3 py-0.5 text-xs ${syncState === 'offline' ? 'text-amber' : 'text-recover'}`}>
            {syncState === 'offline'
              ? t('Draft not saved to your account yet')
              : syncState === 'saved'
                ? t('Draft saved to your account')
                : t('Saving…')}
            {' · '}
            {fill(t('{n} new'), { n: sendable })}
          </span>
        )}
        <button onClick={copy} className="pill px-3 py-1 text-sm">{t('Copy last week')}</button>
        <button
          onClick={send}
          disabled={!sendable || busy}
          className="pill pill-on btn-raised px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? t('Sending…') : fill(t('Send week to {name}'), { name })}
        </button>
      </div>
      <p className="rounded-lg border border-border bg-abyss px-3 py-2 text-sm text-textDim">
        <span className="mr-1.5 font-extrabold text-accent">i</span>
        {t('Adds sessions to an athlete’s week. Use it alongside an existing plan or on its own.')}
      </p>
      {msg && <p className={`text-sm ${msg.ok ? 'text-recover' : 'text-amber'}`}>{msg.text}</p>}

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 gap-1.5">
          {days.map((d) => {
            const h = dayHead(d);
            const past = d < today;
            return (
              <div key={d} className={`flex min-h-36 min-w-0 flex-col gap-1 rounded-lg border border-border bg-abyss p-1.5 ${past ? 'opacity-60' : ''}`}>
                <div className={`text-[11px] font-extrabold ${d === today ? 'text-accent' : 'text-textDim'}`}>
                  {h.wd} <span className="text-[13px] text-text">{h.n}</span>
                </div>
                {planned.filter((x) => x.date === d).map((x) => (
                  <div key={`${x.planId}-${x.session.id}`} className={`${row} border-border/60 text-textDim`} title={x.planName}>
                    <span className="rounded bg-textDim/20 px-1 text-[9px] font-extrabold uppercase tracking-wide">{t('Plan')}</span>
                    <span className="order-last line-clamp-2 basis-full break-words">{x.session.label || x.planName}</span>
                    {x.done && <span className="ml-auto text-recover">✓</span>}
                  </div>
                ))}
                {sent.filter((x) => x.date === d && !replaced.has(x.session.id)).map((x) => (
                  <button key={x.session.id} onClick={() => setOpenSent(x)} className={`${row} border-border bg-panel hover:border-accent`}>
                    {tag(x.session.mode)}
                    <span className="order-last line-clamp-2 basis-full break-words text-text">{x.session.label || '?'}</span>
                    <span className={`ml-auto ${x.done ? 'text-recover' : 'text-textDim'}`}>{x.done ? '✓' : t('sent')}</span>
                  </button>
                ))}
                {weekItems.filter((i) => i.date === d).map((i) => (
                  <button key={i.id} onClick={() => setEditing(i.id)} className={`${row} border-dashed border-accent bg-panel`}>
                    {tag(i.session?.mode)}
                    <span className="order-last line-clamp-2 basis-full break-words text-text">
                      {i.session ? i.session.label.trim() || t('Untitled session') : (templates.find((x) => x.id === i.templateId)?.name ?? '?')}
                    </span>
                    <span className="ml-auto text-accent">{i.replaces ? t('changed') : t('new')}</span>
                  </button>
                ))}
                {!past && (
                  <button onClick={() => add(d)} className="mt-auto rounded-lg border border-dashed border-border py-1 text-[11px] font-extrabold text-accent hover:border-accent">
                    {t('+ Add')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingItem && (
        <WeekSessionDialog
          key={editingItem.id}
          item={editingItem}
          days={days}
          today={today}
          templates={templates}
          resolveFor={(tpl) => resolveTemplate(tpl, pbMap)}
          coachName={coachName}
          athleteName={name}
          update={update}
          onClose={() => {
            const cur = weekDraftOf(studentId).find((i) => i.id === editingItem.id);
            // Opened and left empty: the week stays as it was.
            if (cur?.session && isEmptySession(cur.session)) update((xs) => removeItem(xs, cur.id));
            setEditing(null);
          }}
        />
      )}

      {openSent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setOpenSent(null)}>
          <div role="dialog" aria-modal="true" className="board max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 font-heading text-base text-text">{openSent.session.label || '?'}</h3>
              <button onClick={() => setOpenSent(null)} className="px-1 text-textDim hover:text-text" aria-label={t('Close')}>✕</button>
            </div>
            <p className="text-xs text-textDim">
              {dayHead(openSent.date).long} · {openSent.done ? t('reported') : t('sent')}
            </p>
            <ul className="space-y-1 text-sm">
              {openSent.session.exercises.map((e) => (
                <li key={e.id}>{e.description}</li>
              ))}
            </ul>
            {openSent.session.sessionNotes && <p className="text-sm text-textDim">{openSent.session.sessionNotes}</p>}
            {openSent.done ? (
              <p className="text-xs italic text-textDim">
                {t('Reported: it stays as it is, so the report stays attached to it.')}
              </p>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => removeSent(openSent)} className="pill px-3 py-1.5 text-sm text-red">{t('Remove')}</button>
                <button onClick={() => changeSent(openSent)} className="pill pill-on btn-raised px-3 py-1.5 text-sm">{t('Change this session')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The session editor for one draft item, in a dialog: the plan builder's
 *  editor, with the day and "start from a template" above it. */
function WeekSessionDialog({
  item,
  days,
  today,
  templates,
  resolveFor,
  coachName,
  athleteName,
  update,
  onClose,
}: {
  item: WeekDraftItem;
  days: string[];
  today: string;
  templates: CoachTemplate[];
  resolveFor: (tpl: CoachTemplate) => ReturnType<typeof resolveTemplate>;
  coachName: string;
  athleteName: string;
  update: (fn: (xs: WeekDraftItem[]) => WeekDraftItem[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  // The editor's own copy: it keeps what the stored session cannot (a dose
  // as chips), and every change is written through to the draft.
  const [b, setB] = useState<BuilderSession | null>(() => (item.session ? draftToBuilder(item.session) : null));

  // A template swaps the whole session: the editor starts over on it, and
  // only then (typing must never remount it and drop the cursor).
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const change = (patch: Partial<BuilderSession>) => {
    if (!b || !item.session) return;
    const next = { ...b, ...patch };
    setB(next);
    update((xs) => setItemSession(xs, item.id, (s) => builderToDraft(next, s)));
  };

  const useTemplate = (tpl: CoachTemplate) => {
    const overrides: Record<string, number> = {};
    for (const m of missingTargets(resolveFor(tpl))) {
      const raw = prompt(
        fill(
          m.unit === 's'
            ? t('No PB for {discipline}: seconds for this athlete')
            : t('No PB for {discipline}: metres for this athlete'),
          { discipline: m.discipline },
        ),
      );
      const v = raw === null ? NaN : Number(raw.replace(',', '.'));
      if (!(v > 0)) return;
      overrides[m.blockId] = v;
    }
    const resolved = resolveFor(tpl).map((r) =>
      overrides[r.blockId] ? { ...r, value: overrides[r.blockId], manual: true } : r,
    );
    const built = sessionFromTemplate(tpl, resolved, 0, {
      imperial: false,
      author: coachName,
      t: templateTr(),
    });
    if (!built) return;
    update((xs) => fillItemFromTemplate(xs, item.id, tpl, built));
    setB(draftToBuilder({ ...built, id: item.session?.id ?? built.id }));
    setFilled((n) => n + 1);
  };

  if (!b || !item.session) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('Session')} className="board my-6 w-full max-w-2xl space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base text-text">{fill(t('Session for {name}'), { name: athleteName })}</h3>
          <select
            className="field w-auto px-2 py-1 text-sm"
            value={item.date}
            onChange={(e) => update((xs) => moveItem(xs, item.id, e.target.value))}
            aria-label={t('Day')}
          >
            {days.map((d) => (
              <option key={d} value={d} disabled={d < today && d !== item.date}>
                {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <TemplatePicker
            triggerLabel={t('Start from a template')}
            title={t('Session templates')}
            items={templates.map((x) => ({
              id: x.id,
              name: x.name,
              mode: modeOfType(x.type),
              sub: x.sessionType,
              count: x.blocks.length,
              useCount: x.useCount,
            }))}
            onPick={(id) => {
              const tpl = templates.find((x) => x.id === id);
              if (tpl) useTemplate(tpl);
            }}
          />
        </div>
        {templates.length > 0 && !isEmptySession(item.session) && (
          <p className="text-xs text-textDim">{t('A template replaces what is written here.')}</p>
        )}
        <SessionEditor
          key={filled}
          session={b}
          onChange={change}
          onClose={onClose}
          onDelete={() => {
            update((xs) => removeItem(xs, item.id));
            onClose();
          }}
        />
      </div>
    </div>
  );
}
