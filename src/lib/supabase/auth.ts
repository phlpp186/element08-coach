/**
 * Portal auth + profile helpers over the shared Supabase project. Same accounts
 * as the app. The coach ROLE (`profiles.is_coach`) is Pro-gated and granted
 * in-app (RevenueCat) — the portal only READS it, never sets it, so the paywall
 * isn't bypassable from the website.
 */
import { supabase } from './client';

export interface Profile {
  id: string;
  display_name: string;
  is_coach: boolean;
  is_student: boolean;
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('user already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('email not confirmed')) return 'Check your inbox to confirm your email, then sign in.';
  return message;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error.message));
}

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: displayName.trim() ? { display_name: displayName.trim() } : undefined },
  });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** The signed-in user's profile row, or null when signed out. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, is_coach, is_student')
    .eq('id', u.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}
