/**
 * ExercisesView — the coach's exercise library home. Add free-text exercises,
 * assign an optional category (the coach's own, editable set), search/filter,
 * and import/export. Exercises are assigned into plan sessions from the builder.
 */
import { useMemo, useRef, useState } from 'react';
import {
  addBlock,
  addCategory,
  addExercise,
  addExerciseToBlock,
  addManyExercises,
  exportLibraryCsv,
  parseExerciseFile,
  removeBlock,
  removeCategory,
  removeExercise,
  removeExerciseFromBlock,
  renameBlock,
  renameCategory,
  updateExercise,
  useBlocks,
  useCategories,
  useExercises,
  type ExerciseBlock,
  type LibraryExercise,
} from '../lib/library';
import { useT } from '../i18n';

export function ExercisesView() {
  const t = useT();
  const exercises = useExercises();
  const categories = useCategories();
  const blocks = useBlocks();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState('');
  const [draftCat, setDraftCat] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all'); // 'all' | 'uncat' | <category>

  const addDraft = () => {
    if (!draft.trim()) return;
    addExercise(draft, draftCat || undefined);
    setDraft('');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await parseExerciseFile(file);
      const n = addManyExercises(rows);
      alert(n ? `${t('Imported')} ${n} ${n === 1 ? t('exercise') : t('exercises')}.` : t('No new exercises found.'));
    } catch {
      alert(t('Could not read that file. Use a .csv or .xlsx with exercises in the first column (category optional in the second).'));
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (filter === 'uncat' && ex.category) return false;
      if (filter !== 'all' && filter !== 'uncat' && ex.category !== filter) return false;
      if (q && !ex.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, filter, search]);

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg">{t('Exercises')}</h2>
          <p className="text-textDim text-sm">
            {t('Your reusable exercise library. Assign them into plan sessions from the builder.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={onFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t('Import Excel/CSV')}
          </button>
          {exercises.length > 0 && (
            <button
              onClick={() => exportLibraryCsv(exercises)}
              className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              {t('Export')}
            </button>
          )}
        </div>
      </div>

      <CategoryManager categories={categories} />

      <BlockManager blocks={blocks} exercises={exercises} />

      {/* Add exercise */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex flex-wrap gap-2">
          <input
            className="field flex-1 min-w-48"
            placeholder={t('Add an exercise, e.g. 4×50m bi-fins, 3 min rest')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDraft()}
          />
          <select className="field w-auto" value={draftCat} onChange={(e) => setDraftCat(e.target.value)}>
            <option value="">{t('No category')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={addDraft}
            className="glow-accent text-sm bg-accent text-ink rounded-lg px-4 font-heading tracking-wide"
          >
            {t('Add')}
          </button>
        </div>
      </div>

      {/* Filter */}
      {exercises.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field w-auto flex-1 min-w-40"
            placeholder={t('Search exercises')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('All')}
          </FilterPill>
          {categories.map((c) => (
            <FilterPill key={c} active={filter === c} onClick={() => setFilter(c)}>
              {c}
            </FilterPill>
          ))}
          <FilterPill active={filter === 'uncat'} onClick={() => setFilter('uncat')}>
            {t('Uncategorized')}
          </FilterPill>
        </div>
      )}

      {/* List */}
      {exercises.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
          {t('No exercises yet. Add one above, or import a spreadsheet.')}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-textDim text-sm">{t('No exercises match.')}</p>
      ) : (
        <div className="space-y-2">
          {shown.map((ex) => (
            <ExerciseRow key={ex.id} ex={ex} categories={categories} />
          ))}
        </div>
      )}
    </main>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textDim hover:border-accent hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function ExerciseRow({ ex, categories }: { ex: LibraryExercise; categories: string[] }) {
  const t = useT();
  const [desc, setDesc] = useState(ex.description);

  const commit = () => {
    const d = desc.trim();
    if (d && d !== ex.description) updateExercise(ex.id, { description: d });
    else if (!d) setDesc(ex.description);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
      <input
        className="field flex-1 min-w-48"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <select
        className="field w-auto"
        value={ex.category ?? ''}
        onChange={(e) => updateExercise(ex.id, { category: e.target.value || undefined })}
      >
        <option value="">{t('Uncategorized')}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button onClick={() => removeExercise(ex.id)} className="text-red text-sm px-1" title={t('Remove')}>
        ✕
      </button>
    </div>
  );
}

function BlockManager({ blocks, exercises }: { blocks: ExerciseBlock[]; exercises: LibraryExercise[] }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const create = () => {
    if (draft.trim()) {
      addBlock(draft);
      setDraft('');
    }
  };
  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading tracking-wide text-text">{t('Blocks')}</h3>
        <span className="text-textDim text-xs">{t('Reusable groups you drop into a session in one click')}</span>
      </div>
      <div className="flex gap-2">
        <input
          className="field flex-1 min-w-48"
          placeholder={t('New block name, e.g. CO₂ set')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button onClick={create} className="text-sm text-accent border border-border rounded-lg px-4 hover:border-accent">
          {t('Add block')}
        </button>
      </div>
      {blocks.length === 0 ? (
        <p className="text-textDim text-sm">
          {t('No blocks yet. Group exercises you use together (a warm-up, a CO₂ set), then add the whole block to a session at once from the builder.')}
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b) => (
            <BlockRow key={b.id} block={b} exercises={exercises} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockRow({ block, exercises }: { block: ExerciseBlock; exercises: LibraryExercise[] }) {
  const t = useT();
  const [name, setName] = useState(block.name);
  const items = block.exerciseIds
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is LibraryExercise => !!e);
  const inBlock = new Set(block.exerciseIds);

  return (
    <div className="rounded-lg border border-border bg-panel p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="field flex-1 min-w-40"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (n && n !== block.name) renameBlock(block.id, n);
            else if (!n) setName(block.name);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-textDim text-xs">{items.length}</span>
        <button
          onClick={() => confirm(`${t('Delete block')} "${block.name}"?`) && removeBlock(block.id)}
          className="text-red text-sm px-1"
          title={t('Delete block')}
        >
          ✕
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((ex) => (
            <span
              key={ex.id}
              className="group flex items-center gap-1.5 rounded-lg border border-border bg-abyss px-2.5 py-1 text-sm"
            >
              {ex.description}
              <button
                onClick={() => removeExerciseFromBlock(block.id, ex.id)}
                className="text-textDim opacity-0 group-hover:opacity-100 hover:text-red"
                title={t('Remove from block')}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <AddToBlock blockId={block.id} exercises={exercises} inBlock={inBlock} />
    </div>
  );
}

function AddToBlock({
  blockId,
  exercises,
  inBlock,
}: {
  blockId: string;
  exercises: LibraryExercise[];
  inBlock: Set<string>;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return exercises.filter((e) => !inBlock.has(e.id) && (!s || e.description.toLowerCase().includes(s))).slice(0, 8);
  }, [q, exercises, inBlock]);
  const show = focused && matches.length > 0;

  return (
    <div className="relative">
      <input
        className="field w-full"
        placeholder={t('Add an exercise to this block…')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {show && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-panel shadow-lg max-h-52 overflow-auto">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  addExerciseToBlock(blockId, e.id);
                  setQ('');
                }}
                className="block w-full text-left px-3 py-1.5 text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                {e.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryManager({ categories }: { categories: string[] }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const startEdit = (c: string) => {
    setEditing(c);
    setEditVal(c);
  };
  const commitEdit = () => {
    if (editing) renameCategory(editing, editVal);
    setEditing(null);
  };
  const add = () => {
    if (draft.trim()) {
      addCategory(draft);
      setDraft('');
    }
  };
  const del = (c: string) => {
    if (confirm(`${t('Delete category')} "${c}"? ${t('Exercises keep their description but become uncategorized.')}`)) {
      removeCategory(c);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading tracking-wide text-text">{t('Categories')}</h3>
        <span className="text-textDim text-xs">{t('Your own system, fully editable')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) =>
          editing === c ? (
            <input
              key={c}
              autoFocus
              className="field w-32"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <span
              key={c}
              className="group flex items-center gap-1.5 rounded-lg border border-border bg-abyss px-2.5 py-1.5 text-sm"
            >
              {c}
              <button
                onClick={() => startEdit(c)}
                className="text-textDim opacity-0 group-hover:opacity-100 hover:text-accent"
                title={t('Rename')}
              >
                ✎
              </button>
              <button
                onClick={() => del(c)}
                className="text-textDim opacity-0 group-hover:opacity-100 hover:text-red"
                title={t('Delete category')}
              >
                ✕
              </button>
            </span>
          ),
        )}
        <input
          className="field w-36"
          placeholder={t('+ Add category')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          onBlur={add}
        />
      </div>
    </div>
  );
}
