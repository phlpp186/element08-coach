/**
 * pushLinkedPlanUpdate — when a coach edits a plan that has ALREADY been assigned
 * (so a cloud `plans` row exists), push the current definition back up so the
 * assigned athlete AND the coach Overview reflect the edit. Without this, adding
 * weeks to a plan later only updated the local browser draft, so the Overview
 * (which reads the cloud definition via getPlan) kept showing the plan's
 * original one-week span and marked it "ended".
 *
 * No-op when the plan was never assigned (no cloud link) — there's nothing to
 * sync until the first assign creates the cloud plan. Best-effort: it awaits the
 * update but callers fire-and-forget so an offline save still succeeds locally;
 * the next explicit save (or re-assign) re-syncs. Reuses the link's stable defId
 * so the existing cloud row is updated in place, never duplicated — mirroring
 * AssignToConnectedButton's create-or-update path.
 */
import type { BuilderPlan } from '../e08plan';
import { buildPlanFile } from '../e08plan';
import { updatePlan } from './coachData';
import { getCloudPlanLink } from './cloudPlanLinks';
import { planFileToDefinition } from './planDefinition';

export async function pushLinkedPlanUpdate(recId: string, plan: BuilderPlan): Promise<void> {
  const link = getCloudPlanLink(recId);
  if (!link?.cloudPlanId) return;
  const file = buildPlanFile(plan);
  const definition = planFileToDefinition(file, link.defId);
  await updatePlan(link.cloudPlanId, { title: file.metadata.title, definition });
}
