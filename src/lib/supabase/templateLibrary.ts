/**
 * Cloud side of the shared session templates: the SAME rows the phone app
 * reads and writes (`plans` rows whose definition is { format:
 * 'e08template', version, template }, app
 * src/services/coachStudent/coachTemplates.ts). The list itself arrives with
 * the plan library's sync (planLibrary.ts `templates`); this file parses it,
 * writes rows, sends a template to an athlete and moves the old browser-only
 * templates in.
 *
 * Like the phone, the last save wins and a delete removes the row: a
 * template is small and edited by one coach, so there is no conflict dialog.
 */
import { useEffect, useMemo } from 'react';
import { removeSessionTemplate, useSessionTemplates, type SessionTemplate } from '../library';
import {
  buildPlannedSessions,
  isInboxFor,
  mergeIntoInbox,
  newInboxPlan,
  type Tr,
} from '../coachTemplates/deliver';
import type { Plan } from '../coachTemplates/deps';
import {
  templateDefinition,
  templateFromDefinition,
  type CoachTemplate,
} from '../coachTemplates/model';
import { migratedId, templateFromLocal } from '../coachTemplates/portal';
import { missingTargets, resolveTemplate, type PBMap } from '../coachTemplates/resolve';
import { supabase } from './client';
import {
  assignPlan,
  createPlan,
  deletePlan,
  listMyPlans,
  updatePlan,
  type Json,
} from './coachData';
import { syncLibrary, useLibrary, type LibraryRow } from './planLibrary';

export interface SharedTemplate {
  cloudId: string;
  template: CoachTemplate;
  updatedAt: string;
}

/** The template rows as templates; a row that does not parse is left out. */
export function parseTemplateRows(rows: LibraryRow[]): SharedTemplate[] {
  const out: SharedTemplate[] = [];
  for (const r of rows) {
    const template = templateFromDefinition(r.definition);
    if (template) out.push({ cloudId: r.id, template, updatedAt: r.updated_at });
  }
  return out;
}

/** The coach's shared templates, live with the plan library's sync. */
export function useSharedTemplates(): SharedTemplate[] {
  const rows = useLibrary().templates;
  return useMemo(() => parseTemplateRows(rows), [rows]);
}

/** Create or update a template's row, then refresh the list. An update that
 *  matches nothing (deleted on the phone meanwhile) creates a fresh row. */
export async function saveTemplate(
  template: CoachTemplate,
  cloudId: string | null,
): Promise<string> {
  const definition = templateDefinition(template) as unknown as Json;
  let id: string | null = null;
  if (cloudId) id = (await updatePlan(cloudId, { title: template.name, definition }))?.id ?? null;
  if (!id) id = (await createPlan(template.name, definition)).id;
  await syncLibrary();
  return id;
}

export async function deleteTemplate(cloudId: string): Promise<void> {
  await deletePlan(cloudId);
  await syncLibrary();
}

// ── Send to athlete ─────────────────────────────────────────────────────────

/**
 * Send a template to one athlete on the given dates: the phone's own delivery
 * (app coachTemplates.sendTemplate). The sessions are appended to that
 * athlete's "Sessions from <coach>" plan, created on first use, and the plan
 * is (re)assigned, which is what the athlete's app listens to. Returns how
 * many sessions were added (a repeated send adds none).
 */
export async function sendTemplate(params: {
  template: CoachTemplate;
  cloudId: string | null;
  studentId: string;
  pbs: PBMap;
  /** Hand-set values for PB targets of an older template (block id → m or s). */
  overrides: Record<string, number>;
  dates: string[];
  coachName: string;
  t: Tr;
}): Promise<number> {
  const { template, studentId, dates, coachName, t } = params;
  if (!dates.length) throw new Error('No dates.');
  const resolved = resolveTemplate(template, params.pbs, params.overrides);
  if (missingTargets(resolved).length) throw new Error('A target has no value.');
  const items = buildPlannedSessions(template, resolved, dates, {
    imperial: false,
    author: coachName,
    t,
  });
  const title = coachName.trim()
    ? t('deliver.inboxTitle', { coach: coachName.trim() })
    : t('deliver.inboxTitleNoName');

  const rows = await listMyPlans();
  const row = rows.find((r) => isInboxFor(r.definition, studentId));
  const current = row ? (row.definition as unknown as Plan) : newInboxPlan(studentId, title);
  const { plan, added } = mergeIntoInbox(current, items);
  const definition = plan as unknown as Json;
  const saved = row
    ? await updatePlan(row.id, { title: row.title || plan.name, definition })
    : await createPlan(plan.name, definition);
  if (!saved) throw new Error('The athlete’s plan could not be saved.');
  await assignPlan(saved.id, studentId);

  // The library shows how often a template was sent, on both sides.
  await saveTemplate({ ...template, useCount: template.useCount + 1 }, params.cloudId).catch(
    () => {},
  );
  return added;
}

// ── The old browser-only templates ──────────────────────────────────────────

/**
 * Move the browser-only "Builder templates" into the shared library, once.
 * Each one is uploaded as a text template under an id fixed by its local id,
 * and its local copy is removed only after the cloud has confirmed the row:
 * a failed upload leaves the local template where it was, and the next run
 * tries it again without making a second copy.
 */
export async function migrateLocalTemplates(
  local: SessionTemplate[],
  shared: SharedTemplate[],
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;
  const have = new Set(shared.map((s) => s.template.id));
  for (const tpl of local) {
    try {
      if (!have.has(migratedId(tpl.id))) {
        const template = templateFromLocal(tpl);
        const definition = templateDefinition(template) as unknown as Json;
        const row = await createPlan(template.name, definition);
        // Read it back: only a row the cloud returns counts as saved.
        const { data, error } = await supabase
          .from('plans')
          .select('id, definition')
          .eq('id', row.id)
          .maybeSingle();
        if (error || templateFromDefinition(data?.definition)?.id !== template.id) {
          throw new Error(error?.message ?? 'not confirmed');
        }
      }
      removeSessionTemplate(tpl.id);
      moved++;
    } catch {
      failed++;
    }
  }
  if (moved) await syncLibrary();
  return { moved, failed };
}

let migrating = false;

/** Runs the move whenever a signed-in coach has browser-only templates and
 *  the shared list has loaded (so an earlier upload is recognised). One run
 *  at a time. A template that failed is tried again when the page loads or
 *  the local list changes, never in a loop: nothing here changes on failure. */
export function useTemplateMigration(active: boolean): void {
  const local = useSessionTemplates();
  const lib = useLibrary();
  const shared = useSharedTemplates();
  const loaded = !!lib.lastSyncAt && lib.status === 'idle';
  useEffect(() => {
    if (!active || !loaded || !local.length || migrating) return;
    migrating = true;
    migrateLocalTemplates(local, shared)
      .catch(() => {})
      .finally(() => {
        migrating = false;
      });
    // `shared` and `local` are read as of this run; the count is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loaded, local.length]);
}
