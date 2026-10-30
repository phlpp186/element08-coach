/**
 * AuthProvider — one shared Supabase session + profile for the whole portal.
 * Bootstraps the persisted session, tracks sign-in/out, and loads the coach's
 * profile row (so views can gate on `isCoach`). The coach role is granted in-app
 * (Pro); the portal only reads it.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { getMyProfile, type Profile } from './auth';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isCoach: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Waits between attempts at the profile read; null = give up. */
const PROFILE_RETRY_MS: (number | null)[] = [1000, 4000, null];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // A failed read keeps the profile we had: a dropped request used to set it to
  // null, which reads as "not a coach" and hid the whole portal until a reload
  // (audit 2026-10-29). A first read that fails retries a few times.
  const refreshProfile = useCallback(async () => {
    for (const wait of PROFILE_RETRY_MS) {
      try {
        setProfile(await getMyProfile());
        return;
      } catch {
        if (wait == null) return;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let userId: string | null = null;
    const load = (s: Session | null) => {
      const next = s?.user.id ?? null;
      setSession(s);
      if (!next) {
        setProfile(null);
      } else if (next !== userId) {
        // Another account, or the first: never show the previous one's role.
        setProfile(null);
        void refreshProfile();
      }
      userId = next;
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      userId = data.session?.user.id ?? null;
      setSession(data.session);
      if (data.session) await refreshProfile();
      if (alive) setLoading(false);
    });
    // Nothing is awaited in here: supabase-js runs this callback under its auth
    // lock, and a Supabase call made inside it can deadlock (their docs). The
    // profile read starts after the callback returns.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      setTimeout(() => alive && load(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        isCoach: !!profile?.is_coach,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
