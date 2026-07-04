/**
 * ExercisePalette — the builder's search-first exercise finder. Instead of
 * dumping the whole library on screen, it shows a search box plus two short
 * shelves (Recent, Pinned) with the full library one click away in a drawer.
 * Ranking is usage-weighted (librarySearch), and nothing is capped — long
 * lists render incrementally. "/" focuses the search from anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  blockExercises,
  togglePinned,
  useBlocks,
  useCategories,
  useExercises,
  type ExerciseBlock,
  type LibraryExercise,
} from '../lib/library';
import { rankExercises } from '../lib/librarySearch';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { categoryColor } from '../lib/categoryColor';
import { CatDot, CatDots } from './CatDot';
import { LoadMore } from './LoadMore';

export interface AssignTarget {
  id: string;
  label: string;
  /** Group heading in the multi-assign picker (e.g. "Base · Week 3"). */
  group: string;
  /** 0 = Mon … 6 = Sun, or null for day-based plans. */
  dow: number | null;
}

const SHELF_SIZE = 6;
const CHUNK = 80;

export function ExercisePalette({
  onUse,
  targets,
  onAssign,
}: {
  onUse: (descriptions: string[]) => void;
  targets: AssignTarget[];
  onAssign: (sessionIds: string[], descriptions: string[]) => void;
}) {
  const t = useT();
  const exercises = useExercises();
  const blocks = useBlocks();
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [assigning, setAssigning] = useState<{ name: string; descriptions: string[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the palette search unless the coach is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeCount = useMemo(() => exercises.filter((e) => !e.archived).length, [exercises]);

  const q = search.trim();
  const results = useMemo(() => (q ? rankExercises(exercises, q) : []), [exercises, q]);
  const blockResults = useMemo(
    () =>
      q
        ? blocks.filter((b) => b.exerciseIds.length > 0 && b.name.toLowerCase().includes(q.toLowerCase()))
        : [],
    [blocks, q],
  );

  const recent = useMemo(
    () =>
      exercises
        .filter((e) => !e.archived && e.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
        .slice(0, SHELF_SIZE),
    [exercises],
  );
  const pinned = useMemo(() => exercises.filter((e) => !e.archived && e.pinned), [exercises]);
  const shelfBlocks = useMemo(() => blocks.filter((b) => b.exerciseIds.length > 0).slice(0, 4), [blocks]);

  const useBlock = (b: ExerciseBlock) => onUse(blockExercises(b).map((e) => e.description));

  return (
    <section className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-base">{t('Exercise library')}</h3>
        <span className="text-textDim text-xs">{activeCount}</span>
        <button
          onClick={() => navigate('/exercises')}
          className="ml-auto text-sm text-accent border border-border rounded-lg px-3 py-1.5 hover:border-accent"
        >
          {t('Manage exercises')}
        </button>
      </div>

      {activeCount === 0 ? (
        <p className="text-textDim text-sm">
          {t('No exercises yet.')}{' '}
          <button onClick={() => navigate('/exercises')} className="text-accent hover:underline">
            {t('Add some in the Exercises tab')}
          </button>
          {t(', then drag or click them into a session here.')}
        </p>
      ) : (
        <>
          <div className="relative">
            <input
              ref={searchRef}
              className="field w-full pr-10"
              placeholder={t('Find an exercise or block…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 text-xs text-textDim">
              /
            </span>
          </div>

          {q ? (
            <SearchResults
              results={results}
              blockResults={blockResults}
              onUse={onUse}
              onUseBlock={useBlock}
              onAssignOne={(name, descriptions) => setAssigning({ name, descriptions })}
            />
          ) : (
            <>
              {shelfBlocks.length > 0 && (
                <Shelf title={t('Blocks')}>
                  {shelfBlocks.map((b) => (
                    <ShelfRow
                      key={b.id}
                      icon={<span className="text-accent">▦</span>}
                      label={b.name}
                      meta={String(b.exerciseIds.length)}
                      onAdd={() => useBlock(b)}
                      onAssign={() =>
                        setAssigning({ name: b.name, descriptions: blockExercises(b).map((e) => e.description) })
                      }
                    />
                  ))}
                </Shelf>
              )}
              {recent.length > 0 && (
                <Shelf title={t('Recent')}>
                  {recent.map((ex) => (
                    <ExerciseShelfRow key={ex.id} ex={ex} onUse={onUse} onAssign={setAssigning} t={t} />
                  ))}
                </Shelf>
              )}
              {pinned.length > 0 && (
                <Shelf title={t('Pinned')}>
                  {pinned.map((ex) => (
                    <ExerciseShelfRow key={ex.id} ex={ex} onUse={onUse} onAssign={setAssigning} t={t} />
                  ))}
                </Shelf>
              )}
              {recent.length === 0 && pinned.length === 0 && (
                <p className="text-textDim text-xs">
                  {t('Exercises you use or pin will appear here for one-tap reuse.')}
                </p>
              )}
              <button onClick={() => setDrawer(true)} className="text-sm font-heading text-accent hover:underline">
                {t('Browse library')} ({activeCount}) →
              </button>
            </>
          )}
        </>
      )}

      {drawer && (
        <BrowseDrawer
          onClose={() => setDrawer(false)}
          onUse={onUse}
          onAssignOne={(name, descriptions) => setAssigning({ name, descriptions })}
        />
      )}
      {assigning && (
        <AssignModal
          name={assigning.name}
          descriptions={assigning.descriptions}
          targets={targets}
          onAssign={onAssign}
          onClose={() => setAssigning(null)}
        />
      )}
    </section>
  );
}

// ── shelves ──────────────────────────────────────────────────────────────────

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-textDim">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ShelfRow({
  icon,
  label,
  meta,
  onAdd,
  onAssign,
  draggable,
  dragText,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  onAdd: () => void;
  onAssign: () => void;
  draggable?: boolean;
  dragText?: string;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-abyss/60 hover:bg-abyss">
      <span
        className={`flex min-w-0 flex-1 items-center gap-2 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                e.dataTransfer.setData('text/plain', dragText ?? label);
                e.dataTransfer.effectAllowed = 'copy';
              }
            : undefined
        }
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-text">{label}</span>
      </span>
      {meta && <span className="shrink-0 text-xs text-textDim tabular-nums">{meta}</span>}
      <button
        onClick={onAssign}
        className="shrink-0 px-1 text-textDim opacity-0 group-hover:opacity-100 hover:text-accent"
        title="⋯"
      >
        ⋯
      </button>
      <button onClick={onAdd} className="shrink-0 px-1 font-heading text-accent" title="+">
        ＋
      </button>
    </div>
  );
}

function ExerciseShelfRow({
  ex,
  onUse,
  onAssign,
  t,
}: {
  ex: LibraryExercise;
  onUse: (d: string[]) => void;
  onAssign: (a: { name: string; descriptions: string[] }) => void;
  t: (s: string) => string;
}) {
  const meta = ex.useCount ? `${ex.useCount}×` : t('new');
  return (
    <ShelfRow
      icon={<CatDot name={ex.categories?.[0]} size={8} />}
      label={ex.description}
      meta={meta}
      draggable
      dragText={ex.description}
      onAdd={() => onUse([ex.description])}
      onAssign={() => onAssign({ name: ex.description, descriptions: [ex.description] })}
    />
  );
}

// ── search results (inline, replaces the shelves while typing) ───────────────

function SearchResults({
  results,
  blockResults,
  onUse,
  onUseBlock,
  onAssignOne,
}: {
  results: LibraryExercise[];
  blockResults: ExerciseBlock[];
  onUse: (d: string[]) => void;
  onUseBlock: (b: ExerciseBlock) => void;
  onAssignOne: (name: string, descriptions: string[]) => void;
}) {
  const t = useT();
  const [limit, setLimit] = useState(CHUNK);
  useEffect(() => setLimit(CHUNK), [results]);

  if (results.length === 0 && blockResults.length === 0)
    return <p className="text-textDim text-sm">{t('No exercises match.')}</p>;

  return (
    <div className="max-h-96 space-y-0.5 overflow-auto">
      {blockResults.map((b) => (
        <ShelfRow
          key={b.id}
          icon={<span className="text-accent">▦</span>}
          label={b.name}
          meta={String(b.exerciseIds.length)}
          onAdd={() => onUseBlock(b)}
          onAssign={() => onAssignOne(b.name, blockExercises(b).map((e) => e.description))}
        />
      ))}
      {results.slice(0, limit).map((ex) => (
        <ShelfRow
          key={ex.id}
          icon={<CatDot name={ex.categories?.[0]} size={8} />}
          label={ex.description}
          meta={ex.useCount ? `${ex.useCount}×` : undefined}
          draggable
          dragText={ex.description}
          onAdd={() => onUse([ex.description])}
          onAssign={() => onAssignOne(ex.description, [ex.description])}
        />
      ))}
      {results.length > limit && <LoadMore onMore={() => setLimit((l) => l + CHUNK)} />}
    </div>
  );
}

// ── browse drawer (the full library, on demand) ──────────────────────────────

function BrowseDrawer({
  onClose,
  onUse,
  onAssignOne,
}: {
  onClose: () => void;
  onUse: (d: string[]) => void;
  onAssignOne: (name: string, descriptions: string[]) => void;
}) {
  const t = useT();
  const exercises = useExercises();
  const categories = useCategories();
  const blocks = useBlocks();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [limit, setLimit] = useState(CHUNK);
  useEffect(() => setLimit(CHUNK), [q, filter]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exercises) {
      if (e.archived) continue;
      for (const c of e.categories ?? []) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [exercises]);

  const shown = useMemo(() => {
    let base = rankExercises(exercises, q);
    if (filter !== 'all') base = base.filter((e) => e.categories?.includes(filter));
    return base;
  }, [exercises, q, filter]);

  const nonEmptyBlocks = useMemo(() => blocks.filter((b) => b.exerciseIds.length > 0), [blocks]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col gap-3 border-l border-border bg-deep p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base">{t('Browse library')}</h3>
          <button onClick={onClose} className="ml-auto px-1 text-textDim hover:text-text" title={t('Close')}>
            ✕
          </button>
        </div>
        <input
          autoFocus
          className="field w-full"
          placeholder={t('Search exercises')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('All')}
          </FilterChip>
          {categories
            .filter((c) => (catCounts.get(c) ?? 0) > 0)
            .map((c) => (
              <FilterChip key={c} color={categoryColor(c)} active={filter === c} onClick={() => setFilter(c)}>
                {c} <span className="text-textDim">{catCounts.get(c)}</span>
              </FilterChip>
            ))}
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto">
          {filter === 'all' && !q && nonEmptyBlocks.length > 0 && (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-textDim">{t('Blocks')}</p>
              {nonEmptyBlocks.map((b) => (
                <ShelfRow
                  key={b.id}
                  icon={<span className="text-accent">▦</span>}
                  label={b.name}
                  meta={String(b.exerciseIds.length)}
                  onAdd={() => onUse(blockExercises(b).map((e) => e.description))}
                  onAssign={() => onAssignOne(b.name, blockExercises(b).map((e) => e.description))}
                />
              ))}
              <p className="mb-1 mt-3 text-xs uppercase tracking-wide text-textDim">{t('Exercises')}</p>
            </>
          )}
          {shown.length === 0 ? (
            <p className="text-textDim text-sm">{t('No exercises match.')}</p>
          ) : (
            <>
              {shown.slice(0, limit).map((ex) => (
                <DrawerRow key={ex.id} ex={ex} onUse={onUse} onAssignOne={onAssignOne} t={t} />
              ))}
              {shown.length > limit && <LoadMore onMore={() => setLimit((l) => l + CHUNK)} />}
            </>
          )}
        </div>
        <p className="text-xs text-textDim">
          {t('Drag a row into a session, ＋ adds to the open one, ⋯ assigns to many, ☆ pins.')}
        </p>
      </div>
    </div>
  );
}

function DrawerRow({
  ex,
  onUse,
  onAssignOne,
  t,
}: {
  ex: LibraryExercise;
  onUse: (d: string[]) => void;
  onAssignOne: (name: string, descriptions: string[]) => void;
  t: (s: string) => string;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-abyss/60 hover:bg-abyss">
      <span
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', ex.description);
          e.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <CatDots names={ex.categories} size={7} />
        <span className="min-w-0 flex-1 truncate text-text">{ex.description}</span>
      </span>
      {ex.useCount ? <span className="shrink-0 text-xs text-textDim tabular-nums">{ex.useCount}×</span> : null}
      <button
        onClick={() => togglePinned(ex.id)}
        className={`shrink-0 px-0.5 ${ex.pinned ? 'text-amber' : 'text-textDim/50 opacity-0 group-hover:opacity-100 hover:text-textDim'}`}
        title={ex.pinned ? t('Unpin') : t('Pin to the builder palette')}
      >
        {ex.pinned ? '★' : '☆'}
      </button>
      <button
        onClick={() => onAssignOne(ex.description, [ex.description])}
        className="shrink-0 px-0.5 text-textDim opacity-0 group-hover:opacity-100 hover:text-accent"
        title={t('Assign to sessions…')}
      >
        ⋯
      </button>
      <button onClick={() => onUse([ex.description])} className="shrink-0 px-0.5 font-heading text-accent" title="+">
        ＋
      </button>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-textDim hover:border-accent hover:text-text'
      }`}
    >
      {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

// ── multi-assign (grouped: weekday quick-picks + per-week toggles) ───────────

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function AssignModal({
  name,
  descriptions,
  targets,
  onAssign,
  onClose,
}: {
  name: string;
  descriptions: string[];
  targets: AssignTarget[];
  onAssign: (sessionIds: string[], descriptions: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const out: { group: string; items: AssignTarget[] }[] = [];
    for (const tg of targets) {
      const last = out[out.length - 1];
      if (last && last.group === tg.group) last.items.push(tg);
      else out.push({ group: tg.group, items: [tg] });
    }
    return out;
  }, [targets]);

  const dows = useMemo(() => {
    const present = new Set<number>();
    for (const tg of targets) if (tg.dow != null) present.add(tg.dow);
    return [...present].sort((a, b) => a - b);
  }, [targets]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleMany = (ids: string[]) =>
    setSel((s) => {
      const n = new Set(s);
      const allIn = ids.every((id) => n.has(id));
      for (const id of ids) {
        if (allIn) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="glass-card w-full max-w-md rounded-xl p-4 space-y-3 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base">{t('Add to sessions')}</h3>
          <p className="text-textDim text-sm truncate">{name}</p>
        </div>

        {targets.length === 0 ? (
          <p className="text-textDim text-sm">{t('Add sessions to your plan first.')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => setSel(new Set(targets.map((x) => x.id)))} className="text-accent hover:underline">
                {t('Select all')}
              </button>
              <button onClick={() => setSel(new Set())} className="text-textDim hover:text-text">
                {t('Clear')}
              </button>
              {dows.length > 1 && (
                <span className="ml-auto flex items-center gap-1">
                  {dows.map((d) => (
                    <button
                      key={d}
                      onClick={() => toggleMany(targets.filter((x) => x.dow === d).map((x) => x.id))}
                      className="rounded-full border border-border px-2 py-0.5 text-textDim hover:border-accent hover:text-accent"
                      title={t('Toggle every session on this weekday')}
                    >
                      {t(DOW_SHORT[d])}
                    </button>
                  ))}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-auto">
              {groups.map((g) => {
                const ids = g.items.map((x) => x.id);
                const allIn = ids.every((id) => sel.has(id));
                return (
                  <div key={g.group} className="space-y-1">
                    <button
                      onClick={() => toggleMany(ids)}
                      className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs uppercase tracking-wide ${
                        allIn ? 'text-accent' : 'text-textDim hover:text-text'
                      }`}
                      title={t('Toggle the whole group')}
                    >
                      <span>{g.group}</span>
                      <span className="flex-1 border-t border-border/60" />
                      <span className="tabular-nums">{g.items.length}</span>
                    </button>
                    {g.items.map((tg) => (
                      <label
                        key={tg.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-abyss px-3 py-1.5 text-sm cursor-pointer hover:border-accent"
                      >
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={sel.has(tg.id)}
                          onChange={() => toggle(tg.id)}
                        />
                        <span className="truncate">{tg.label}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t('Cancel')}
          </button>
          <button
            disabled={sel.size === 0}
            onClick={() => {
              onAssign([...sel], descriptions);
              onClose();
            }}
            className="glow-accent text-sm bg-accent text-ink rounded-lg px-4 py-1.5 font-heading tracking-wide disabled:opacity-50"
          >
            {t('Add to selected')} ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
