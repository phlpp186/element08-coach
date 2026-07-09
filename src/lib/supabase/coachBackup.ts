/**
 * Coach cloud backup — manual, button-triggered backup/restore of the coach's
 * browser-local data (exercise library + plan drafts + notebook athletes + CRM
 * notes + category colours) to a single per-coach row in Supabase.
 *
 * Replace semantics (like the app's backup): "Back up now" overwrites the cloud
 * row from this browser; "Restore" overwrites this browser from the cloud row.
 * No live sync / merge — one blob per coach, keyed by the signed-in user id and
 * guarded by RLS (migration: supabase/migrations/0009_coach_backups.sql).
 */
import { supabase } from './client';
import { snapshotRoster, restoreRoster } from '../store';
import { snapshotLibrary, restoreLibrary } from '../library';
import { snapshotCategoryColors, restoreCategoryColors } from '../categoryColor';

const BACKUP_FORMAT = 'e08coach-cloud-backup';
const BACKUP_VERSION = 1;

interface BackupBlob {
  format: string;
  version: number;
  roster: ReturnType<typeof snapshotRoster>;
  library: ReturnType<typeof snapshotLibrary>;
  categoryColors: Record<string, string>;
}

function build(): BackupBlob {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    roster: snapshotRoster(),
    library: snapshotLibrary(),
    categoryColors: snapshotCategoryColors(),
  };
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Sign in to back up to the cloud.');
  return id;
}

/** Overwrite the coach's cloud backup from this browser. Returns the timestamp. */
export async function backupToCloud(): Promise<string> {
  const user_id = await requireUserId();
  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('coach_backups')
    .upsert({ user_id, data: build(), updated_at });
  if (error) throw new Error(error.message);
  return updated_at;
}

/** When the cloud backup was last written, or null if there is none yet. */
export async function cloudBackupInfo(): Promise<{ updatedAt: string } | null> {
  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from('coach_backups')
    .select('updated_at')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { updatedAt: data.updated_at as string } : null;
}

/** Overwrite this browser's data from the cloud backup. */
export async function restoreFromCloud(): Promise<{ updatedAt: string }> {
  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from('coach_backups')
    .select('data, updated_at')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.data) throw new Error('No cloud backup found for this account.');
  const blob = data.data as Partial<BackupBlob>;
  restoreRoster(blob.roster);
  restoreLibrary(blob.library);
  restoreCategoryColors(blob.categoryColors);
  return { updatedAt: data.updated_at as string };
}
