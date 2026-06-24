/**
 * planFileToDefinition — convert a portal .e08plan file into the EXACT cloud
 * `plans.definition` shape the app stores and reads. This MUST mirror the app's
 * applyImportedPlanFile (Deeptimerapp/src/lib/planSharing/io.ts), because the app
 * reads plans.definition DIRECTLY as a `Plan` object (coachStudentSync casts
 * `definition as Plan`) — it does NOT run the import conversion on cloud plans. So
 * we produce a full Plan here, not the .e08plan file wrapper.
 *
 * The portal's PlanFileV1.content is exactly Omit<Plan,'id'|'active'|'createdAt'|
 * 'author'|'lockedAt'|'importedFrom'> (verified against the app schema), so
 * spreading it + stamping those fields reconstructs the app Plan precisely.
 *
 * `defId` is the app-internal Plan.id (a number). Keep it STABLE across re-assigns
 * of the same portal plan so the app's dedup (useCoachPlanLinks fallback matches a
 * cloud plan by definition.id) reuses one plan instead of duplicating.
 *
 * Keep in lockstep with applyImportedPlanFile if the app bumps the plan schema.
 */
import type { PlanFileV1 } from '../e08plan';
import type { Json } from './coachData';

export function planFileToDefinition(file: PlanFileV1, defId: number): Json {
  const now = new Date().toISOString();
  return {
    ...file.content,
    id: defId,
    active: false,
    createdAt: now,
    author: file.metadata.author,
    lockedAt: now,
    importedFrom: { coach: file.metadata.author, at: now },
    schemaVersion: 3,
  } as unknown as Json;
}
