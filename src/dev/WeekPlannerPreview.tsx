/** Dev-only harness: the athlete page's week planner without a Supabase
 *  login (nothing loads or sends; the draft lives in this browser).
 *  ?preview=weekplanner. Not routed. */
import { WeekPlanner } from "../components/week/WeekPlanner";
import { AuthProvider } from "../lib/supabase/AuthProvider";

export function WeekPlannerPreview() {
  return (
    <AuthProvider>
      <div className="mx-auto max-w-5xl p-4">
        <WeekPlanner studentId="preview-athlete" name="Mara" pbs={[]} />
      </div>
    </AuthProvider>
  );
}
