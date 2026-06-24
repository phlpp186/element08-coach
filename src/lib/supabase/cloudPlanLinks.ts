/**
 * cloudPlanLinks — maps a portal SavedPlan id → the cloud plan row it created
 * (+ the stable app-internal definition.id). Mirrors the app's useCoachPlanLinks
 * so re-assigning the same portal plan UPDATES the existing cloud plan + its
 * definition.id rather than creating a duplicate the athlete sees twice.
 * Browser-local (localStorage); if cleared, the app's definition.id dedup still
 * catches duplicates server-side.
 */
const KEY = 'element08.coach.cloudPlanLinks';

export interface CloudPlanLink {
  cloudPlanId: string;
  /** Stable app-internal Plan.id reused across re-assigns. */
  defId: number;
}

function readAll(): Record<string, CloudPlanLink> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CloudPlanLink>) : {};
  } catch {
    return {};
  }
}

export function getCloudPlanLink(savedPlanId: string): CloudPlanLink | null {
  return readAll()[savedPlanId] ?? null;
}

export function setCloudPlanLink(savedPlanId: string, link: CloudPlanLink): void {
  try {
    const all = readAll();
    all[savedPlanId] = link;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked — the server-side definition.id dedup still applies */
  }
}
