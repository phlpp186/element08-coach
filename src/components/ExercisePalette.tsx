import { useRef, useState } from 'react';
import { exportLibraryCsv, parseExerciseFile, useLibrary } from '../lib/library';

/** The coach's saved exercise library. Drag a chip into a session's exercise
 *  list, or (with a session open) click it to add. Persists in localStorage. */
export function ExercisePalette({ onUse }: { onUse: (description: string) => void }) {
  const lib = useLibrary();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const descs = await parseExerciseFile(file);
      const n = lib.addMany(descs);
      alert(n ? `Imported ${n} exercise${n === 1 ? '' : 's'}.` : 'No new exercises found in the first column.');
    } catch {
      alert('Could not read that file. Use a .csv or .xlsx with exercises in the first column.');
    }
  };

  const addDraft = () => {
    if (draft.trim()) {
      lib.add(draft);
      setDraft('');
    }
  };

  return (
    <section className="rounded-xl border border-border bg-panel p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-lg flex items-center gap-2">
          <span className="text-textDim text-sm">{open ? '▾' : '▸'}</span> My exercises
        </button>
        <span className="text-textDim text-xs">{lib.items.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            Import Excel/CSV
          </button>
          {lib.items.length > 0 && (
            <button
              onClick={() => exportLibraryCsv(lib.items)}
              className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              Export
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              placeholder="Add an exercise, e.g. 4×50m bi-fins, 3 min rest"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDraft()}
            />
            <button
              onClick={addDraft}
              className="text-sm text-accent border border-border rounded-lg px-3 hover:border-accent"
            >
              Add
            </button>
          </div>

          {lib.items.length === 0 ? (
            <p className="text-textDim text-sm">
              No saved exercises yet. Add them above, or import a spreadsheet (first column).
            </p>
          ) : (
            <>
              <p className="text-textDim text-xs">Drag a chip into a session, or open a session and click it.</p>
              <div className="flex flex-wrap gap-2">
                {lib.items.map((ex) => (
                  <span
                    key={ex.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', ex.description);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onUse(ex.description)}
                    className="group flex items-center gap-1.5 rounded-lg border border-border bg-abyss px-2.5 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:border-accent"
                    title="Drag into a session, or click to add to the open session"
                  >
                    {ex.description}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        lib.remove(ex.id);
                      }}
                      className="text-textDim opacity-0 group-hover:opacity-100 hover:text-red"
                      title="Remove from library"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
