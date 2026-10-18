/**
 * Saving a plan from the builder into the shared library
 * (lib/supabase/planLibrary.ts), with the two questions a save can raise:
 *
 * - The plan is assigned: which athletes get this version? Unticked ones are
 *   moved onto a frozen copy of the version they have ("… (previous version)").
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
  type LibraryRow,
} from '../lib/supabase/planLibrary';
import type { CoachAssignment } from '../lib/supabase/coachData';
import { editedAgo } from '../views/PlansView';
import { fill, useT } from '../i18n';

export type LibraryStatus = 'idle' | 'saving' | 'synced' | 'offline' | 'conflict';
export type PublishOutcome = 'ok' | 'conflict' | 'offline';

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
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-panel p-5"
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

  async function answerUpdate(everyone: boolean) {
    if (!ask) return;
    setBusy(true);
    let outcome: PublishOutcome = 'offline';
    try {
      // "Library only" leaves every athlete on the version they have.
      const unchanged = ask.athletes.filter((a) => !everyone || !ticked[a.id]).map((a) => a.id);
      if (unchanged.length) {
        await keepPreviousFor(
          ask.cloudId,
          unchanged,
          fill(t('{name} (previous version)'), { name: ask.plan.name.trim() }),
        );
        refresh();
      }
      outcome = await send(ask.id, ask.plan);
    } catch {
      setStatus('offline');
    } finally {
      setBusy(false);
      ask.done(outcome);
      setAsk(null);
    }
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
      {ask && (
        // No dismiss: the save has to say who gets it.
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
              onClick={() => answerUpdate(true)}
              className="rounded-lg bg-accent px-4 py-2 font-heading text-ink disabled:opacity-50"
            >
              {n === 1
                ? t('Save & update 1 athlete')
                : fill(t('Save & update {n} athletes'), { n })}
            </button>
            <button
              disabled={busy}
              onClick={() => answerUpdate(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              {t('Save to library only')}
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
