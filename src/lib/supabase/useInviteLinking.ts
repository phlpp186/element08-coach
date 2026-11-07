/**
 * Links a notebook athlete to the app account that redeems the invite code
 * sent from their page, without the coach doing anything. Runs for signed-in
 * coaches while a code is pending: on load, when the tab regains focus, and on
 * every coach_student change (a pairing is an insert there, and accept_invite
 * marks the invite used in the same transaction).
 */
import { useEffect } from 'react';
import { getAthletes, linkAthlete, useAthletes } from '../store';
import { inviteStatuses, subscribeToTables, unsubscribeChannel } from './coachData';

async function checkPending(): Promise<void> {
  const waiting = getAthletes().filter((a) => a.invite && !a.studentId);
  if (waiting.length === 0) return;
  const statuses = await inviteStatuses(waiting.map((a) => a.invite!.code));
  for (const s of statuses) {
    if (!s.usedBy) continue;
    const a = waiting.find((w) => w.invite?.code === s.code);
    if (a) linkAthlete(a.id, s.usedBy);
  }
}

export function useInviteLinking(enabled: boolean): void {
  // Re-arm only when the set of pending codes changes, not on every edit.
  const pending = useAthletes()
    .filter((a) => a.invite && !a.studentId)
    .map((a) => a.invite!.code)
    .sort()
    .join(',');

  useEffect(() => {
    if (!enabled || !pending) return;
    const run = () => void checkPending().catch(() => {});
    run();
    const ch = subscribeToTables(['coach_student'], run);
    window.addEventListener('focus', run);
    return () => {
      unsubscribeChannel(ch);
      window.removeEventListener('focus', run);
    };
  }, [enabled, pending]);
}
