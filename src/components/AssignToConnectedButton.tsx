/**
 * AssignToConnectedButton — in the plan builder's bottom bar, pushes the current
 * plan to the cloud and assigns it to a connected (paired) athlete, who receives
 * it live in the app. Coach-only; renders nothing when signed out / not a coach.
 *
 * Flow: ensure the plan is saved locally (stable record id) → build the .e08plan
 * file → convert to the app's Plan definition → create-or-update the cloud plan
 * (deduped via cloudPlanLinks) → upsert the assignment. The .e08plan download
 * stays as the account-free fallback.
 */
import { useState } from 'react';
import type { BuilderPlan } from '../lib/e08plan';
import { buildPlanFile } from '../lib/e08plan';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useRoster } from '../lib/supabase/useRoster';
import { createPlan, updatePlan, assignPlan } from '../lib/supabase/coachData';
import { planFileToDefinition } from '../lib/supabase/planDefinition';
import { getCloudPlanLink, setCloudPlanLink } from '../lib/supabase/cloudPlanLinks';

export function AssignToConnectedButton({
  plan,
  ready,
  ensureSaved,
}: {
  plan: BuilderPlan;
  ready: boolean;
  /** Persist the plan locally and return its stable SavedPlan id. */
  ensureSaved: () => string;
}) {
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
      const recId = ensureSaved();
      const file = buildPlanFile(plan);
      const link = getCloudPlanLink(recId);
      const defId = link?.defId ?? Date.now() + Math.floor(Math.random() * 1000);
      const definition = planFileToDefinition(file, defId);
      let cloudId = link?.cloudPlanId;
      if (cloudId) await updatePlan(cloudId, { title: file.metadata.title, definition });
      else cloudId = (await createPlan(file.metadata.title, definition)).id;
      setCloudPlanLink(recId, { cloudPlanId: cloudId, defId });
      await assignPlan(cloudId, studentId);
      setMsg({ text: `Assigned to ${name} ✓`, ok: true });
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
        className="rounded-lg px-4 py-2 font-heading tracking-wide border border-accent text-accent disabled:opacity-40 hover:bg-accent/10"
      >
        Assign…
      </button>

      {msg && !open && (
        <div
          className={`absolute bottom-full right-0 mb-2 whitespace-nowrap text-xs ${msg.ok ? 'text-recover' : 'text-red'}`}
        >
          {msg.text}
        </div>
      )}

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-lg border border-border bg-panel p-2 shadow-xl">
          <p className="px-2 py-1 text-xs text-textDim">Assign to a connected athlete:</p>
          {loading ? (
            <p className="px-2 py-2 text-sm text-textDim">Loading…</p>
          ) : athletes.length === 0 ? (
            <p className="px-2 py-2 text-sm text-textDim">
              No connected athletes yet. Invite one from the Athletes page.
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
