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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMyProfile());
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await refreshProfile();
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!alive) return;
      setSession(s);
      if (s) await refreshProfile();
      else setProfile(null);
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
