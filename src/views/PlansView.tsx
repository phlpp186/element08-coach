/**
 * PlansView — the Library: the coach's plans and templates, the same list the
 * app's coach hub shows (lib/supabase/planLibrary.ts). Each plan says who has
 * it and where and when it was last saved; a plan whose save hasn't reached
 * the library yet, or that changed elsewhere at the same time, says so.
 * On top, four tiles (plans, assigned, not assigned, needing a sync choice)
 * and filters; each row carries the plan's week strip, and a click opens its
 * detail panel (who has it, where it stands, edit/assign/duplicate).
 * New plans and editing one open the builder at /plan/new and /plan/:id.
 * App templates are made in the app; they are listed here read-only. (The
 * builder's own session/week templates are a different thing and live under
 * Exercises as Builder templates.)
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { upsertPlan, useAthletes, useSavedPlans, newPlanId } from '../lib/store';
import { copyPlan, downloadPlanFile, todayIso } from '../lib/e08plan';
import { PlanSpan } from '../components/PlanSpan';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';
import { useCoachAssignments } from '../lib/supabase/useCoachAssignments';
import { useAuth } from '../lib/supabase/AuthProvider';
import { deleteFromLibrary, saveToLibrary, useLibrary } from '../lib/supabase/planLibrary';
import { matchesLibrary, planNow, weekStrip, type AssignFilter, type KindFilter } from '../lib/libraryInsights';
import { WeekStrip } from '../components/library/WeekStrip';
import { PlanDetail } from '../components/library/PlanDetail';
import { stampOf, type LibraryDevice } from '../lib/planLibrary';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';

const DEVICE_LABEL: Record<LibraryDevice, string> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  web: 'Web',
};
const DEVICE_CLASS: Record<LibraryDevice, string> = {
  iphone: 'bg-accent/15 text-accent',
  ipad: 'bg-accent/15 text-accent',
  android: 'bg-recover/15 text-recover',
  web: 'bg-amber/15 text-amber',
};

/** "just now", "12 min ago", "3 h ago", "yesterday 21:10", or the date. */
export function editedAgo(iso: string, t: (s: string) => string, now = Date.now()): string {
  const at = new Date(iso);
  const min = Math.round((now - at.getTime()) / 60000);
  if (min < 2) return t('just now');
  if (min < 60) return fill(t('{n} min ago'), { n: min });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(at)) / 86400000);
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return fill(t('{n} h ago'), { n: Math.max(1, Math.round(min / 60)) });
  if (days === 1) return fill(t('yesterday {time}'), { time });
  return at.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function DeviceChip({ device }: { device: LibraryDevice }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-heading ${DEVICE_CLASS[device]}`}>
      {DEVICE_LABEL[device]}
    </span>
  );
}

export function PlansView() {
  const t = useT();
  const plans = useSavedPlans();
  const athletes = useAthletes();
  const { session, isCoach } = useAuth();
  const lib = useLibrary();
  const { namesByCloudPlanId, byCloudPlanId } = useCoachAssignments();
  const [tab, setTab] = useState<'plans' | 'templates'>('plans');
  const [kind, setKind] = useState<KindFilter>('all');
  const [assign, setAssign] = useState<AssignFilter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const online = !!session && isCoach;
  const today = todayIso();

  const rowsFor = useMemo(
    () =>
      plans
        .map((sp) => {
          const cloudId = getCloudPlanLink(sp.id)?.cloudPlanId;
          const row = cloudId ? lib.rows[cloudId] : undefined;
          const stamp = row ? stampOf(row.definition) : null;
          const pending = online && (lib.pending.includes(sp.id) || !row);
          return {
            sp,
            cloudId,
            device: (pending ? 'web' : (stamp?.editedOn ?? null)) as LibraryDevice | null,
            at: pending ? sp.updatedAt : (stamp?.editedAt ?? row?.updated_at ?? sp.updatedAt),
            pending,
            conflict: !!lib.conflicts[sp.id],
          };
        })
        .sort(
          (a, b) => Number(b.conflict) - Number(a.conflict) || (b.at ?? '').localeCompare(a.at ?? ''),
        ),
    [plans, lib, online],
  );

  const nameFor = (id: string | null) =>
    (id && athletes.find((a) => a.id === id)?.name?.trim()) || null;

  const remove = (id: string, assigned: number) => {
    const msg = assigned
      ? t('Delete this plan from your library? Athletes who have it keep their copy.')
      : t('Delete this plan from your library?');
    if (!confirm(msg)) return;
    void deleteFromLibrary(id);
    if (openId === id) setOpenId(null);
  };

  /** A copy with fresh ids, opened in the panel and sent to the library. */
  const duplicate = (id: string) => {
    const sp = plans.find((p) => p.id === id);
    if (!sp) return;
    const name = fill(t('{name} (copy)'), { name: sp.plan.name?.trim() || t('Untitled plan') });
    const rec = upsertPlan({ id: newPlanId(), athleteId: null, plan: copyPlan(sp.plan, name), updatedAt: '' });
    setOpenId(rec.id);
    if (online) void saveToLibrary(rec.id, rec.plan);
  };

  const rows = rowsFor.map((r) => {
    const assigned = r.cloudId ? (namesByCloudPlanId.get(r.cloudId) ?? []) : [];
    return { ...r, assigned, local: nameFor(r.sp.athleteId) };
  });
  const like = (r: (typeof rows)[number]) => ({
    name: r.sp.plan.name ?? '',
    kind: r.sp.plan.kind === 'season' ? ('season' as const) : ('training' as const),
    assigned: r.assigned.length + (r.local ? 1 : 0),
    conflict: r.conflict,
  });
  const byKind = rows.filter((r) => matchesLibrary(like(r), kind, 'all', search));
  const shown = byKind.filter((r) => matchesLibrary(like(r), 'all', assign, ''));
  const open = openId ? rows.find((r) => r.sp.id === openId) ?? null : null;
  const conflicts = rows.filter((r) => r.conflict).length;
  const assignedN = byKind.filter((r) => like(r).assigned > 0).length;

  const status =
    !online
      ? t('Sign in to share your library with the app.')
      : lib.status === 'syncing'
        ? t('Syncing…')
        : lib.status === 'offline'
          ? t('Offline: saves wait here and sync when you are back online.')
          : lib.lastSyncAt
            ? `${t('Synced with your app')} · ${editedAgo(lib.lastSyncAt, t)}`
            : t('Synced with your app');

  const tabBtn = (id: 'plans' | 'templates', label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`pill px-4 py-1.5 text-sm ${tab === id ? 'pill-on' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">{t('Library')}</h2>
          <p className="flex items-center gap-1.5 text-sm text-textDim">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                !online || lib.status === 'offline' ? 'bg-amber' : 'bg-recover'
              }`}
            />
            {status}
          </p>
        </div>
        {tab === 'plans' && (
          <button
            onClick={() => navigate('/plan/new')}
            className="pill pill-on btn-raised text-sm px-3 py-1.5"
          >
            + {t('New plan')}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {tabBtn('plans', `${t('Plans')} · ${plans.length}`)}
        {online && tabBtn('templates', `${t('App templates')} · ${lib.templates.length}`)}
      </div>

      {tab === 'templates' ? (
        <TemplatesList />
      ) : rowsFor.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
          <p className="mb-3">{t('No saved plans yet.')}</p>
          <button onClick={() => navigate('/plan/new')} className="text-accent hover:underline">
            {t('Build your first plan')}
          </button>
        </div>
      ) : (
        <div className={`gap-4 ${open ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start' : ''}`}>
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(
                [
                  { id: 'all', n: byKind.length, label: t('Plans'), tone: 'var(--c-highlight)' },
                  { id: 'assigned', n: assignedN, label: t('Assigned'), tone: 'var(--c-recover)' },
                  { id: 'unassigned', n: byKind.length - assignedN, label: t('Not assigned'), tone: 'var(--c-amber)' },
                  ...(online
                    ? [{ id: 'sync', n: conflicts, label: t('Need a sync choice'), tone: conflicts ? 'var(--c-red)' : 'var(--c-textDim)' }]
                    : []),
                ] as { id: AssignFilter; n: number; label: string; tone: string }[]
              ).map((x) => (
                <button
                  key={x.id}
                  onClick={() => setAssign(assign === x.id ? 'all' : x.id)}
                  aria-pressed={assign === x.id}
                  className={`tile px-3 py-2 text-left ${assign === x.id && x.id !== 'all' ? 'ring-2 ring-text/60' : ''}`}
                  style={{ '--tone': `rgb(${x.tone})` } as CSSProperties}
                >
                  <span className="tile-value block font-num text-xl font-bold leading-tight">{x.n}</span>
                  <span className="tile-label block text-xs font-bold">{x.label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'training', 'season'] as KindFilter[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`pill px-3 py-1 text-xs ${kind === k ? 'pill-on' : ''}`}
                >
                  {k === 'all' ? t('All') : k === 'season' ? t('Season') : t('Training')}
                </button>
              ))}
              <input
                className="field h-8 w-auto min-w-40 flex-1 py-1 text-sm"
                placeholder={t('Search plans')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
                {t('No plans match.')}{' '}
                <button
                  onClick={() => {
                    setKind('all');
                    setAssign('all');
                    setSearch('');
                  }}
                  className="text-accent hover:underline"
                >
                  {t('Show all')}
                </button>
              </p>
            ) : (
              <div className="space-y-2">
                {shown.map(({ sp, device, at, pending, conflict, assigned, local }) => {
                  const now = planNow(sp.plan, today);
                  const isOpen = openId === sp.id;
                  return (
                    <div
                      key={sp.id}
                      className={`rounded-lg border bg-panel ${isOpen ? 'border-accent' : conflict ? 'border-red/60' : 'border-border'}`}
                    >
                      <button
                        onClick={() => setOpenId(isOpen ? null : sp.id)}
                        aria-expanded={isOpen}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left sm:grid-cols-[minmax(0,1.6fr)_8rem_minmax(0,1fr)_auto]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-heading text-text">
                            {sp.plan.name?.trim() || t('Untitled plan')}
                          </span>
                          <span className="block truncate text-xs text-textDim">
                            {sp.plan.kind === 'season' ? t('Season') : t('Training')} · <PlanSpan plan={sp.plan} />
                          </span>
                        </span>
                        <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                          <WeekStrip
                            weeks={weekStrip(sp.plan)}
                            current={now.state === 'running' && now.unit === 'week' ? now.index : null}
                          />
                        </span>
                        <span className="hidden min-w-0 truncate text-sm sm:block">
                          {assigned.length > 0 ? (
                            assigned.join(', ')
                          ) : local ? (
                            local
                          ) : (
                            <span className="text-textDim">{t('not assigned')}</span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                          {conflict ? (
                            <span className="font-heading text-red">{t('Changed on another device')}</span>
                          ) : pending ? (
                            <span className="font-heading text-amber">{t('Not synced yet')}</span>
                          ) : (
                            <>
                              {device && <DeviceChip device={device} />}
                              <span className="text-textDim">{at ? editedAgo(at, t) : ''}</span>
                            </>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {open && (
            <PlanDetail
              key={open.sp.id}
              sp={open.sp}
              todayIso={today}
              assignments={open.cloudId ? (byCloudPlanId.get(open.cloudId) ?? []) : []}
              localAthlete={open.local}
              edited={
                <>
                  {open.device && <DeviceChip device={open.device} />}
                  <span>{open.at ? editedAgo(open.at, t) : ''}</span>
                </>
              }
              pending={open.pending}
              conflict={open.conflict}
              online={online}
              onClose={() => setOpenId(null)}
              onDuplicate={() => duplicate(open.sp.id)}
              onDownload={() => downloadPlanFile(open.sp.plan)}
              onDelete={() => remove(open.sp.id, open.assigned.length)}
              ensurePublished={async () => {
                // Already in the library: assigning must not push a new
                // version to the athletes who have it.
                if (getCloudPlanLink(open.sp.id) && !open.pending) return open.sp.id;
                const r = await saveToLibrary(open.sp.id, open.sp.plan);
                return r.ok ? open.sp.id : null;
              }}
            />
          )}
        </div>
      )}
      <p className="text-sm text-textDim">
        {t('Plans made here or in the app show up in both. Assigned plans show who has them.')}
      </p>
    </main>
  );
}

const TPL_TYPE: Record<string, string> = {
  dry: 'Dry',
  depth: 'Depth',
  pool: 'Pool',
  fitness: 'Fitness',
};

function TemplatesList() {
  const t = useT();
  const { templates } = useLibrary();
  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
        {t('No app templates yet. Make one in the app: Coaching › Templates.')}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-textDim">
        {t('App templates are the dry and session programmes you make in the app (Coaching › Templates) and send to athletes. They are listed here so you can see them; edit them in the app. Not the same as Builder templates under Exercises, which you reuse while building plans.')}
      </p>
      <div className="board">
        {templates.map((r) => {
          const tpl = (r.definition as { template?: Record<string, unknown> }).template ?? {};
          const blocks = Array.isArray(tpl.blocks) ? (tpl.blocks as { name?: string }[]) : [];
          const used = typeof tpl.useCount === 'number' ? tpl.useCount : 0;
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="font-heading">{String(tpl.name ?? r.title)}</span>
                <span className="block truncate text-xs text-textDim">
                  {blocks.map((b) => b.name).filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-textDim">{t(TPL_TYPE[String(tpl.type)] ?? 'Template')}</span>
              <span className="text-textDim">
                {used > 0 ? fill(t('used {n}×'), { n: used }) : t('not sent yet')}
              </span>
              <span className="text-textDim">{editedAgo(r.updated_at, t)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
