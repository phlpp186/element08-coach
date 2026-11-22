/**
 * Saving a plan from the builder into the shared library
 * (lib/supabase/planLibrary.ts), with the two questions a save can raise:
 *
 * - The plan is assigned: which athletes get this version? Unticked ones are
 *   moved onto a frozen copy of the version they have ("… (previous version)").
 *   "Save to library only" asks for a new name first: the athletes keep the
 *   plan under its old name, the new version is saved under the new one.
 * - The plan changed on another device since this browser last saw it: use
 *   that version, keep mine, or save mine as a copy.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { BuilderPlan } from '../lib/e08plan';
import { stampOf, type LibraryDevice } from '../lib/planLibrary';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useCoachAssignments } from '../lib/supabase/useCoachAssignments';
import {
  keepPreviousFor,
  resolveConflict,
  saveToLibrary,
  type ConflictChoice,
  useLibrary,
  type LibraryRow,
} from '../lib/supabase/planLibrary';
import { getSavedPlans, upsertPlan } from '../lib/store';
import { NameDialog } from './NameDialog';
import type { CoachAssignment } from '../lib/supabase/coachData';
import { editedAgo } from '../views/PlansView';
import { fill, useT } from '../i18n';

export type LibraryStatus = 'idle' | 'saving' | 'synced' | 'offline' | 'conflict';
/** 'appPlan': an app-only plan, not saved from here (isAppPlan).
 *  'cancelled': "Cancel" at "Who gets this version?", nothing was sent; the
 *  caller puts its local save back (Philipp pressed Done too early, 2026-11-22). */
export type PublishOutcome = 'ok' | 'conflict' | 'offline' | 'appPlan' | 'cancelled';

const DEVICE: Record<LibraryDevice, string> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  web: 'Web',
};

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="board w-full max-w-md space-y-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function useLibrarySave() {
  const t = useT();
  const { session, isCoach } = useAuth();
  const { byCloudPlanId, refresh } = useCoachAssignments();
  const [status, setStatus] = useState<LibraryStatus>('idle');
  const [ask, setAsk] = useState<{
    id: string;
    plan: BuilderPlan;
    cloudId: string;
    athletes: CoachAssignment[];
    done: (o: PublishOutcome) => void;
  } | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [conflict, setConflict] = useState<{ id: string; plan: BuilderPlan; row: LibraryRow } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  // "Save to library only" was picked: the new version needs its own name.
  const [naming, setNaming] = useState(false);
  const lib = useLibrary();
  // What was last sent, so a repeated Save without changes asks nothing.
  const sentRef = useRef<string | null>(null);

  async function send(id: string, plan: BuilderPlan): Promise<PublishOutcome> {
    setStatus('saving');
    const r = await saveToLibrary(id, plan);
    if (r.ok) {
      sentRef.current = JSON.stringify(plan);
      setStatus('synced');
      return 'ok';
    }
    if ('conflict' in r) {
      setConflict({ id, plan, row: r.conflict });
      setStatus('conflict');
      return 'conflict';
    }
    if ('appPlan' in r) {
      setStatus('idle');
      return 'appPlan';
    }
    setStatus('offline');
    return 'offline';
  }

  /** Send a saved plan to the library. Resolves when any question it raised
   *  has been answered. */
  function publish(id: string, plan: BuilderPlan): Promise<PublishOutcome> {
    if (!session || !isCoach) return Promise.resolve('offline');
    if (sentRef.current === JSON.stringify(plan)) return Promise.resolve('ok');
    const cloudId = getCloudPlanLink(id)?.cloudPlanId;
    const athletes = cloudId ? (byCloudPlanId.get(cloudId) ?? []) : [];
    if (!cloudId || athletes.length === 0) return send(id, plan);
    return new Promise((resolve) => {
      setTicked(Object.fromEntries(athletes.map((a) => [a.id, true])));
      setAsk({ id, plan, cloudId, athletes, done: resolve });
    });
  }

  /** `libraryOnlyName`: "Save to library only". Every athlete stays on the
   *  version they have, which keeps the plan's old name, and this version is
   *  saved under the new one. */
  async function answerUpdate(libraryOnlyName?: string) {
    if (!ask) return;
    setBusy(true);
    let outcome: PublishOutcome = 'offline';
    try {
      const only = libraryOnlyName !== undefined;
      const unchanged = ask.athletes.filter((a) => only || !ticked[a.id]).map((a) => a.id);
      let plan = ask.plan;
      if (only) {
        plan = { ...ask.plan, name: libraryOnlyName };
        // The builder shows the stored plan again once it is saved, so the
        // new name has to be in the store before the save goes out.
        const rec = getSavedPlans().find((p) => p.id === ask.id);
        if (rec) upsertPlan({ ...rec, plan, updatedAt: '' });
      }
      if (unchanged.length) {
        await keepPreviousFor(
          ask.cloudId,
          unchanged,
          only ? oldName(ask) : fill(t('{name} (previous version)'), { name: ask.plan.name.trim() }),
        );
        refresh();
      }
      outcome = await send(ask.id, plan);
    } catch {
      setStatus('offline');
    } finally {
      setBusy(false);
      setNaming(false);
      ask.done(outcome);
      setAsk(null);
    }
  }

  /** Back to the plan: nothing goes out, nobody's version changes. */
  function cancelAsk() {
    if (!ask || busy) return;
    setNaming(false);
    ask.done('cancelled');
    setAsk(null);
  }

  /** The name the plan has in the library now, before this save. */
  function oldName(a: { cloudId: string; plan: BuilderPlan }): string {
    return lib.rows[a.cloudId]?.title?.trim() || a.plan.name.trim();
  }

  async function answerConflict(choice: ConflictChoice) {
    if (!conflict) return;
    setBusy(true);
    try {
      await resolveConflict(
        conflict.id,
        choice,
        fill(t('{name} (copy)'), { name: conflict.plan.name.trim() }),
      );
      sentRef.current = null;
      setStatus('synced');
    } finally {
      setBusy(false);
      setConflict(null);
    }
  }

  const n = ask ? ask.athletes.filter((a) => ticked[a.id]).length : 0;
  const stamp = conflict ? stampOf(conflict.row.definition) : null;

  const dialogs = (
    <>
      {ask && naming && (
        <NameDialog
          title={t('Name this version')}
          hint={fill(
            t('Your athletes keep “{name}” as it is. This version is saved as a plan of its own, so it needs a different name.'),
            { name: oldName(ask) },
          )}
          initial={ask.plan.name.trim()}
          taken={[oldName(ask), ...getSavedPlans().filter((p) => p.id !== ask.id).map((p) => p.plan.name ?? '')]}
          confirmLabel={t('Save to library only')}
          busy={busy}
          onConfirm={(name) => void answerUpdate(name)}
          onCancel={() => setNaming(false)}
        />
      )}
      {ask && !naming && (
        // A click beside it does nothing: the save has to say who gets it,
        // or Cancel goes back to the plan.
        <Modal onClose={() => {}}>
          <h3 className="font-heading text-lg">
            {fill(t('Assigned to {n} athletes'), { n: ask.athletes.length })}
          </h3>
          <p className="text-sm text-textDim">{t('Who gets this version?')}</p>
          <div className="space-y-2">
            {ask.athletes.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={!!ticked[a.id]}
                  onChange={() => setTicked((cur) => ({ ...cur, [a.id]: !cur[a.id] }))}
                  className="h-4 w-4 accent-[rgb(var(--c-accent))]"
                />
                <span className="font-heading">{a.studentName}</span>
                <span className="text-xs text-textDim">
                  {fill(t('{n} sessions done'), { n: a.doneCount })}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-textDim">
            {t(
              'Their apps update the next time they open. Sessions they already logged keep their ratings and notes. Unticked athletes keep the version they have, as its own plan in your library.',
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              disabled={busy}
              onClick={() => answerUpdate()}
              className="rounded-lg bg-accent px-4 py-2 font-heading text-ink disabled:opacity-50"
            >
              {n === 1
                ? t('Save & update 1 athlete')
                : fill(t('Save & update {n} athletes'), { n })}
            </button>
            <button
              disabled={busy}
              onClick={() => setNaming(true)}
              className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              {t('Save to library only')}
            </button>
            <button
              disabled={busy}
              onClick={cancelAsk}
              title={t('Back to the plan. Nothing is saved.')}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-textDim hover:text-text disabled:opacity-50"
            >
              {t('Cancel')}
            </button>
          </div>
        </Modal>
      )}

      {conflict && (
        <Modal onClose={() => !busy && setConflict(null)}>
          <h3 className="font-heading text-lg">{t('Changed on another device')}</h3>
          <p className="text-sm text-textDim">
            {fill(t('A newer version of this plan was saved on {device} ({when}) while you were editing here.'), {
              device: DEVICE[stamp?.editedOn ?? 'web'],
              when: editedAgo(stamp?.editedAt ?? conflict.row.updated_at, t),
            })}
          </p>
          {(
            [
              ['theirs', t('Use the other version'), t('Your edit here is dropped.')],
              ['mine', t('Keep mine'), t('Replaces the other version everywhere.')],
              ['copy', t('Save mine as a copy'), t('Your version becomes a new plan. Nothing is lost.')],
            ] as [ConflictChoice, string, string][]
          ).map(([choice, title, sub], i) => (
            <button
              key={choice}
              disabled={busy}
              onClick={() => answerConflict(choice)}
              className={`block w-full rounded-lg px-4 py-2.5 text-left disabled:opacity-50 ${
                i === 0 ? 'bg-text text-deep' : 'border border-border'
              }`}
            >
              <span className="block font-heading">{title}</span>
              <span className="block text-xs opacity-75">{sub}</span>
            </button>
          ))}
        </Modal>
      )}
    </>
  );

  return { publish, status, dialogs };
}
