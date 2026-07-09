/**
 * CloudBackup — coach-only card to back up / restore the browser-local data
 * (exercise library, plan drafts, roster, notes) to the coach's account. Manual,
 * replace semantics. Renders nothing when signed out or not a coach; the local
 * file Export/Import in AthletesView stays as the offline fallback.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/supabase/AuthProvider';
import { backupToCloud, restoreFromCloud, cloudBackupInfo } from '../lib/supabase/coachBackup';
import { useT } from '../i18n';

export function CloudBackup() {
  const t = useT();
  const { session, isCoach } = useAuth();
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !isCoach) return;
    cloudBackupInfo()
      .then((i) => setUpdatedAt(i?.updatedAt ?? null))
      .catch(() => {});
  }, [session, isCoach]);

  if (!session || !isCoach) return null;

  async function backup() {
    setBusy('backup');
    setMsg(null);
    setErr(null);
    try {
      const at = await backupToCloud();
      setUpdatedAt(at);
      setMsg(t('Backed up to the cloud.'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (
      !confirm(
        t(
          'Restore replaces the library, plans, and roster in this browser with your cloud backup. Continue?',
        ),
      )
    )
      return;
    setBusy('restore');
    setMsg(null);
    setErr(null);
    try {
      const { updatedAt: at } = await restoreFromCloud();
      setUpdatedAt(at);
      setMsg(t('Restored from the cloud.'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const when = updatedAt ? new Date(updatedAt).toLocaleString() : null;

  return (
    <section className="glass-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-heading tracking-wide text-text">{t('CLOUD BACKUP')}</h3>
        <p className="text-textDim text-xs">
          {t('Save your exercise library, plans, and roster to your account.')}{' '}
          {when ? `${t('Last backup:')} ${when}` : t('No cloud backup yet.')}
        </p>
        {msg && <p className="text-xs text-recover mt-1">{msg}</p>}
        {err && <p className="text-xs text-red mt-1">{err}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={restore}
          disabled={busy !== null || !updatedAt}
          className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent disabled:opacity-40"
        >
          {busy === 'restore' ? '…' : t('Restore')}
        </button>
        <button
          onClick={backup}
          disabled={busy !== null}
          className="glow-accent text-sm bg-accent text-ink rounded-lg px-3 py-1.5 font-heading tracking-wide disabled:opacity-50"
        >
          {busy === 'backup' ? '…' : t('Back up now')}
        </button>
      </div>
    </section>
  );
}
