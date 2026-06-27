/**
 * AuthBar — compact account control in the header. Signed out: a "Sign in"
 * button revealing an email/password panel (with a create-account toggle).
 * Signed in: name + coach badge + sign out. The portal still works signed out
 * (localStorage roster + .e08plan), so this is additive: signing in unlocks the
 * synced cloud backend shared with the app.
 */
import { useState } from 'react';
import { useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { signIn, signUp, signOut } from '../lib/supabase/auth';

export function AuthBar() {
  const t = useT();
  const { session, profile, isCoach, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'in') await signIn(email, password);
      else {
        await signUp(email, password, name);
        setMsg(t('Account created. If email confirmation is on, confirm then sign in.'));
      }
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
          className="text-sm text-textDim hover:text-text border border-border rounded px-3 py-1"
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
        className="text-sm border border-border rounded px-3 py-1 text-textDim hover:text-text"
      >
        {t('Sign in')}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 glass-card rounded-lg p-4 z-20">
          <div className="flex gap-1 mb-3 rounded-md border border-border overflow-hidden text-sm">
            {(['in', 'up'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setMsg(null);
                }}
                className={`flex-1 py-1.5 ${mode === m ? 'bg-accent text-ink' : 'text-textDim'}`}
              >
                {m === 'in' ? t('Sign in') : t('Create account')}
              </button>
            ))}
          </div>
          {mode === 'up' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Your name')}
              className="w-full mb-2 rounded border border-border bg-transparent px-3 py-2 text-sm"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('Email')}
            autoComplete="email"
            inputMode="email"
            className="w-full mb-2 rounded border border-border bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('Password')}
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full mb-3 rounded border border-border bg-transparent px-3 py-2 text-sm"
          />
          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="glow-accent w-full rounded bg-accent text-ink py-2 text-sm disabled:opacity-50"
          >
            {busy ? '…' : mode === 'in' ? t('Sign in') : t('Create account')}
          </button>
          {msg && <p className="mt-2 text-xs text-textDim">{msg}</p>}
          <p className="mt-2 text-xs text-textDim">
            {t('Same account as the ELEMENT | 08 app. Coach access is set in the app.')}
          </p>
        </div>
      )}
    </div>
  );
}
