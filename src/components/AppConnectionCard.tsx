/**
 * The "on the app" block of a notebook athlete's page, so onboarding and
 * pairing happen in one place: a coach adds the athlete, fills the intro
 * questionnaire, and sends the invite code from the same page. When the
 * athlete redeems it, useInviteLinking links this entry to their app account.
 *
 * Without the coach role (Pro, granted in the app) the notebook works as
 * before and this block only says what the role would add.
 */
import { useState } from 'react';
import { fill, useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useRoster, type ConnectedAthlete } from '../lib/supabase/useRoster';
import { createInvite } from '../lib/supabase/coachData';
import { linkAthlete, unlinkAthlete, updateAthlete, useAthletes } from '../lib/store';
import { inviteExpired } from '../lib/athleteLink';
import { navigate } from '../hooks/useHashRoute';
import type { Athlete } from '../lib/types';

export function AppConnectionCard({ athlete }: { athlete: Athlete }) {
  const { session, profile, isCoach } = useAuth();
  const { athletes: connected, loading } = useRoster();
  const notebook = useAthletes();
  // Role still loading: render nothing rather than flash the wrong state.
  if (session && !profile) return null;
  return (
    <AppConnectionBody
      athlete={athlete}
      isCoach={isCoach}
      connected={connected}
      loading={loading}
      // Connected athletes no notebook entry is linked to yet.
      linkable={connected.filter((c) => !notebook.some((a) => a.studentId === c.studentId))}
      actions={{
        invite: async () => {
          const code = await createInvite();
          updateAthlete(athlete.id, { invite: { code, createdAt: new Date().toISOString() } });
        },
        link: (studentId) => linkAthlete(athlete.id, studentId),
        unlink: () => unlinkAthlete(athlete.id),
      }}
    />
  );
}

export interface ConnectionActions {
  invite: () => Promise<void>;
  link: (studentId: string) => void;
  unlink: () => void;
}

/** The block itself, from loaded data (also driven by the dev preview). */
export function AppConnectionBody({
  athlete,
  isCoach,
  connected,
  loading,
  linkable,
  actions,
}: {
  athlete: Athlete;
  isCoach: boolean;
  connected: ConnectedAthlete[];
  loading: boolean;
  linkable: ConnectedAthlete[];
  actions: ConnectionActions;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const name = athlete.name.trim() || t('this athlete');

  const box = 'rounded-xl border border-border bg-panel p-4 space-y-3';

  if (!isCoach) {
    return (
      <section className="rounded-xl border border-dashed border-border p-4 text-sm text-textDim">
        {t('With the coach role (ELEMENT | 08 Pro) you can send this athlete an invite code from here. Once they enter it in the app, their sessions, PBs and plan progress show up next to these notes.')}
      </section>
    );
  }

  const sendInvite = async () => {
    setBusy(true);
    setErr(null);
    try {
      await actions.invite();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async (code: string) => {
    const text = fill(
      t('Join me on ELEMENT | 08: in the app, go to Settings › Account › Connect with a coach and enter this code: {code}'),
      { code },
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('Copy this message:'), text);
    }
  };

  const linkPicker =
    linkable.length > 0 ? (
      <label className="flex flex-wrap items-center gap-2 text-xs text-textDim">
        {t('Already connected on the app? Link them:')}
        <select
          className="field w-auto py-1 text-sm"
          value=""
          onChange={(e) => {
            if (e.target.value) actions.link(e.target.value);
          }}
        >
          <option value="">{t('Choose an athlete')}</option>
          {linkable.map((c) => (
            <option key={c.studentId} value={c.studentId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  if (athlete.studentId) {
    const app = connected.find((c) => c.studentId === athlete.studentId);
    const unlink = () => {
      if (confirm(fill(t('Unlink {name} from their app account? They stay connected; this page and their app data are just shown apart again.'), { name })))
        actions.unlink();
    };
    if (!app && loading) return null;
    return (
      <section className={box}>
        {app ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-accent">✓ {fill(t('Connected on the app as {name}'), { name: app.name })}</div>
              <div className="text-xs text-textDim">
                {app.planCount} {app.planCount === 1 ? t('plan') : t('plans')} · {app.doneCount}{' '}
                {app.doneCount === 1 ? t('session') : t('sessions')} {t('done')}
              </div>
            </div>
            <button onClick={() => navigate(`/connected/${app.studentId}`)} className="pill pill-on btn-raised px-3 py-1.5 text-sm">
              {t('Plans and sessions')} ›
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-text">{t('No longer connected on the app.')}</p>
            <button onClick={() => void sendInvite()} disabled={busy} className="pill px-3 py-1.5 text-sm">
              {busy ? '…' : t('Send a new invite code')}
            </button>
          </div>
        )}
        <button onClick={unlink} className="text-xs text-textDim underline hover:text-text">
          {t('Unlink')}
        </button>
        {err && <p className="text-xs text-red">{err}</p>}
      </section>
    );
  }

  if (athlete.invite && !inviteExpired(athlete.invite)) {
    const code = athlete.invite.code;
    return (
      <section className={`${box} border-accent/60`}>
        <p className="text-sm text-text">
          {fill(t('Invite for {name}. They enter it in the app under'), { name })}{' '}
          <span className="text-textDim">{t('Settings › Account › Connect with a coach')}</span>:
        </p>
        <div className="font-mono text-2xl tracking-[0.3em] text-accent">{code}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void copyMessage(code)} className="pill pill-on btn-raised px-3 py-1.5 text-sm">
            {copied ? t('Copied ✓') : t('Copy invite message')}
          </button>
          <button onClick={() => void sendInvite()} disabled={busy} className="pill px-3 py-1.5 text-sm">
            {busy ? '…' : t('New code')}
          </button>
        </div>
        <p className="text-xs text-textDim">
          {t('This page links to their app account by itself once they enter the code. Codes work for 14 days.')}
        </p>
        {linkPicker}
        {err && <p className="text-xs text-red">{err}</p>}
      </section>
    );
  }

  return (
    <section className={box}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-textDim">
          {athlete.invite
            ? t('The invite code expired. Send a new one.')
            : t('Invite this athlete to the app to see their sessions, PBs and plan progress next to these notes.')}
        </p>
        <button onClick={() => void sendInvite()} disabled={busy} className="pill pill-on btn-raised px-3 py-1.5 text-sm">
          {busy ? '…' : `+ ${t('Send invite code')}`}
        </button>
      </div>
      {linkPicker}
      {err && <p className="text-xs text-red">{err}</p>}
    </section>
  );
}
