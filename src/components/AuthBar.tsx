/**
 * AuthBar — compact account control in the header. Signed out: a "Sign in"
 * button revealing an email/password panel. Signed in: name + coach badge +
 * sign out. Account creation lives in the ELEMENT | 08 app (coach access is
 * Pro-gated + the consent gate is there), so the portal only signs in. The
 * portal still works signed out (localStorage roster + .e08plan); signing in
 * unlocks the synced cloud backend shared with the app.
 */
import { useState } from 'react';
import { useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { signIn, signOut } from '../lib/supabase/auth';

export function AuthBar() {
  const t = useT();
  const { session, profile, isCoach, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await signIn(email, password);
      setOpen(false);
      setPassword('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <span className="text-textDim text-sm">…</span>;
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-text hidden sm:inline">
          {profile?.display_name?.trim() || session.user.email}
        </span>
        {isCoach ? (
          <span className="rounded border border-accent px-2 py-0.5 text-xs text-accent">{t('COACH')}</span>
        ) : (
          <span className="rounded border border-border px-2 py-0.5 text-xs text-textDim">
            {t('ATHLETE')}
          </span>
        )}
        <button
          onClick={() => signOut()}
          className="pill text-sm px-3 py-1"
        >
          {t('Sign out')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="pill text-sm px-3 py-1"
      >
        {t('Sign in')}
      </button>
      {open && (
        <div className="board absolute right-0 z-[60] mt-2 w-72 p-4">
          <p className="mb-3 text-sm font-heading tracking-wide text-text">{t('Sign in')}</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('Email')}
            autoComplete="email"
            inputMode="email"
            className="field mb-2"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Password')}
            type="password"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="field mb-3"
          />
          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="pill pill-on btn-raised w-full justify-center py-2 text-sm"
          >
            {busy ? '…' : t('Sign in')}
          </button>
          {msg && <p className="mt-2 text-xs text-textDim">{msg}</p>}
          <p className="mt-2 text-xs text-textDim">
            {t('Same account as the ELEMENT | 08 app. New here? Create your account in the app, coach access is set there too.')}
          </p>
        </div>
      )}
    </div>
  );
}
