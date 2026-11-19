/**
 * ExercisesView — the coach's library workbench. On top, the two build
 * buttons (session template, week template). A category rail (with counts)
 * structures the space; the main column opens with four health tiles (size,
 * pinned, stale, look-alikes), then a sortable, incrementally-rendered list
 * with usage bars; clicking a row opens its detail panel. Ticked exercises
 * collect in a tray at the bottom of the list and are sent from there into a
 * plan session, a new session template, to an athlete or into a block.
 * Blocks (a composer), Templates, Week templates and the category editor are
 * rail views of their own.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  addBlock,
  addCategory,
  addCategoryToExercises,
  addExercise,
  addExercisesToBlockBulk,
  addManyExercises,
  exportLibraryCsv,
  mergeExercises,
  parseExerciseFile,
  removeCategory,
  removeExercises,
  renameCategory,
  setArchived,
  togglePinned,
  useBlocks,
  useCategories,
  useExercises,
  useSessionTemplates,
  useWeekTemplates,
  type ExerciseBlock,
  type LibraryExercise,
} from "../lib/library";
import { findLookAlikes } from "../lib/librarySearch";
import { isStale, STALE_DAYS } from "../lib/exerciseInsights";
import { fill, useT } from "../i18n";
import {
  CAT_PALETTE,
  categoryColor,
  hashedCategoryColor,
  setCategoryColor,
  useCategoryColors,
} from "../lib/categoryColor";
import { CatDot } from "../components/CatDot";
import { CategoryPicker } from "../components/CategoryPicker";
import { InfoTip } from "../components/InfoTip";
import { LoadMore } from "../components/LoadMore";
import { DoseChips } from "../components/dose";
import { ExerciseDetail } from "../components/exercises/ExerciseDetail";
import { BlockComposer } from "../components/exercises/BlockComposer";
import { TemplatesPanel } from "../components/exercises/TemplatesPanel";
import { TemplatesLibrary, SendDialog } from "../components/templates/TemplatesLibrary";
import { AddToPlanDialog } from "../components/AddToPlanDialog";
import { blankTemplate, newPart, MAX_PART_TEXT } from "../lib/coachTemplates/model";
import { useSharedTemplates } from "../lib/supabase/templateLibrary";
import { useAuth } from "../lib/supabase/AuthProvider";
import { stashTemplateLines } from "../lib/templateDraft";
import { exerciseText } from "../lib/e08plan";
import { navigate, useRoute } from "../hooks/useHashRoute";
import { editedAgo } from "./PlansView";

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
  | { kind: "weeks" }
  | { kind: "categories" };

type SortId = "recent" | "used" | "name" | "newest";
/** A tile's narrowing of the list on top of the rail view. */
type Quick = "pinned" | "stale" | null;

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

  const { session, isCoach } = useAuth();
  const online = !!session && isCoach;
  const sharedTemplates = useSharedTemplates();
  // /exercises?view=templates and ?view=weeks: the way back from the editors.
  const startView = useRoute().query.get("view");
  const [view, setView] = useState<RailView>(
    startView === "templates" ? { kind: "templates" } : startView === "weeks" ? { kind: "weeks" } : { kind: "all" },
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("recent");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(CHUNK);
  const [reviewing, setReviewing] = useState(false);
  const [hideLookAlikes, setHideLookAlikes] = useState(false);
  const [quick, setQuick] = useState<Quick>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);

  // Selection and render window reset when the coach moves views/filters.
  const viewKey = view.kind + ("name" in view ? view.name : "");
  useEffect(() => {
    setLimit(CHUNK);
  }, [viewKey, search, sort, quick]);
  // The picks stay while the coach searches and moves between categories:
  // a session is often put together from several of them. Only the archive
  // is a different set of exercises.
  const inArchive = view.kind === "archived";
  useEffect(() => {
    setSel(new Set());
  }, [inArchive]);
  useEffect(() => {
    setQuick(null);
    setDetailId(null);
  }, [viewKey]);

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
  const nowMs = Date.now();
  const pinnedCount = active.filter((e) => e.pinned).length;
  const staleCount = active.filter((e) => isStale(e, nowMs)).length;
  const maxUse = useMemo(
    () => Math.max(1, ...active.map((e) => e.useCount ?? 0)),
    [active],
  );
  const detail = detailId ? exercises.find((e) => e.id === detailId) ?? null : null;

  // The rows for the current exercises view (before the render window).
  const shown = useMemo(() => {
    if (view.kind === "blocks" || view.kind === "categories" || view.kind === "templates" || view.kind === "weeks") return [];
    let base: LibraryExercise[];
    if (view.kind === "archived") base = exercises.filter((e) => e.archived);
    else if (view.kind === "cat")
      base = active.filter((e) => e.categories?.includes(view.name));
    else if (view.kind === "uncat")
      base = active.filter((e) => !e.categories?.length);
    else base = active;

    if (quick === "pinned") base = base.filter((e) => e.pinned);
    else if (quick === "stale") {
      const now = Date.now();
      base = base.filter((e) => isStale(e, now));
    }

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
  }, [view, exercises, active, search, sort, quick]);

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
    <main className="mx-auto max-w-6xl px-5 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl">{t("Exercises")}</h2>
          <p className="text-textDim text-sm">
            {t(
              "Your reusable exercise library. Tick exercises to send them into a plan, a template or to an athlete.",
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
            className="pill text-sm px-3 py-1.5"
          >
            {t("Import Excel/CSV")}
          </button>
          {exercises.length > 0 && (
            <button
              onClick={() => exportLibraryCsv(exercises)}
              className="pill text-sm px-3 py-1.5"
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

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => navigate("/plan/template/new?from=exercises")}
          className="rounded-xl border-b-4 border-black/25 bg-accent px-4 py-3 text-left text-ink transition hover:brightness-105 active:translate-y-px"
        >
          <span className="block font-heading text-base">+ {t("Build template")}</span>
          <span className="block text-xs font-semibold opacity-85">
            {t("One session: exercises, dry table, fitness program")}
          </span>
        </button>
        <button
          onClick={() => navigate("/exercises/week-template/new")}
          className="rounded-xl border-b-4 border-black/25 bg-highlight px-4 py-3 text-left text-[#06222d] transition hover:brightness-105 active:translate-y-px"
        >
          <span className="block font-heading text-base">+ {t("Build week template")}</span>
          <span className="block text-xs font-semibold opacity-85">
            {t("Seven days of sessions, reusable in any plan")}
          </span>
        </button>
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
          {categories.map((c) => (
            <Fragment key={c}>
              {railRow(
                <>
                  <CatDot name={c} size={8} />
                  <span className="truncate">{c}</span>
                </>,
                catCounts.get(c) ?? 0,
                view.kind === "cat" && view.name === c,
                () => setView({ kind: "cat", name: c }),
              )}
            </Fragment>
          ))}
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
            (online ? sharedTemplates.length : 0) + sessionTemplates.length,
            view.kind === "templates",
            () => setView({ kind: "templates" }),
          )}
          {railRow(
            <>
              <span className="text-accent">▥</span>
              {t("Week templates")}
            </>,
            weekTemplates.length,
            view.kind === "weeks",
            () => setView({ kind: "weeks" }),
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
          <BlockComposer
            blocks={blocks}
            exercises={exercises}
            categories={categories}
            activeId={blockId}
            onActive={setBlockId}
            onTemplates={() => setView({ kind: "templates" })}
          />
        ) : view.kind === "templates" ? (
          <div className="min-w-0 space-y-5">
            {online ? (
              <TemplatesLibrary editedAgo={(iso) => editedAgo(iso, t)} from="exercises" />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-textDim">
                {t("Sign in as a coach to use templates.")}
              </p>
            )}
            <TemplatesPanel only="sessions" />
          </div>
        ) : view.kind === "weeks" ? (
          <TemplatesPanel only="weeks" />
        ) : view.kind === "categories" ? (
          <CategoriesPanel categories={categories} counts={catCounts} />
        ) : (
          <div
            className={`min-w-0 gap-4 ${detail ? "lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start" : ""}`}
          >
          <div className="space-y-3 min-w-0">
            {view.kind !== "archived" && exercises.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(
                  [
                    {
                      key: "all",
                      n: active.length,
                      label: t("Exercises"),
                      tone: "var(--c-accent)",
                      on: quick == null,
                      go: () => setQuick(null),
                    },
                    {
                      key: "pinned",
                      n: pinnedCount,
                      label: t("Pinned"),
                      tone: "var(--c-highlight)",
                      on: quick === "pinned",
                      go: () => setQuick(quick === "pinned" ? null : "pinned"),
                    },
                    {
                      key: "stale",
                      n: staleCount,
                      label: fill(t("Unused {n}+ days"), { n: STALE_DAYS }),
                      tone: "var(--c-amber)",
                      on: quick === "stale",
                      go: () => setQuick(quick === "stale" ? null : "stale"),
                    },
                    {
                      key: "look",
                      n: lookAlikes.length,
                      label: t("Look-alikes to merge"),
                      tone: "var(--c-modeDry)",
                      on: false,
                      go: () => lookAlikes.length > 0 && setReviewing(true),
                    },
                  ] as const
                ).map((x) => (
                  <button
                    key={x.key}
                    onClick={x.go}
                    aria-pressed={x.on}
                    className={`tile px-3 py-2 text-left ${x.on && x.key !== "all" ? "ring-2 ring-text/60" : ""}`}
                    style={{ "--tone": `rgb(${x.tone})` } as CSSProperties}
                  >
                    <span className="tile-value block font-num text-xl font-bold leading-tight">{x.n}</span>
                    <span className="tile-label block text-xs font-bold">{x.label}</span>
                  </button>
                ))}
              </div>
            )}

            {view.kind !== "archived" && (exercises.length === 0 || adding) && (
              <AddBar
                categories={categories}
                onAdd={addDraftExercise}
                onClose={exercises.length > 0 ? () => setAdding(false) : undefined}
              />
            )}

            {exercises.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
                {t("No exercises yet. Add one above, or import a spreadsheet.")}
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  {view.kind !== "archived" && !adding && (
                    <button
                      onClick={() => setAdding(true)}
                      className="pill pill-on btn-raised px-3 py-1.5 text-sm"
                    >
                      + {t("New exercise")}
                    </button>
                  )}
                  <label className="flex items-center px-1.5" title={t("Select all shown")}>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={shown.length > 0 && shown.every((x) => sel.has(x.id))}
                      onChange={(e) =>
                        setSel((cur) => {
                          const next = new Set(cur);
                          for (const x of shown) {
                            if (e.target.checked) next.add(x.id);
                            else next.delete(x.id);
                          }
                          return next;
                        })
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

                {quick && (
                  <p className="flex items-center gap-2 text-xs text-textDim">
                    {quick === "pinned"
                      ? t("Showing pinned exercises.")
                      : fill(t("Showing exercises not used in a plan for {n}+ days. Archive the ones you no longer need."), { n: STALE_DAYS })}
                    <button onClick={() => setQuick(null)} className="font-bold text-accent hover:underline">
                      {t("Show all")}
                    </button>
                  </p>
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
                        stale={!ex.archived && isStale(ex, nowMs)}
                        usage={(ex.useCount ?? 0) / maxUse}
                        open={detailId === ex.id}
                        narrow={!!detail}
                        onOpen={() => setDetailId(detailId === ex.id ? null : ex.id)}
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

                {/* Tray: the picked exercises, in the order they were ticked */}
                {sel.size > 0 && (
                  <Tray
                    picked={[...sel]
                      .map((id) => exercises.find((e) => e.id === id))
                      .filter((e): e is LibraryExercise => !!e)}
                    archivedView={view.kind === "archived"}
                    online={online}
                    categories={categories}
                    blocks={blocks}
                    onRemove={(id) =>
                      setSel((cur) => {
                        const next = new Set(cur);
                        next.delete(id);
                        return next;
                      })
                    }
                    onClear={() => setSel(new Set())}
                  />
                )}
              </>
            )}
          </div>
          {detail && (
            <ExerciseDetail
              key={detail.id}
              ex={detail}
              categories={categories}
              blocks={blocks}
              sessionTemplates={sessionTemplates}
              weekTemplates={weekTemplates}
              onClose={() => setDetailId(null)}
              onOpenBlock={(id) => {
                setBlockId(id);
                setView({ kind: "blocks" });
              }}
            />
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
  onClose,
}: {
  categories: string[];
  onAdd: (description: string, cats: string[]) => void;
  /** Folds the bar back into the "+ New exercise" button. */
  onClose?: () => void;
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
        autoFocus={!!onClose}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") onClose?.();
        }}
      />
      <button
        onClick={add}
        className="pill pill-on btn-raised text-sm px-4"
      >
        {t("Add")}
      </button>
      {onClose && (
        <button onClick={onClose} className="px-1 text-textDim hover:text-text" title={t("Close")}>
          ✕
        </button>
      )}
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

// ── Tray ─────────────────────────────────────────────────────────────────────

/** How many picked exercises the tray names before it says "+ n more". */
const TRAY_CHIPS = 8;

type SendTo = "plan" | "athlete" | null;

/**
 * The picked exercises, pinned to the bottom of the list: what is picked (in
 * the order it was ticked, which is the order it arrives in), where to send
 * it (a plan session, a new session template, an athlete, a block), and the
 * housekeeping actions (category, archive, delete).
 */
function Tray({
  picked,
  archivedView,
  online,
  categories,
  blocks,
  onRemove,
  onClear,
}: {
  picked: LibraryExercise[];
  archivedView: boolean;
  /** Signed in as a coach: templates and athletes are reachable. */
  online: boolean;
  categories: string[];
  blocks: ExerciseBlock[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [menu, setMenu] = useState<"cat" | "send" | null>(null);
  const [sendTo, setSendTo] = useState<SendTo>(null);
  const ids = picked.map((e) => e.id);
  const items = picked.map((e) => ({ description: e.description, dose: e.defaultDose }));
  /** One line per exercise, its default dose written into the line. */
  const lines = picked.map((e) => exerciseText({ id: e.id, description: e.description, dose: e.defaultDose }, t));
  // The one-off session an athlete gets: kept for the life of the dialog.
  const oneOff = useMemo(() => {
    const part = newPart("text");
    return {
      ...blankTemplate("general"),
      blocks: [{ ...part, exercise: { kind: "text" as const, text: lines.join("\n").slice(0, MAX_PART_TEXT) } }],
    };
  }, [sendTo]);

  const act = (fn: () => void) => {
    fn();
    setMenu(null);
    onClear();
  };
  const toBlock = (blockId: string) => act(() => addExercisesToBlockBulk(blockId, ids));
  const newBlock = () => {
    const name = prompt(t("Block name"));
    if (name?.trim()) toBlock(addBlock(name.trim()));
  };

  const dest = (title: string, sub: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-accent/15 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="block text-sm font-bold text-text">{title}</span>
      <span className="block text-xs text-textDim">{sub}</span>
    </button>
  );

  return (
    <div className="sticky bottom-3 z-20 rounded-xl border border-accent bg-abyss px-3 py-2.5 shadow-lg">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-heading text-accent">
          {picked.length} {t("picked")}
        </span>
        {picked.slice(0, TRAY_CHIPS).map((e, i) => (
          <span
            key={e.id}
            className="inline-flex max-w-[13rem] items-center gap-1 rounded-full border border-border bg-panel py-0.5 pl-2 pr-1 text-xs"
          >
            <span className="text-textDim tabular-nums">{i + 1}</span>
            <span className="truncate text-text">{e.description}</span>
            <button
              onClick={() => onRemove(e.id)}
              className="px-1 text-textDim hover:text-text"
              aria-label={`${t("Remove")} ${e.description}`}
            >
              ✕
            </button>
          </span>
        ))}
        {picked.length > TRAY_CHIPS && (
          <span className="text-xs text-textDim">
            + {picked.length - TRAY_CHIPS} {t("more…")}
          </span>
        )}
      </div>

      <div className="relative mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {!archivedView && (
          <>
            <BulkAction onClick={() => setMenu(menu === "cat" ? null : "cat")}>
              {t("Add category")} ▾
            </BulkAction>
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
            confirm(`${t("Delete")} ${picked.length}?`) && act(() => removeExercises(ids))
          }
        >
          {t("Delete")}
        </BulkAction>
        <span className="flex-1" />
        <button onClick={onClear} className="pill px-3 py-1 text-xs">
          {t("Clear")}
        </button>
        {!archivedView && (
          <button
            onClick={() => setMenu(menu === "send" ? null : "send")}
            aria-haspopup="menu"
            aria-expanded={menu === "send"}
            className="pill pill-on btn-raised px-4 py-1.5 text-sm"
          >
            {t("Send to…")} ▾
          </button>
        )}

        {menu === "cat" && (
          <div className="board absolute bottom-full left-0 z-30 mb-2 max-h-64 min-w-44 overflow-auto p-1">
            {categories.map((name) => (
              <button
                key={name}
                onClick={() => act(() => addCategoryToExercises(ids, name))}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                <CatDot name={name} size={8} />
                {name}
              </button>
            ))}
          </div>
        )}

        {menu === "send" && (
          <div role="menu" className="board absolute bottom-full right-0 z-30 mb-2 max-h-[60vh] w-72 space-y-0.5 overflow-auto p-1.5">
            {dest(t("A session in a plan"), t("Choose the plan, then the day or session"), () => {
              setMenu(null);
              setSendTo("plan");
            })}
            {dest(
              t("A new session template"),
              online ? t("Opens the template editor with these exercises") : t("Sign in as a coach to use templates."),
              () => {
                stashTemplateLines(lines);
                navigate("/plan/template/new?from=exercises");
              },
              !online,
            )}
            {dest(
              t("An athlete, as one session"),
              online ? t("Goes straight to their app") : t("Sign in as a coach to send to athletes."),
              () => {
                setMenu(null);
                setSendTo("athlete");
              },
              !online,
            )}
            <p className="px-2.5 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-textDim">{t("A block")}</p>
            {blocks.map((b) => (
              <button
                key={b.id}
                onClick={() => toBlock(b.id)}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1 text-left text-sm text-textDim hover:bg-accent/10 hover:text-text"
              >
                <span className="text-accent">▦</span>
                <span className="truncate">{b.name}</span>
              </button>
            ))}
            <button
              onClick={newBlock}
              className="block w-full rounded px-2.5 py-1 text-left text-sm text-accent hover:bg-accent/10"
            >
              + {t("New block")}
            </button>
          </div>
        )}
      </div>

      {sendTo === "plan" && (
        <AddToPlanDialog
          payload={{ kind: "exercises", items }}
          onClose={() => setSendTo(null)}
          onAdded={() => undefined}
        />
      )}
      {sendTo === "athlete" && (
        <SendDialog item={{ template: oneOff, cloudId: null }} oneOff onClose={() => setSendTo(null)} />
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
  stale,
  usage,
  open,
  narrow,
  onOpen,
  selected,
  onSelect,
}: {
  ex: LibraryExercise;
  /** Not placed in a plan for STALE_DAYS (or never): drawn faded. */
  stale: boolean;
  /** useCount relative to the library's most used exercise, 0..1. */
  usage: number;
  /** Its detail panel is open. */
  open: boolean;
  /** The detail panel takes part of the width: drop the dose chips. */
  narrow: boolean;
  onOpen: () => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const t = useT();
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-panel ${
        open ? "border-accent" : selected ? "border-accent/60" : "border-border"
      }`}
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
          onClick={onOpen}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${stale ? "opacity-60" : ""}`}
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
          {ex.defaultDose?.length && !narrow ? (
            <span className="hidden shrink-0 xl:block">
              <DoseChips dose={ex.defaultDose} />
            </span>
          ) : null}
          <span className="w-20 shrink-0 text-right">
            <span className="block text-xs text-textDim tabular-nums">{usageLabel(ex, t)}</span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-recover"
                style={{ width: `${Math.round(Math.min(1, usage) * 100)}%` }}
              />
            </span>
          </span>
        </button>
      </div>
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
            className="pill text-sm px-3 py-1.5"
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
          className="pill text-sm text-accent px-4"
        >
          {t("Add")}
        </button>
      </div>
      <p className="text-xs text-textDim">
        {t("Click a swatch to give a category its own colour. Unset colours fall back to an automatic one.")}
      </p>
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c} className="board">
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
