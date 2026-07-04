/**
 * ExercisesView — the coach's library workbench. A category rail (with counts)
 * structures the space; the main column is a sortable, incrementally-rendered
 * list with usage columns, bulk actions, an Archive, and look-alike merging.
 * Blocks and the category editor (incl. explicit colours) are rail views of
 * their own. Exercises are dropped into plan sessions from the builder.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addBlock,
  addCategory,
  addCategoryToExercises,
  addExercise,
  addExercisesToBlockBulk,
  addExerciseToBlock,
  addManyExercises,
  blockToSessionTemplate,
  exportLibraryCsv,
  mergeExercises,
  parseExerciseFile,
  removeBlock,
  removeCategory,
  removeExerciseFromBlock,
  removeExercises,
  removeSessionTemplate,
  removeWeekTemplate,
  renameBlock,
  renameCategory,
  setArchived,
  togglePinned,
  updateExercise,
  useBlocks,
  useCategories,
  useExercises,
  useSessionTemplates,
  useWeekTemplates,
  type ExerciseBlock,
  type LibraryExercise,
} from "../lib/library";
import { findLookAlikes, rankExercises } from "../lib/librarySearch";
import { useT } from "../i18n";
import {
  CAT_PALETTE,
  categoryColor,
  hashedCategoryColor,
  setCategoryColor,
  useCategoryColors,
} from "../lib/categoryColor";
import { CatDot, CatDots } from "../components/CatDot";
import { CategoryPicker } from "../components/CategoryPicker";
import { InfoTip } from "../components/InfoTip";
import { LoadMore } from "../components/LoadMore";
import { DoseChips, DoseEditor } from "../components/dose";

const CREATE_BAR =
  "flex flex-wrap gap-2 rounded-xl border border-accent/25 bg-accent/5 p-3";
const CHUNK = 80;

type RailView =
  | { kind: "all" }
  | { kind: "cat"; name: string }
  | { kind: "uncat" }
  | { kind: "archived" }
  | { kind: "blocks" }
  | { kind: "templates" }
  | { kind: "categories" };

type SortId = "recent" | "used" | "name" | "newest";

const LAST_USED_FMT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

export function ExercisesView() {
  const t = useT();
  const exercises = useExercises();
  const categories = useCategories();
  const blocks = useBlocks();
  const sessionTemplates = useSessionTemplates();
  const weekTemplates = useWeekTemplates();
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<RailView>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("recent");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(CHUNK);
  const [reviewing, setReviewing] = useState(false);
  const [hideLookAlikes, setHideLookAlikes] = useState(false);

  // Selection and render window reset when the coach moves views/filters.
  const viewKey = view.kind + ("name" in view ? view.name : "");
  useEffect(() => {
    setSel(new Set());
    setLimit(CHUNK);
  }, [viewKey, search, sort]);

  const active = useMemo(
    () => exercises.filter((e) => !e.archived),
    [exercises],
  );
  const archivedCount = exercises.length - active.length;
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of active)
      for (const c of e.categories ?? []) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [active]);
  const uncatCount = useMemo(
    () => active.filter((e) => !e.categories?.length).length,
    [active],
  );

  const lookAlikes = useMemo(() => findLookAlikes(exercises), [exercises]);

  // The rows for the current exercises view (before the render window).
  const shown = useMemo(() => {
    if (view.kind === "blocks" || view.kind === "categories" || view.kind === "templates") return [];
    let base: LibraryExercise[];
    if (view.kind === "archived") base = exercises.filter((e) => e.archived);
    else if (view.kind === "cat")
      base = active.filter((e) => e.categories?.includes(view.name));
    else if (view.kind === "uncat")
      base = active.filter((e) => !e.categories?.length);
    else base = active;

    const q = search.trim().toLowerCase();
    if (q) base = base.filter((e) => e.description.toLowerCase().includes(q));

    const arr = [...base];
    if (sort === "recent")
      arr.sort(
        (a, b) =>
          (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") ||
          (b.useCount ?? 0) - (a.useCount ?? 0) ||
          a.description.localeCompare(b.description),
      );
    else if (sort === "used")
      arr.sort(
        (a, b) =>
          (b.useCount ?? 0) - (a.useCount ?? 0) ||
          a.description.localeCompare(b.description),
      );
    else if (sort === "name")
      arr.sort((a, b) => a.description.localeCompare(b.description));
    else arr.reverse(); // newest = insertion order, latest first
    return arr;
  }, [view, exercises, active, search, sort]);

  const addDraftExercise = (description: string, cats: string[]) => {
    addExercise(description, cats);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const rows = await parseExerciseFile(file);
      const n = addManyExercises(rows);
      alert(
        n
          ? `${t("Imported")} ${n} ${n === 1 ? t("exercise") : t("exercises")}.`
          : t("No new exercises found."),
      );
    } catch {
      alert(
        t(
          "Could not read that file. Use a .csv or .xlsx with exercises in the first column (category optional in the second).",
        ),
      );
    }
  };

  const railRow = (
    label: ReactNode,
    count: number | null,
    isActive: boolean,
    onClick: () => void,
    dim = false,
  ) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-accent/15 text-accent font-heading"
          : dim
            ? "text-textDim hover:text-text"
            : "text-text hover:bg-abyss"
      }`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
        {label}
      </span>
      {count != null && (
        <span className="shrink-0 text-xs text-textDim tabular-nums">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl">{t("Exercises")}</h2>
          <p className="text-textDim text-sm">
            {t(
              "Your reusable exercise library. Assign them into plan sessions from the builder.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t("Import Excel/CSV")}
          </button>
          {exercises.length > 0 && (
            <button
              onClick={() => exportLibraryCsv(exercises)}
              className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
            >
              {t("Export")}
            </button>
          )}
          <InfoTip
            text={t(
              "Import a .csv or .xlsx with one exercise per row: column 1 = the exercise text, column 2 (optional) = its categories, up to 3 separated by ; or /. Export downloads your whole library in that same format, so you can back it up or edit it in a spreadsheet.",
            )}
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
        {/* ── Rail ── */}
        <nav className="glass-card rounded-xl p-2.5 space-y-0.5 md:sticky md:top-4">
          <p className="px-2.5 pb-1 pt-1 text-xs uppercase tracking-wide text-textDim">
            {t("Library")}
          </p>
          {railRow(t("All"), active.length, view.kind === "all", () =>
            setView({ kind: "all" }),
          )}
          {categories.map((c) =>
            railRow(
              <>
                <CatDot name={c} size={8} />
                <span className="truncate">{c}</span>
              </>,
              catCounts.get(c) ?? 0,
              view.kind === "cat" && view.name === c,
              () => setView({ kind: "cat", name: c }),
            ),
          )}
          {railRow(
            t("Uncategorized"),
            uncatCount,
            view.kind === "uncat",
            () => setView({ kind: "uncat" }),
            true,
          )}
          <div className="mx-2 my-1.5 border-t border-border/60" />
          {railRow(
            <>
              <span className="text-accent">▦</span>
              {t("Blocks")}
            </>,
            blocks.length,
            view.kind === "blocks",
            () => setView({ kind: "blocks" }),
          )}
          {railRow(
            <>
              <span className="text-accent">▤</span>
              {t("Templates")}
            </>,
            sessionTemplates.length + weekTemplates.length,
            view.kind === "templates",
            () => setView({ kind: "templates" }),
          )}

          {railRow(
            t("Archived"),
            archivedCount,
            view.kind === "archived",
            () => setView({ kind: "archived" }),
            true,
          )}
          {railRow(
            <span className="text-accent">{t("Edit categories")}</span>,
            null,
            view.kind === "categories",
            () => setView({ kind: "categories" }),
          )}
        </nav>

        {/* ── Main column ── */}
        {view.kind === "blocks" ? (
          <BlocksPanel blocks={blocks} exercises={exercises} />
        ) : view.kind === "templates" ? (
          <TemplatesPanel />
        ) : view.kind === "categories" ? (
          <CategoriesPanel categories={categories} counts={catCounts} />
        ) : (
          <div className="space-y-3 min-w-0">
            {view.kind !== "archived" && (
              <AddBar categories={categories} onAdd={addDraftExercise} />
            )}

            {exercises.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
                {t("No exercises yet. Add one above, or import a spreadsheet.")}
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center px-1.5" title={t("Select all shown")}>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={shown.length > 0 && sel.size >= shown.length}
                      onChange={(e) =>
                        setSel(
                          e.target.checked
                            ? new Set(shown.map((x) => x.id))
                            : new Set(),
                        )
                      }
                    />
                  </label>
                  <input
                    className="field w-auto flex-1 min-w-40"
                    placeholder={t("Search exercises")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className="field w-auto"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortId)}
                    title={t("Sort")}
                  >
                    <option value="recent">{t("Last used")}</option>
                    <option value="used">{t("Most used")}</option>
                    <option value="name">{t("Name")}</option>
                    <option value="newest">{t("Newest")}</option>
                  </select>
                </div>

                {/* Bulk bar */}
                {sel.size > 0 && (
                  <BulkBar
                    sel={sel}
                    archivedView={view.kind === "archived"}
                    categories={categories}
                    blocks={blocks}
                    onClear={() => setSel(new Set())}
                  />
                )}

                {/* Look-alikes */}
                {view.kind === "all" &&
                  !hideLookAlikes &&
                  lookAlikes.length > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber/50 bg-amber/10 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 text-text">
                        {lookAlikes.length}{" "}
                        {lookAlikes.length === 1
                          ? t("group of look-alike exercises found.")
                          : t("groups of look-alike exercises found.")}
                      </span>
                      <button
                        onClick={() => setReviewing(true)}
                        className="shrink-0 font-heading text-amber hover:underline"
                      >
                        {t("Review & merge")}
                      </button>
                      <button
                        onClick={() => setHideLookAlikes(true)}
                        className="shrink-0 px-1 text-textDim hover:text-text"
                        title={t("Dismiss")}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                {/* Rows */}
                {shown.length === 0 ? (
                  <p className="text-textDim text-sm">
                    {view.kind === "archived"
                      ? t("Nothing archived.")
                      : t("No exercises match.")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {shown.slice(0, limit).map((ex) => (
                      <ExerciseRow
                        key={ex.id}
                        ex={ex}
                        categories={categories}
                        selected={sel.has(ex.id)}
                        onSelect={(on) =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (on) n.add(ex.id);
                            else n.delete(ex.id);
                            return n;
                          })
                        }
                      />
                    ))}
                    {shown.length > limit && (
                      <>
                        <LoadMore onMore={() => setLimit((l) => l + CHUNK)} />
                        <p className="py-1 text-center text-xs text-textDim">
                          {shown.length - limit} {t("more…")}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {reviewing && (
        <LookAlikeModal groups={lookAlikes} onClose={() => setReviewing(false)} />
      )}
    </main>
  );
}

// ── Add bar ──────────────────────────────────────────────────────────────────

function AddBar({
  categories,
  onAdd,
}: {
  categories: string[];
  onAdd: (description: string, cats: string[]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [draftCats, setDraftCats] = useState<string[]>([]);
  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft, draftCats);
    setDraft("");
    setDraftCats([]);
  };
  return (
    <div className={CREATE_BAR}>
      <input
        className="field flex-1 min-w-48"
        placeholder={t("Add an exercise, e.g. 4×50m bi-fins, 3 min rest")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <button
        onClick={add}
        className="glow-accent text-sm bg-accent text-ink rounded-lg px-4 font-heading tracking-wide"
      >
        {t("Add")}
      </button>
      {categories.length > 0 && (
        <div className="w-full space-y-1.5">
          <span className="text-xs text-textDim">
            {t("Categories (up to 3, optional)")}
          </span>
          <CategoryPicker
            selected={draftCats}
            categories={categories}
            onChange={setDraftCats}
          />
        </div>
      )}
    </div>
  );
}

// ── Bulk bar ─────────────────────────────────────────────────────────────────

function BulkBar({
  sel,
  archivedView,
  categories,
  blocks,
  onClear,
}: {
  sel: Set<string>;
  archivedView: boolean;
  categories: string[];
  blocks: ExerciseBlock[];
  onClear: () => void;
}) {
  const t = useT();
  const [menu, setMenu] = useState<"cat" | "block" | null>(null);
  const ids = [...sel];

  const act = (fn: () => void) => {
    fn();
    setMenu(null);
    onClear();
  };

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
      <span className="font-heading text-accent">
        {sel.size} {t("selected")}
      </span>
      {!archivedView && (
        <>
          <BulkAction onClick={() => setMenu(menu === "cat" ? null : "cat")}>
            {t("Add category")} ▾
          </BulkAction>
          {blocks.length > 0 && (
            <BulkAction onClick={() => setMenu(menu === "block" ? null : "block")}>
              {t("Add to block")} ▾
            </BulkAction>
          )}
          <BulkAction onClick={() => act(() => setArchived(ids, true))}>
            {t("Archive")}
          </BulkAction>
        </>
      )}
      {archivedView && (
        <BulkAction onClick={() => act(() => setArchived(ids, false))}>
          {t("Restore")}
        </BulkAction>
      )}
      <BulkAction
        danger
        onClick={() =>
          confirm(`${t("Delete")} ${sel.size}?`) && act(() => removeExercises(ids))
        }
      >
        {t("Delete")}
      </BulkAction>
      <button onClick={onClear} className="ml-auto text-xs text-textDim hover:text-text">
        {t("Clear")}
      </button>

      {menu && (
        <div className="absolute left-2 top-full z-30 mt-1 max-h-64 min-w-44 overflow-auto rounded-lg border border-border bg-panel p-1 shadow-lg">
          {(menu === "cat" ? categories : blocks.map((b) => b.name)).map(
            (name, i) => (
              <button
                key={name}
                onClick={() =>
                  act(() =>
                    menu === "cat"
                      ? addCategoryToExercises(ids, name)
                      : addExercisesToBlockBulk(blocks[i].id, ids),
                  )
                }
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                {menu === "cat" ? (
                  <CatDot name={name} size={8} />
                ) : (
                  <span className="text-accent">▦</span>
                )}
                {name}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function BulkAction({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`${danger ? "text-red" : "text-text"} hover:underline`}
    >
      {children}
    </button>
  );
}

// ── Exercise row ─────────────────────────────────────────────────────────────

function usageLabel(ex: LibraryExercise, t: (s: string) => string): string {
  if (!ex.useCount) return t("never used");
  const when = ex.lastUsedAt
    ? ` · ${LAST_USED_FMT.format(new Date(ex.lastUsedAt))}`
    : "";
  return `${ex.useCount}×${when}`;
}

function ExerciseRow({
  ex,
  categories,
  selected,
  onSelect,
}: {
  ex: LibraryExercise;
  categories: string[];
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
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
      className={`overflow-hidden rounded-lg border bg-panel ${selected ? "border-accent/60" : "border-border"}`}
      style={{ borderLeft: `3px solid ${categoryColor(ex.categories?.[0])}` }}
    >
      <div className="flex w-full items-center gap-2.5 px-3 py-2">
        <input
          type="checkbox"
          className="accent-accent shrink-0"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <button
          onClick={() => togglePinned(ex.id)}
          className={`shrink-0 ${ex.pinned ? "text-amber" : "text-textDim/50 hover:text-textDim"}`}
          title={ex.pinned ? t("Unpin") : t("Pin to the builder palette")}
        >
          {ex.pinned ? "★" : "☆"}
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`min-w-0 flex-1 truncate ${ex.archived ? "text-textDim line-through" : "text-text"}`}
          >
            {ex.description}
          </span>
          {ex.categories?.length ? (
            <span className="hidden shrink-0 items-center gap-2 sm:flex">
              {ex.categories.map((c) => (
                <span key={c} className="text-xs" style={{ color: categoryColor(c) }}>
                  {c}
                </span>
              ))}
            </span>
          ) : null}
          {ex.defaultDose?.length ? (
            <span className="hidden shrink-0 md:block">
              <DoseChips dose={ex.defaultDose} />
            </span>
          ) : null}
          <span className="shrink-0 text-xs text-textDim tabular-nums">
            {usageLabel(ex, t)}
          </span>
          <span className="shrink-0 text-textDim">{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div className="space-y-2.5 border-t border-border px-3 py-3">
          <input
            className="field"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <div className="space-y-1.5">
            <span className="text-xs text-textDim">
              {t("Categories (up to 3, optional)")}
            </span>
            <CategoryPicker
              selected={ex.categories ?? []}
              categories={categories}
              onChange={(next) => updateExercise(ex.id, { categories: next })}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-textDim">
              {t("Default dose (optional). Copied into a session when this exercise is added; tweak it there per week. Mix any parts: hold + distance + rest is fine.")}
            </span>
            <DoseEditor
              dose={ex.defaultDose ?? []}
              onChange={(d) => updateExercise(ex.id, { defaultDose: d })}
            />
          </div>
          <div className="flex items-center gap-4">
            {ex.archived ? (
              <button
                onClick={() => setArchived([ex.id], false)}
                className="text-sm text-accent hover:underline"
              >
                {t("Restore")}
              </button>
            ) : (
              <button
                onClick={() => setArchived([ex.id], true)}
                className="text-sm text-textDim hover:text-text"
                title={t("Keeps its history; leaves every picker. Find it under Archived.")}
              >
                {t("Archive")}
              </button>
            )}
            <button
              onClick={() => removeExercises([ex.id])}
              className="ml-auto px-2 text-sm text-red hover:underline"
            >
              {t("Remove")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Look-alike review ────────────────────────────────────────────────────────

function LookAlikeModal({
  groups,
  onClose,
}: {
  groups: { key: string; items: LibraryExercise[] }[];
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col space-y-3 rounded-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base">{t("Look-alike exercises")}</h3>
          <p className="text-textDim text-sm">
            {t(
              "These entries differ only in numbers (reps, times, week suffixes). Merging keeps one entry; block references and usage history follow it.",
            )}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto">
          {groups.length === 0 ? (
            <p className="text-textDim text-sm">{t("All merged. Nice and tidy.")}</p>
          ) : (
            groups.map((g) => <LookAlikeGroupRow key={g.key} group={g} />)
          )}
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-textDim border border-border rounded-lg px-3 py-1.5 hover:border-accent"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LookAlikeGroupRow({
  group,
}: {
  group: { key: string; items: LibraryExercise[] };
}) {
  const t = useT();
  const [keep, setKeep] = useState(group.items[0]?.id ?? "");
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-abyss p-2.5">
      {group.items.map((ex) => (
        <label key={ex.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            className="accent-accent"
            checked={keep === ex.id}
            onChange={() => setKeep(ex.id)}
          />
          <span className="min-w-0 flex-1 truncate text-text">{ex.description}</span>
          <span className="shrink-0 text-xs text-textDim tabular-nums">
            {usageLabel(ex, t)}
          </span>
        </label>
      ))}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-textDim">{t("Keep the selected one")}</span>
        <button
          onClick={() =>
            mergeExercises(
              keep,
              group.items.map((i) => i.id).filter((id) => id !== keep),
            )
          }
          className="text-sm font-heading text-accent hover:underline"
        >
          {t("Merge")} ({group.items.length})
        </button>
      </div>
    </div>
  );
}

// ── Blocks panel (rail view) ─────────────────────────────────────────────────

function BlocksPanel({
  blocks,
  exercises,
}: {
  blocks: ExerciseBlock[];
  exercises: LibraryExercise[];
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const create = () => {
    if (draft.trim()) {
      addBlock(draft);
      setDraft("");
    }
  };
  return (
    <div className="space-y-3 min-w-0">
      <div className={CREATE_BAR}>
        <input
          className="field flex-1 min-w-48"
          placeholder={t("New block name, e.g. CO₂ set")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button
          onClick={create}
          className="text-sm text-accent border border-accent/60 rounded-lg px-4 hover:bg-accent/10"
        >
          {t("Add block")}
        </button>
      </div>
      {blocks.length === 0 ? (
        <p className="text-textDim text-sm">
          {t(
            "No blocks yet. Group exercises you use together (a warm-up, a CO₂ set), then add the whole block to a session at once from the builder.",
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <BlockRow key={b.id} block={b} index={i} exercises={exercises} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsed by default (name + exercise-count + a category-dot preview).
 *  Click to expand the editor (rename, chips, add-to-block, delete). */
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
        <span className="w-4 shrink-0 font-heading text-xs text-textDim">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-text">{block.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-textDim">
            <span>
              {items.length} {items.length === 1 ? t("exercise") : t("exercises")}
            </span>
            {items.length > 0 && (
              <span className="flex items-center gap-1">
                {items.slice(0, 8).map((ex) => (
                  <CatDot key={ex.id} name={ex.categories?.[0]} size={7} />
                ))}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-textDim">{open ? "▴" : "▾"}</span>
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
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {items.map((ex) => (
                <span
                  key={ex.id}
                  className="group flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 text-sm"
                >
                  <CatDots names={ex.categories} size={7} />
                  {ex.description}
                  <button
                    onClick={() => removeExerciseFromBlock(block.id, ex.id)}
                    className="text-textDim hover:text-red"
                    title={t("Remove from block")}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <AddToBlock blockId={block.id} exercises={exercises} inBlock={inBlock} />
          <div className="flex items-center gap-4">
            {items.length > 0 && (
              <button
                onClick={() => {
                  blockToSessionTemplate(block);
                  alert(`${t("Saved as a session template.")} (${block.name})`);
                }}
                className="text-xs text-accent hover:underline"
                title={t("Templates carry a whole session (label, notes, doses) and are inserted via + from template in the builder.")}
              >
                {t("Convert to session template")}
              </button>
            )}
            <button
              onClick={() =>
                confirm(`${t("Delete block")} "${block.name}"?`) && removeBlock(block.id)
              }
              className="ml-auto text-red text-xs hover:underline"
            >
              {t("Delete block")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const DROPDOWN_PAGE = 100;

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
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const matches = useMemo(
    () => rankExercises(exercises, q).filter((e) => !inBlock.has(e.id)),
    [q, exercises, inBlock],
  );
  const show = focused && matches.length > 0;

  return (
    <div className="relative">
      <input
        className="field w-full"
        placeholder={t("Add an exercise to this block…")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {show && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-panel shadow-lg max-h-72 overflow-auto">
          {matches.slice(0, DROPDOWN_PAGE).map((e) => (
            <li key={e.id}>
              <button
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  addExerciseToBlock(blockId, e.id);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 text-left px-3 py-1.5 text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                <CatDots names={e.categories} size={7} />
                {e.description}
              </button>
            </li>
          ))}
          {matches.length > DROPDOWN_PAGE && (
            <li className="px-3 py-1.5 text-xs text-textDim">
              {matches.length - DROPDOWN_PAGE} {t("more, keep typing to narrow down")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Templates panel (rail view) ──────────────────────────────────────────────

function TemplatesPanel() {
  const t = useT();
  const sessionTemplates = useSessionTemplates();
  const weekTemplates = useWeekTemplates();

  if (sessionTemplates.length === 0 && weekTemplates.length === 0) {
    return (
      <p className="text-textDim text-sm">
        {t(
          'No templates yet. In the plan builder, open a session and hit "Save as template", or save a whole week from its card. Blocks can also be converted into session templates.',
        )}
      </p>
    );
  }

  const row = (key: string, name: string, meta: string, onDelete: () => void) => (
    <div key={key} className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-text">{name}</span>
      <span className="shrink-0 text-xs text-textDim tabular-nums">{meta}</span>
      <button onClick={onDelete} className="shrink-0 text-textDim hover:text-red" title={t("Remove")}>
        ✕
      </button>
    </div>
  );

  return (
    <div className="space-y-4 min-w-0">
      {sessionTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-textDim">{t("Session templates")}</p>
          {sessionTemplates.map((x) =>
            row(
              x.id,
              x.name,
              `${x.exercises.length} ${x.exercises.length === 1 ? t("exercise") : t("exercises")}${x.useCount ? ` · ${x.useCount}×` : ""}`,
              () => confirm(`${t("Delete")} "${x.name}"?`) && removeSessionTemplate(x.id),
            ),
          )}
        </div>
      )}
      {weekTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-textDim">{t("Week templates")}</p>
          {weekTemplates.map((x) =>
            row(
              x.id,
              x.name,
              `${x.sessions.length} ${x.sessions.length === 1 ? t("session") : t("sessions")}${x.useCount ? ` · ${x.useCount}×` : ""}`,
              () => confirm(`${t("Delete")} "${x.name}"?`) && removeWeekTemplate(x.id),
            ),
          )}
        </div>
      )}
      <p className="text-xs text-textDim">
        {t("Insert session templates in the builder via + from template on any day; apply week templates from a week card.")}
      </p>
    </div>
  );
}

// ── Categories panel (rail view) ─────────────────────────────────────────────

function CategoriesPanel({
  categories,
  counts,
}: {
  categories: string[];
  counts: Map<string, number>;
}) {
  const t = useT();
  const colors = useCategoryColors();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  const commitEdit = () => {
    if (editing) renameCategory(editing, editVal);
    setEditing(null);
  };
  const add = () => {
    if (draft.trim()) {
      addCategory(draft);
      setDraft("");
    }
  };
  const del = (c: string) => {
    if (
      confirm(
        `${t("Delete category")} "${c}"? ${t("Exercises keep their description but become uncategorized.")}`,
      )
    )
      removeCategory(c);
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className={CREATE_BAR}>
        <input
          className="field flex-1 min-w-48"
          placeholder={t("+ Add category")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          className="text-sm text-accent border border-accent/60 rounded-lg px-4 hover:bg-accent/10"
        >
          {t("Add")}
        </button>
      </div>
      <p className="text-xs text-textDim">
        {t("Click a swatch to give a category its own colour. Unset colours fall back to an automatic one.")}
      </p>
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c} className="rounded-lg border border-border bg-panel">
            <div className="flex items-center gap-3 px-3 py-2">
              <button
                onClick={() => setPicking(picking === c ? null : c)}
                className="h-5 w-5 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: categoryColor(c) }}
                title={t("Pick a colour")}
              />
              {editing === c ? (
                <input
                  autoFocus
                  className="field w-40"
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-text">{c}</span>
              )}
              <span className="shrink-0 text-xs text-textDim tabular-nums">
                {counts.get(c) ?? 0}
              </span>
              <button
                onClick={() => {
                  setEditing(c);
                  setEditVal(c);
                }}
                className="shrink-0 text-textDim hover:text-accent"
                title={t("Rename")}
              >
                ✎
              </button>
              <button
                onClick={() => del(c)}
                className="shrink-0 text-textDim hover:text-red"
                title={t("Delete category")}
              >
                ✕
              </button>
            </div>
            {picking === c && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2.5">
                {CAT_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    onClick={() => {
                      setCategoryColor(c, hex);
                      setPicking(null);
                    }}
                    className={`h-6 w-6 rounded-full border-2 ${
                      colors[c] === hex ? "border-text" : "border-transparent"
                    }`}
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
                <button
                  onClick={() => {
                    setCategoryColor(c, null);
                    setPicking(null);
                  }}
                  className="ml-1 text-xs text-textDim hover:text-text"
                  title={`${t("Automatic")} (${hashedCategoryColor(c)})`}
                >
                  {t("Automatic")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
