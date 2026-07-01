/**
 * ExercisesView — the coach's exercise library home. Add free-text exercises,
 * assign an optional (colour-coded) category, group them into reusable Blocks,
 * search/filter, and import/export. Exercises are dropped into plan sessions
 * from the builder.
 *
 * Layout: three clearly-separated zones — CATEGORIES (the vocabulary), BLOCKS
 * (reusable groups), and EXERCISE LIBRARY (the list + its add bar). Each zone
 * has a titled header, and the surface ramp (page → recessed item → raised pill)
 * plus category colour dots keep the levels distinct.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
import { categoryColor } from '../lib/categoryColor';
import { CatDot } from '../components/CatDot';

/** Titled zone: an accent tick + heading + optional hint over a hairline rule,
 *  so each functional area reads as its own section. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-4 w-1 rounded-full bg-accent" />
          <h3 className="font-heading text-base tracking-wide text-text">{title}</h3>
        </div>
        {hint && <span className="shrink-0 text-right text-xs text-textDim">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const CREATE_BAR = 'flex flex-wrap gap-2 rounded-xl border border-accent/25 bg-accent/5 p-3';

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
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-9">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl">{t('Exercises')}</h2>
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

      <Section title={t('Exercise library')} hint={`${exercises.length} ${exercises.length === 1 ? t('exercise') : t('exercises')}`}>
        {/* Add to library */}
        <div className={CREATE_BAR}>
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

        {/* Search + filter */}
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
              <FilterPill key={c} color={categoryColor(c)} active={filter === c} onClick={() => setFilter(c)}>
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
      </Section>
    </main>
  );
}

function FilterPill({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textDim hover:border-accent hover:text-text'
      }`}
    >
      {color && (
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {children}
    </button>
  );
}

/** Compact one-line card (category-coloured left edge + description + category
 *  label). Click to expand the inline editor (description, category, delete). */
function ExerciseRow({ ex, categories }: { ex: LibraryExercise; categories: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(ex.description);

  const commit = () => {
    const d = desc.trim();
    if (d && d !== ex.description) updateExercise(ex.id, { description: d });
    else if (!d) setDesc(ex.description);
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-panel"
      style={{ borderLeft: `3px solid ${categoryColor(ex.category)}` }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-abyss/50"
      >
        <span className="min-w-0 flex-1 truncate text-text">{ex.description}</span>
        <span
          className="shrink-0 text-xs"
          style={{ color: ex.category ? categoryColor(ex.category) : 'rgb(var(--c-textDim))' }}
        >
          {ex.category ?? t('Uncategorized')}
        </span>
        <span className="shrink-0 text-textDim">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <input
            className="field"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => removeExercise(ex.id)}
              className="ml-auto px-2 text-sm text-red hover:underline"
              title={t('Remove')}
            >
              {t('Remove')}
            </button>
          </div>
        </div>
      )}
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
    <Section title={t('Blocks')} hint={t('Reusable groups you drop into a session in one click')}>
      <div className={CREATE_BAR}>
        <input
          className="field flex-1 min-w-48"
          placeholder={t('New block name, e.g. CO₂ set')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button
          onClick={create}
          className="text-sm text-accent border border-accent/60 rounded-lg px-4 hover:bg-accent/10"
        >
          {t('Add block')}
        </button>
      </div>
      {blocks.length === 0 ? (
        <p className="text-textDim text-sm">
          {t('No blocks yet. Group exercises you use together (a warm-up, a CO₂ set), then add the whole block to a session at once from the builder.')}
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <BlockRow key={b.id} block={b} index={i} exercises={exercises} />
          ))}
        </div>
      )}
    </Section>
  );
}

/** Collapsed by default (name + exercise-count + a category-dot preview), like
 *  an athlete card, so a long block list stays scannable. Click to expand the
 *  editor (rename, chips, add-to-block, delete). */
function BlockRow({
  block,
  index,
  exercises,
}: {
  block: ExerciseBlock;
  index: number;
  exercises: LibraryExercise[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(block.name);
  const items = block.exerciseIds
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is LibraryExercise => !!e);
  const inBlock = new Set(block.exerciseIds);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-abyss">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-panel/40"
      >
        <span className="w-4 shrink-0 font-heading text-xs text-textDim">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-text">{block.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-textDim">
            <span>
              {items.length} {items.length === 1 ? t('exercise') : t('exercises')}
            </span>
            {items.length > 0 && (
              <span className="flex items-center gap-1">
                {items.slice(0, 8).map((ex) => (
                  <CatDot key={ex.id} name={ex.category} size={7} />
                ))}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-textDim">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border px-3 py-3">
          <input
            className="field font-heading"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== block.name) renameBlock(block.id, n);
              else if (!n) setName(block.name);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {items.map((ex) => (
                <span
                  key={ex.id}
                  className="group flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 text-sm"
                >
                  <CatDot name={ex.category} size={7} />
                  {ex.description}
                  <button
                    onClick={() => removeExerciseFromBlock(block.id, ex.id)}
                    className="text-textDim hover:text-red"
                    title={t('Remove from block')}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <AddToBlock blockId={block.id} exercises={exercises} inBlock={inBlock} />
          <button
            onClick={() => confirm(`${t('Delete block')} "${block.name}"?`) && removeBlock(block.id)}
            className="text-red text-xs hover:underline"
          >
            {t('Delete block')}
          </button>
        </div>
      )}
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
                className="flex w-full items-center gap-2 text-left px-3 py-1.5 text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                <CatDot name={e.category} size={7} />
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
    <Section title={t('Categories')} hint={t('Your own colour-coded tags, fully editable')}>
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
              className="group flex items-center gap-1.5 rounded-full border border-border bg-abyss px-2.5 py-1.5 text-sm"
            >
              <CatDot name={c} />
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
    </Section>
  );
}
