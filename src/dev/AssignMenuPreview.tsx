/** Dev-only harness: the Library's plan panel layout (a scrolling box) with
 *  the Assign button inside, without a Supabase login. Shows that the athlete
 *  list is not cut off by the panel. ?preview=assignmenu. Not routed. */
import { useState } from "react";
import { AssignMenu } from "../components/AssignToConnectedButton";

const ATHLETES = ["Mara", "Jonas", "Aiko", "Luca", "Noor", "Sven", "Ines", "Tom"].map((name, i) => ({
  studentId: `s${i}`,
  name,
}));

export function AssignMenuPreview() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <div className="mx-auto flex max-w-5xl justify-end p-4">
      <aside className="board w-[21rem] max-h-[70vh] space-y-4 overflow-y-auto p-4">
        <h3 className="font-heading text-base text-text">CWT Base 8 weeks</h3>
        <p className="text-sm text-textDim">Training · 8 weeks · 24 sessions</p>
        <div className="h-40 rounded-lg border border-dashed border-border" />
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button className="pill pill-on btn-raised px-4 py-1.5 text-sm">Edit</button>
          <AssignMenu
            ready
            menuBelow
            onMessage={setMsg}
            athletes={ATHLETES}
            loading={false}
            assign={async (_id, name) => ({ text: `Assigned to ${name} ✓`, ok: true })}
          />
          <button className="pill px-3 py-1.5 text-sm">Duplicate</button>
          <button className="ml-auto text-sm text-red">Delete</button>
          {msg && <p className={`w-full text-xs ${msg.ok ? "text-recover" : "text-red"}`}>{msg.text}</p>}
        </div>
      </aside>
    </div>
  );
}
