/**
 * ConnectedAthletes — the cloud roster section shown above the local notebook on
 * the Athletes page when signed in as a coach. Lists paired app users (live PBs /
 * plans / progress) and generates an invite code the athlete redeems in the app.
 * Renders nothing when signed out or signed in as a non-coach.
 */
import { useState } from 'react';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useRoster } from '../lib/supabase/useRoster';
import { createInvite } from '../lib/supabase/coachData';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';

export function ConnectedAthletes() {
  const t = useT();
  const { session, isCoach, loading: authLoading } = useAuth();
  const { athletes, loading, error, refresh } = useRoster();
  const [code, setCode] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  // Cloud roster is a coach-only surface; signed-out / non-coach see only the
  // local notebook below.
  if (authLoading || !session || !isCoach) return null;

  async function invite() {
    setInviting(true);
    setInviteErr(null);
    try {
      setCode(await createInvite());
    } catch (e) {
      setInviteErr((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading tracking-wide text-text">{t('CONNECTED ATHLETES')}</h3>
          <p className="text-textDim text-xs">{t('Synced with the app: live PBs, plans, and progress.')}</p>
        </div>
        <button
          onClick={invite}
          disabled={inviting}
          className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide disabled:opacity-50"
        >
          {inviting ? '…' : `+ ${t('Invite an athlete')}`}
        </button>
      </div>

      {code && (
        <div className="rounded-lg border border-accent bg-accent/10 p-3 text-sm">
          {t('Share this code with your athlete, they enter it in the app under')}{' '}
          <span className="text-textDim">{t('Settings › Account › Connect with a coach')}</span>:
          <div className="mt-2 font-mono text-2xl tracking-[0.3em] text-accent">{code}</div>
          <button onClick={refresh} className="mt-2 text-xs text-textDim hover:text-text underline">
            {t("Refresh once they've connected")}
          </button>
        </div>
      )}
      {inviteErr && <p className="text-xs text-red">{inviteErr}</p>}
      {error && <p className="text-xs text-red">{error}</p>}

      {loading ? (
        <p className="text-textDim text-sm">{t('Loading…')}</p>
      ) : athletes.length === 0 ? (
        <p className="text-textDim text-sm rounded-xl border border-dashed border-border p-4">
          {t('No connected athletes yet. Invite one with a code above.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {athletes.map((a) => (
            <button
              key={a.studentId}
              onClick={() => navigate(`/connected/${a.studentId}`)}
              className="text-left glass-card rounded-xl p-4 space-y-2 hover:border-accent"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-heading">
                  {(a.name.trim()[0] ?? '?').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-text truncate">{a.name}</div>
                  <div className="text-xs text-accent">✓ {t('paired')}</div>
                </div>
              </div>
              <div className="text-xs text-textDim">
                {a.planCount} {a.planCount === 1 ? t('plan') : t('plans')} · {a.doneCount}{' '}
                {a.doneCount === 1 ? t('session') : t('sessions')} {t('done')}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
