/**
 * PlansView — the Library: the coach's plans and templates, the same list the
 * app's coach hub shows (lib/supabase/planLibrary.ts). Each plan says who has
 * it and where and when it was last saved; a plan whose save hasn't reached
 * the library yet, or that changed elsewhere at the same time, says so.
 * New plans and editing one open the builder at /plan/new and /plan/:id.
 * Templates are made in the app for now; they are listed here read-only.
 */
import { useMemo, useState } from 'react';
import { useAthletes, useSavedPlans } from '../lib/store';
import { downloadPlanFile } from '../lib/e08plan';
import { PlanSpan } from '../components/PlanSpan';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';
import { useCoachAssignments } from '../lib/supabase/useCoachAssignments';
import { useAuth } from '../lib/supabase/AuthProvider';
import { deleteFromLibrary, useLibrary } from '../lib/supabase/planLibrary';
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
  const { namesByCloudPlanId } = useCoachAssignments();
  const [tab, setTab] = useState<'plans' | 'templates'>('plans');
  const online = !!session && isCoach;

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
    if (confirm(msg)) void deleteFromLibrary(id);
  };

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
      className={`rounded-lg border border-border px-4 py-1.5 text-sm font-heading ${
        tab === id ? 'bg-text text-deep' : 'text-text hover:bg-panel'
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-5">
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
            className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide"
          >
            + {t('New plan')}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {tabBtn('plans', `${t('Plans')} · ${plans.length}`)}
        {online && tabBtn('templates', `${t('Templates')} · ${lib.templates.length}`)}
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
        <div className="overflow-x-auto rounded-xl border border-border bg-panel">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[minmax(0,2fr)_84px_minmax(0,1.1fr)_minmax(0,1.4fr)_112px] gap-3 border-b border-border px-4 py-2.5 text-xs font-heading tracking-wider text-textDim">
              <span>{t('NAME')}</span>
              <span>{t('TYPE')}</span>
              <span>{t('ASSIGNED TO')}</span>
              <span>{t('LAST EDITED')}</span>
              <span />
            </div>
            {rowsFor.map(({ sp, cloudId, device, at, pending, conflict }) => {
              const assigned = cloudId ? (namesByCloudPlanId.get(cloudId) ?? []) : [];
              const local = nameFor(sp.athleteId);
              return (
                <div
                  key={sp.id}
                  className="grid grid-cols-[minmax(0,2fr)_84px_minmax(0,1.1fr)_minmax(0,1.4fr)_112px] items-center gap-3 border-b border-border/60 px-4 py-3 text-sm last:border-b-0"
                >
                  <button onClick={() => navigate(`/plan/${sp.id}`)} className="min-w-0 text-left">
                    <div className="truncate font-heading text-text">
                      {sp.plan.name?.trim() || t('Untitled plan')}
                    </div>
                    <div className="truncate text-xs text-textDim">
                      <PlanSpan plan={sp.plan} />
                    </div>
                  </button>
                  <span>{sp.plan.kind === 'season' ? t('Season') : t('Training')}</span>
                  <span className="truncate">
                    {assigned.length > 0
                      ? assigned.join(', ')
                      : local
                        ? local
                        : <span className="text-textDim">{t('not assigned')}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {device && <DeviceChip device={device} />}
                    <span className="text-textDim">{at ? editedAgo(at, t) : ''}</span>
                    {conflict ? (
                      <span className="text-xs font-heading text-red">
                        {t('Changed on another device')}
                      </span>
                    ) : (
                      pending && (
                        <span className="text-xs font-heading text-amber">{t('Not synced yet')}</span>
                      )
                    )}
                  </span>
                  <span className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => navigate(`/plan/${sp.id}`)}
                      className="font-heading text-accent hover:underline"
                    >
                      {conflict ? t('Choose version') : t('Edit')}
                    </button>
                    <button
                      onClick={() => downloadPlanFile(sp.plan)}
                      className="text-textDim hover:text-accent"
                      title={t('Download')}
                    >
                      ⤓
                    </button>
                    <button
                      onClick={() => remove(sp.id, assigned.length)}
                      className="text-red"
                      title={t('Delete plan')}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
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
        {t('No templates yet. Make one in the app: Coaching › Templates.')}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-textDim">
        {t('Templates are made and sent in the app. They are listed here so you can see them.')}
      </p>
      <div className="rounded-xl border border-border bg-panel">
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
