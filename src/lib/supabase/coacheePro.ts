/**
 * Pro is included while Philipp coaches an athlete (2026-10-27). The grant
 * lives in RevenueCat and is made by the app repo's /coachee-pro edge
 * function, which reconciles everyone from the tables. Asking it to run right
 * after a billing change or a disconnect makes the change land now; its daily
 * run catches anything this misses, so a failure here is ignored.
 */
import { supabase } from "./client";

export function syncCoacheePro(): void {
  supabase.functions.invoke("coachee-pro", { body: {} }).catch(() => {});
}
