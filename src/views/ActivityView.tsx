/**
 * ActivityView: every athlete's finished and edited sessions in one feed,
 * newest first and grouped by day, beside a "Needs a look" list (pure rules in
 * lib/activity) and a this-week summary. The bell's "See all" lands here; both
 * share one seen stamp, so "Mark all as seen" clears the bell too.
 */
import { navigate } from '../hooks/useHashRoute';
import { fill, useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useActivity } from '../lib/supabase/useActivity';
import { markAllSeen, useCompletionsSeen } from '../lib/completionsSeen';
import { groupByDay, isUnread, relTime, type AthleteFlags, type FeedEntry, type WeekSummary } from '../lib/activity';
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
  const seenAt = useCompletionsSeen();

  if (!session || !isCoach) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-6">
        <p className="text-textDim">{t('Sign in to view your connected athletes.')}</p>
      </main>
    );
  }
  return <ActivityBody {...data} seenAt={seenAt} />;
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
  seenAt,
}: {
  feed: FeedEntry[];
  flags: AthleteFlags[];
  week: WeekSummary;
  remarked: number;
  today: string;
  athleteCount: number;
  loading: boolean;
  error: string | null;
  seenAt: string;
}) {
  const t = useT();
  const unread = feed.filter((e) => isUnread(e.at, seenAt)).length;
  const groups = groupByDay(feed, (e) => e.at, today);

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
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
            <section className="min-w-0 space-y-5">
              {groups.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-textDim">
                  {t('No activity in the last 30 days.')}
                </p>
              )}
              {groups.map((g) => (
                <div key={g.day} className="space-y-2">
                  <h3 className="text-xs font-heading uppercase tracking-wide text-textDim">
                    {dayHeading(g.day, g.rel, t)}
                  </h3>
                  {g.items.map((e) => (
                    <FeedItem key={e.id} e={e} unread={isUnread(e.at, seenAt)} t={t} />
                  ))}
                </div>
              ))}
            </section>

            <aside className="space-y-4">
              <NeedsALook flags={flags} t={t} />
              <ThisWeek week={week} remarked={remarked} t={t} />
            </aside>
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

function FeedItem({ e, unread, t }: { e: FeedEntry; unread: boolean; t: (s: string) => string }) {
  const label = e.sessionLabel ?? t('Session');
  const what = fill(t(e.kind === 'updated' ? 'updated {session}' : 'finished {session}'), { session: label });
  const notes = sessionNoteLines(e.session);
  const chips = e.session ? sessionChips(e.session) : null;
  const compact = e.rating == null && !e.remarks && !e.session;
  const frame = unread ? 'border-accent/60 bg-accent/5' : 'border-border bg-panel';
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
    <article className={`space-y-2 rounded-xl border p-3 ${frame}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">{headline}</div>

      {(chipList.length > 0 || e.rating != null) && (
        <div className="flex flex-wrap gap-1.5">
          {chipList.map((c) => (
            <span key={c} className="rounded-full bg-abyss px-2 py-0.5 text-xs text-text">
              {c}
            </span>
          ))}
          {e.rating != null && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-xs text-amber">
              {t('Effort')} {Math.max(0, Math.min(10, e.rating))}/10
            </span>
          )}
        </div>
      )}

      {e.remarks && <p className="break-words text-sm text-text">“{e.remarks}”</p>}

      {notes.length > 0 && (
        <ul className="space-y-0.5 border-l-2 border-border pl-3 text-sm">
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

      <div className="flex flex-wrap gap-4 text-xs">
        <button onClick={() => openSession(e)} className="text-accent hover:underline">
          {t('Open session')}
        </button>
        <button onClick={() => openPlan(e)} className="text-textDim hover:text-text">
          {t('Open plan')} · {e.planTitle}
        </button>
      </div>
    </article>
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
