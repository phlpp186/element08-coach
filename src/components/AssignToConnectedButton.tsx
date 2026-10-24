/**
 * AssignToConnectedButton — in the plan builder's bottom bar, assigns the plan
 * to a connected (paired) athlete, who receives it live in the app.
 * Coach-only; renders nothing when signed out / not a coach.
 *
 * Flow: the builder saves the plan and sends it to the plan library (which may
 * ask who of its current athletes gets this version) → assign the plan's
 * library row. The .e08plan download stays as the account-free fallback.
 */
import { useState } from 'react';
import { useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useRoster } from '../lib/supabase/useRoster';
import { assignPlan } from '../lib/supabase/coachData';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';

export function AssignToConnectedButton({
  ready,
  ensurePublished,
  menuBelow = false,
}: {
  ready: boolean;
  /** Open the athlete list below the button (it opens upward from the
   *  builder's bottom bar). */
  menuBelow?: boolean;
  /** Save the plan and send it to the library. Its saved-plan id, or null
   *  when it could not reach the library (clash or offline). */
  ensurePublished: () => Promise<string | null>;
}) {
  const t = useT();
  const { session, isCoach } = useAuth();
  const { athletes, loading } = useRoster();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!session || !isCoach) return null;

  async function assign(studentId: string, name: string) {
    setBusy(studentId);
    setMsg(null);
    try {
      const recId = await ensurePublished();
      const cloudId = recId ? getCloudPlanLink(recId)?.cloudPlanId : undefined;
      if (!cloudId) {
        setMsg({ text: t('Could not reach the library. Check your connection and try again.'), ok: false });
        return;
      }
      await assignPlan(cloudId, studentId);
      setMsg({ text: `${t('Assigned to')} ${name} ✓`, ok: true });
      setOpen(false);
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        disabled={!ready}
        onClick={() => {
          setMsg(null);
          setOpen((v) => !v);
        }}
        className="pill text-accent px-4 py-2"
      >
        {t('Assign…')}
      </button>

      {msg && !open && (
        <div
          className={`absolute right-0 whitespace-nowrap text-xs ${menuBelow ? 'top-full mt-2' : 'bottom-full mb-2'} ${msg.ok ? 'text-recover' : 'text-red'}`}
        >
          {msg.text}
        </div>
      )}

      {open && (
        <div className={`board absolute right-0 z-30 w-64 p-2 ${menuBelow ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
          <p className="px-2 py-1 text-xs text-textDim">{t('Assign to a connected athlete:')}</p>
          {loading ? (
            <p className="px-2 py-2 text-sm text-textDim">{t('Loading…')}</p>
          ) : athletes.length === 0 ? (
            <p className="px-2 py-2 text-sm text-textDim">
              {t('No connected athletes yet. Invite one from the Athletes page.')}
            </p>
          ) : (
            athletes.map((a) => (
              <button
                key={a.studentId}
                disabled={!!busy}
                onClick={() => assign(a.studentId, a.name)}
                className="block w-full text-left px-2 py-2 text-sm rounded hover:bg-accent/10 disabled:opacity-50"
              >
                {busy === a.studentId ? '…' : a.name}
              </button>
            ))
          )}
          {msg && !msg.ok && <p className="px-2 py-1 text-xs text-red">{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
