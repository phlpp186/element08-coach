/**
 * ActivityView: every athlete's finished and edited sessions in one feed,
 * newest first and grouped by day, beside a "Needs a look" list (pure rules in
 * lib/activity) and a this-week summary. On top, a digest of what is new (PBs,
 * remarks, hard sessions) and filter chips; each card carries a small picture
 * of the session and its own "Mark seen" (lib/activityDigest). The bell's "See
 * all" lands here; both share one seen state, so marking here clears the bell.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useActivity } from '../lib/supabase/useActivity';
import { isNewFor, markAllSeen, markSeen, useSeenState, type SeenState } from '../lib/completionsSeen';
import { groupByDay, relTime, type AthleteFlags, type FeedEntry, type WeekSummary } from '../lib/activity';
import {
  buildDigest,
  hasRemark,
  isHard,
  matchesFilter,
  sessionBars,
  sessionPBs,
  type FeedFilter,
  type SessionBars,
  type SessionBest,
} from '../lib/activityDigest';
import { formatPB, type AthletePB } from '../lib/supabase/athleteProfileCloud';
import { sessionChips, sessionNoteLines } from '../lib/sessionNotes';

const NOTE_LINES = 3;

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function dayHeading(day: string, rel: 'today' | 'yesterday' | null, t: (s: string) => string): string {
  if (rel === 'today') return t('Today');
  if (rel === 'yesterday') return t('Yesterday');
  // A local calendar day; noon keeps any zone from tipping it over midnight.
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function ActivityView() {
  const t = useT();
  const { session, isCoach } = useAuth();
  const data = useActivity();
  const seen = useSeenState();

  if (!session || !isCoach) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim">{t('Sign in to view your connected athletes.')}</p>
      </main>
    );
  }
  return <ActivityBody {...data} seen={seen} />;
}

/** The page itself, from already-loaded data (also driven by a dev preview). */
export function ActivityBody({
  feed,
  flags,
  week,
  remarked,
  today,
  athleteCount,
  loading,
  error,
  seen,
  pbsByStudent,
}: {
  feed: FeedEntry[];
  flags: AthleteFlags[];
  week: WeekSummary;
  remarked: number;
  today: string;
  athleteCount: number;
  loading: boolean;
  error: string | null;
  seen: SeenState;
  pbsByStudent: ReadonlyMap<string, AthletePB[]>;
}) {
  const t = useT();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [athlete, setAthlete] = useState<string | null>(null);
  const isNew = (e: FeedEntry) => isNewFor(seen, e.id, e.at);
  const unread = feed.filter(isNew).length;

  const pbsOf = useMemo(() => {
    const m = new Map<string, SessionBest[]>();
    for (const e of feed) {
      const hit = sessionPBs(e.session, pbsByStudent.get(e.studentId) ?? []);
      if (hit.length) m.set(e.id, hit);
    }
    return m;
  }, [feed, pbsByStudent]);
  const digest = buildDigest({ feed, pbsByStudent, isNew, nowMs: Date.now() });

  // Athlete chips: everyone in the feed, most active first.
  const people = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const e of feed) {
      const cur = m.get(e.studentId) ?? { name: e.studentName, n: 0 };
      cur.n += 1;
      m.set(e.studentId, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [feed]);

  const mine = athlete ? feed.filter((e) => e.studentId === athlete) : feed;
  const shown = mine.filter((e) => matchesFilter(e, filter, isNew));
  const groups = groupByDay(shown, (e) => e.at, today);
  const filters: { id: FeedFilter; label: string; n: number }[] = [
    { id: 'all', label: t('All'), n: mine.length },
    { id: 'new', label: t('New'), n: mine.filter(isNew).length },
    { id: 'remarks', label: t('With remarks'), n: mine.filter(hasRemark).length },
    { id: 'hard', label: t('Effort 7+'), n: mine.filter(isHard).length },
  ];

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{t('Activity')}</h2>
          <p className="text-sm text-textDim">{t('What your athletes logged in the last 30 days.')}</p>
        </div>
        <button
          onClick={() => markAllSeen()}
          disabled={unread === 0}
          className="pill px-3 py-1.5 text-sm"
        >
          {t('Mark all as seen')}
        </button>
      </div>

      {loading && <p className="text-sm text-textDim">{t('Loading…')}</p>}
      {error && <p className="text-sm text-red">{error}</p>}

      {!loading && !error && athleteCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
          {t('No connected athletes yet. Invite one on the Athletes page.')}
          <div className="mt-3">
            <button onClick={() => navigate('/athletes')} className="text-accent hover:underline">
              {t('Athletes')} →
            </button>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="space-y-6">
          {feed.length > 0 && (
            <DigestRow
              digest={digest}
              t={t}
              onFilter={(f) => {
                setAthlete(null);
                setFilter(f);
              }}
            />
          )}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
            <section className="min-w-0 space-y-5">
              {feed.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={`pill px-3 py-1 text-xs ${filter === f.id ? 'pill-on' : ''}`}
                    >
                      {f.label} <span className="font-num opacity-70">{f.n}</span>
                    </button>
                  ))}
                  {people.length > 1 && <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />}
                  {people.length > 1 &&
                    people.map(([id, p]) => (
                      <button
                        key={id}
                        onClick={() => setAthlete(athlete === id ? null : id)}
                        aria-pressed={athlete === id}
                        className={`pill px-3 py-1 text-xs ${athlete === id ? 'pill-on' : ''}`}
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
              )}
              {feed.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
                  {t('No activity in the last 30 days.')}
                </p>
              )}
              {feed.length > 0 && groups.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
                  {t('Nothing matches this filter.')}{' '}
                  <button
                    onClick={() => {
                      setFilter('all');
                      setAthlete(null);
                    }}
                    className="text-accent hover:underline"
                  >
                    {t('Show all')}
                  </button>
                </p>
              )}
              {groups.map((g) => (
                <div key={g.day} className="space-y-2">
                  <h3 className="text-xs font-heading uppercase tracking-wide text-textDim">
                    {dayHeading(g.day, g.rel, t)}
                  </h3>
                  {g.items.map((e) => (
                    <FeedItem key={e.id} e={e} unread={isNew(e)} pbs={pbsOf.get(e.id) ?? []} t={t} />
                  ))}
                </div>
              ))}
            </section>

            <aside className="space-y-4">
              <NeedsALook flags={flags} t={t} />
              <ThisWeek week={week} remarked={remarked} t={t} />
            </aside>
          </div>
          </div>
        )
      )}
    </main>
  );
}

function openSession(e: FeedEntry) {
  navigate(`/connected/${e.studentId}/plan/${e.assignmentId}?session=${encodeURIComponent(e.sessionId)}`);
}
function openPlan(e: FeedEntry) {
  navigate(`/connected/${e.studentId}/plan/${e.assignmentId}`);
}

const MODE_TONE: Record<SessionBars['mode'], string> = {
  depth: 'var(--c-modeDepth)',
  pool: 'var(--c-modePool)',
  dry: 'var(--c-modeDry)',
};

/** One bar per dive or hold: depth bars hang from the surface line, pool and
 *  dry bars grow up. The session's best bar is full strength. */
function SessionPicture({ bars }: { bars: SessionBars }) {
  const W = 104;
  const H = 40;
  const n = bars.values.length;
  const gap = n > 12 ? 1.5 : 3;
  const bw = Math.max(2, (W - gap * (n - 1)) / n);
  const max = Math.max(1, ...bars.values);
  const best = bars.values.indexOf(max);
  const color = `rgb(${MODE_TONE[bars.mode]})`;
  const down = bars.mode === 'depth';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="hidden shrink-0 sm:block">
      {down && <line x1={0} x2={W} y1={0.75} y2={0.75} stroke={color} strokeOpacity={0.5} strokeWidth={1.5} />}
      {bars.values.map((v, i) => {
        const h = Math.max(2, (v / max) * (H - 3));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={down ? 2 : H - h}
            width={bw}
            height={h}
            rx={Math.min(2, bw / 2)}
            fill={color}
            fillOpacity={i === best ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

const pbText = (b: SessionBest) => `${b.discipline} ${formatPB(b)}`;

function FeedItem({
  e,
  unread,
  pbs,
  t,
}: {
  e: FeedEntry;
  unread: boolean;
  pbs: SessionBest[];
  t: (s: string) => string;
}) {
  const label = e.sessionLabel ?? t('Session');
  const what = fill(t(e.kind === 'updated' ? 'updated {session}' : 'finished {session}'), { session: label });
  const notes = sessionNoteLines(e.session);
  const chips = e.session ? sessionChips(e.session) : null;
  const bars = e.session ? sessionBars(e.session) : null;
  const compact = e.rating == null && !e.remarks && !e.session;
  const frame = unread ? 'border-accent/60 bg-accent/5' : 'border-border bg-panel';
  const stripe = bars ? { background: `rgb(${MODE_TONE[bars.mode]})` } : undefined;
  const dot = unread && <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-accent" />;
  const headline = (
    <>
      {dot}
      <span className="font-medium text-text">{e.studentName}</span>
      <span className="min-w-0 text-textDim">{what}</span>
      {e.week != null && (
        <span className="text-xs text-textDim">
          · {t('Week')} {e.week}
        </span>
      )}
      <span className="ml-auto shrink-0 text-xs text-textDim" title={new Date(e.at).toLocaleString()}>
        {relTime(e.at)}
      </span>
    </>
  );

  if (compact) {
    return (
      <button
        onClick={() => openSession(e)}
        className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2 text-left text-sm hover:border-accent ${frame}`}
      >
        {headline}
      </button>
    );
  }

  const chipList: string[] = [];
  if (chips?.diveCount != null)
    chipList.push(fill(t(chips.diveCount === 1 ? '{n} dive' : '{n} dives'), { n: chips.diveCount }));
  if (chips?.maxDepth != null) chipList.push(`${t('Max depth')} ${chips.maxDepth} m`);
  if (chips?.bestDistance != null) chipList.push(`${t('Best distance')} ${chips.bestDistance} m`);
  if (chips?.longestHoldSec != null) chipList.push(`${t('Longest hold')} ${fmtSec(chips.longestHoldSec)}`);

  return (
    <article className={`relative overflow-hidden rounded-xl border p-3 pl-4 ${frame}`}>
      {stripe && <span className="absolute inset-y-0 left-0 w-1" style={stripe} aria-hidden="true" />}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">{headline}</div>

          {(chipList.length > 0 || e.rating != null || pbs.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {pbs.map((b) => (
                <span key={b.discipline} className="rounded-full bg-recover/20 px-2 py-0.5 text-xs font-bold text-recover">
                  {t('PB')} {pbText(b)}
                </span>
              ))}
              {chipList.map((c) => (
                <span key={c} className="rounded-full bg-abyss px-2 py-0.5 text-xs text-text">
                  {c}
                </span>
              ))}
              {e.rating != null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${isHard(e) ? 'bg-red/15 text-red' : 'bg-amber/15 text-amber'}`}
                >
                  {t('Effort')} {Math.max(0, Math.min(10, e.rating))}/10
                </span>
              )}
            </div>
          )}
        </div>
        {bars && <SessionPicture bars={bars} />}
      </div>

      {e.remarks && <p className="mt-2 break-words text-sm text-text">“{e.remarks}”</p>}

      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-l-2 border-border pl-3 text-sm">
          {notes.slice(0, NOTE_LINES).map((n) => (
            <li key={`${n.kind}${n.n}`} className="break-words text-textDim">
              <span className="text-text">
                {n.kind === 'hold' ? fill(t('Hold {n}'), { n: n.n }) : `${t('Dive')} ${n.n}`}:
              </span>{' '}
              {n.text}
            </li>
          ))}
          {notes.length > NOTE_LINES && (
            <li className="text-xs text-textDim">{fill(t('+{n} more'), { n: notes.length - NOTE_LINES })}</li>
          )}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        <button onClick={() => openSession(e)} className="text-accent hover:underline">
          {t('Open session')}
        </button>
        <button onClick={() => openPlan(e)} className="text-textDim hover:text-text">
          {t('Open plan')} · {e.planTitle}
        </button>
        {unread && (
          <button onClick={() => markSeen(e.id, e.at)} className="ml-auto font-bold text-textDim hover:text-text">
            {t('Mark seen')}
          </button>
        )}
      </div>
    </article>
  );
}

/** "Since you last looked": new PBs, remarks to read and hard sessions, each
 *  a tile that jumps to what it counts. */
function DigestRow({
  digest,
  onFilter,
  t,
}: {
  digest: ReturnType<typeof buildDigest>;
  onFilter: (f: FeedFilter) => void;
  t: (s: string) => string;
}) {
  const firstPb = digest.pbs[0];
  const firstRemark = digest.remarks[0];
  const firstHard = digest.hard[0];
  const quote = firstRemark
    ? (firstRemark.remarks ?? sessionNoteLines(firstRemark.session)[0]?.text ?? '')
    : '';
  const tiles: { key: string; n: number; label: string; line: string; tone: string; go: () => void }[] = [
    {
      key: 'pb',
      n: digest.pbs.length,
      label: t(digest.pbs.length === 1 ? 'New PB' : 'New PBs'),
      line: firstPb ? `${firstPb.entry.studentName} · ${firstPb.pbs.map(pbText).join(', ')}` : t('None'),
      tone: 'var(--c-recover)',
      go: () => firstPb && openSession(firstPb.entry),
    },
    {
      key: 'remarks',
      n: digest.remarks.length,
      label: t(digest.remarks.length === 1 ? 'Remark to read' : 'Remarks to read'),
      line: firstRemark ? `${firstRemark.studentName}: “${quote}”` : t('None'),
      tone: 'var(--c-amber)',
      go: () => onFilter('remarks'),
    },
    {
      key: 'hard',
      n: digest.hard.length,
      label: t(digest.hard.length === 1 ? 'Hard session (effort 7+)' : 'Hard sessions (effort 7+)'),
      line: firstHard ? `${firstHard.studentName} · ${t('Effort')} ${firstHard.rating}/10` : t('None'),
      tone: 'var(--c-red)',
      go: () => onFilter('hard'),
    },
  ];
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-heading uppercase tracking-wide text-textDim">
        {digest.scope === 'new' ? t('Since you last looked') : t('Nothing new: the last 7 days')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((x) => (
          <button
            key={x.key}
            onClick={x.go}
            disabled={x.n === 0}
            className="tile min-w-0 px-3 py-2.5 text-left disabled:cursor-default"
            style={{ '--tone': `rgb(${x.tone})` } as CSSProperties}
          >
            <div className="flex items-baseline gap-2">
              <span className="tile-value font-num text-2xl font-bold leading-tight">{x.n}</span>
              <span className="tile-label text-xs font-bold">{x.label}</span>
            </div>
            <div className="tile-label mt-0.5 truncate text-xs">{x.line}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function NeedsALook({ flags, t }: { flags: AthleteFlags[]; t: (s: string) => string }) {
  return (
    <section className="glass-card space-y-3 rounded-xl p-4">
      <h3 className="font-heading text-sm tracking-wide text-text">{t('Needs a look')}</h3>
      {flags.length === 0 ? (
        <p className="text-sm text-textDim">{t('Nothing needs a look right now.')}</p>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <li key={f.studentId} className="space-y-1">
              <button
                onClick={() => navigate(`/connected/${f.studentId}`)}
                className="text-left text-sm font-medium text-text hover:text-accent"
              >
                {f.name}
              </button>
              <div className="flex flex-wrap gap-1">
                {f.reasons.map((r) => {
                  const tone =
                    r.kind === 'effortRising'
                      ? 'bg-amber/15 text-amber'
                      : r.kind === 'noPlan'
                        ? 'bg-abyss text-textDim'
                        : 'bg-red/15 text-red';
                  const text =
                    r.kind === 'missed'
                      ? fill(t('{n} missed'), { n: r.count })
                      : r.kind === 'quiet'
                        ? fill(t('{n} days quiet'), { n: r.days })
                        : r.kind === 'effortRising'
                          ? `${t('Effort rising')} ${r.ratings.join(' → ')}`
                          : t('No active plan');
                  return (
                    <span key={r.kind} className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
                      {text}
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ThisWeek({ week, remarked, t }: { week: WeekSummary; remarked: number; t: (s: string) => string }) {
  const rows: { label: string; value: string }[] = [];
  if (week.planned != null) rows.push({ label: t('Sessions done / planned'), value: `${week.done} / ${week.planned}` });
  rows.push({ label: t('Sessions with a remark'), value: String(remarked) });
  rows.push({ label: t('Plans ending within 14 days'), value: String(week.endingSoon) });
  return (
    <section className="glass-card space-y-3 rounded-xl p-4">
      <h3 className="font-heading text-sm tracking-wide text-text">{t('This week')}</h3>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-textDim">{r.label}</dt>
            <dd className="font-mono text-text">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
