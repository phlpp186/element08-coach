/**
 * TemplatePicker — replaces the "+ from template" <select>.
 *
 * A native dropdown was fine at five templates and unusable at forty: one long
 * list, no grouping, no way to see two at once. This opens a panel with the
 * templates in columns by mode, side by side, most-used at the top of each,
 * with a search box for the coach who already knows the name. Escape and a
 * backdrop click close it, like the completion bell.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { groupTemplates, type PickableTemplate } from "../lib/templateGroups";
import type { PlanMode } from "../lib/e08plan";

/** Mode accents, the same families the discipline chips use: depth = accent,
 *  pool = recover, dry = amber. General is deliberately plain. */
const MODE_STYLE: Record<
  PlanMode,
  { label: string; text: string; ring: string; hover: string }
> = {
  depth: {
    label: "Depth",
    text: "text-accent",
    ring: "border-accent/40",
    hover: "hover:border-accent/60",
  },
  pool: {
    label: "Pool",
    text: "text-recover",
    ring: "border-recover/40",
    hover: "hover:border-recover/60",
  },
  dry: {
    label: "Dry",
    text: "text-amber",
    ring: "border-amber/40",
    hover: "hover:border-amber/60",
  },
  general: {
    label: "General",
    text: "text-textDim",
    ring: "border-border",
    hover: "hover:border-textDim",
  },
};

export function TemplatePicker({
  items,
  onPick,
  triggerLabel,
  title,
  className = "",
}: {
  items: PickableTemplate[];
  onPick: (id: string) => void;
  triggerLabel: string;
  title: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => groupTemplates(items, query), [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // A tick so the panel is in the DOM before we focus into it.
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        className={`text-xs text-textDim hover:text-accent ${className}`}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-label={title}
            className="flex max-h-[80vh] w-full max-w-4xl flex-col gap-3 rounded-xl border border-border bg-panel p-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <h3 className="font-heading text-sm uppercase tracking-[0.2em] text-text">
                {title}
              </h3>
              <input
                ref={searchRef}
                className="field ml-auto w-56"
                placeholder={t("Search templates…")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-textDim hover:text-accent"
              >
                {t("Close")}
              </button>
            </div>

            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-textDim">
                {t("No templates match.")}
              </p>
            ) : (
              <div
                className="grid gap-3 overflow-y-auto"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                }}
              >
                {groups.map(({ mode, items: list }) => {
                  const st = MODE_STYLE[mode];
                  return (
                    <div key={mode} className="min-w-0">
                      <div
                        className={`mb-2 border-b pb-1 font-mono text-[10px] uppercase tracking-[0.25em] ${st.text} ${st.ring}`}
                      >
                        {t(st.label)}{" "}
                        <span className="opacity-60">· {list.length}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {list.map((x) => (
                          <li key={x.id}>
                            <button
                              type="button"
                              onClick={() => {
                                onPick(x.id);
                                setOpen(false);
                              }}
                              className={`w-full rounded-lg border border-border bg-abyss px-3 py-2 text-left transition-colors hover:bg-panel ${st.hover}`}
                            >
                              <div className="truncate text-sm text-text">
                                {x.name}
                              </div>
                              <div className="mt-0.5 flex gap-2 truncate text-[11px] text-textDim">
                                {x.sub ? (
                                  <span className="truncate">{x.sub}</span>
                                ) : null}
                                {typeof x.count === "number" && (
                                  <span className="shrink-0">
                                    {x.sub ? "· " : ""}
                                    {x.count}
                                  </span>
                                )}
                                {x.useCount ? (
                                  <span className="ml-auto shrink-0 opacity-70">
                                    ×{x.useCount}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
