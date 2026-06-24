/**
 * Supabase client for the coach portal — points at the SAME EU (Frankfurt)
 * project as the ELEMENT | 08 app, so a coach sees one synced dataset whether
 * they use the website or the app. The publishable key is client-safe (RLS
 * protects all rows); it's the same key the app ships in app.json. Override the
 * URL/key via Vite env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) at build.
 */
import { createClient } from '@supabase/supabase-js';

const URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://gtgoqdaapnzwkrvanaab.supabase.co';
const KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_EqsQtlSzqWILFpr7ioss_Q_9sK-YJLl';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
