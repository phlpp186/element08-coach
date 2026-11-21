/**
 * A week's ⋯ menu. It floats above the page at its button: inside the
 * calendar's scroll box it would be cut off by the library rail and the box's
 * bottom edge (Philipp's report on the mockup, 2026-11-21). It opens upwards
 * when there is no room below, and closes on a scroll, Escape or a click
 * elsewhere.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';

export interface WeekMenuActions {
  onOpen?: () => void;
  onInsert: () => void;
  onCopyNext: () => void;
  onSaveTemplate: () => void;
  onClear: () => void;
  onDelete?: () => void;
}

export function WeekMenu({
  anchor,
  onClose,
  actions,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  actions: WeekMenuActions;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setStyle({ left, top });
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!ref.current?.contains(n) && !anchor.contains(n)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const scroll = () => onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [anchor, onClose]);

  const item = (label: string, run: (() => void) | undefined, danger = false) => (
    <button
      disabled={!run}
      onClick={() => {
        onClose();
        run?.();
      }}
      className={`block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent/10 disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-red' : 'text-text'
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', zIndex: 55, ...style }}
      className="board w-60 p-1.5 shadow-lg"
    >
      {actions.onOpen && item(t('Open this week'), actions.onOpen)}
      {item(t('Insert a week before'), actions.onInsert)}
      {item(t('Copy to next week'), actions.onCopyNext)}
      {item(t('Save week as template'), actions.onSaveTemplate)}
      {item(t('Clear this week'), actions.onClear)}
      <hr className="my-1 border-border" />
      {item(t('Delete week'), actions.onDelete, true)}
      <p className="px-3 pb-1 pt-0.5 text-xs text-textDim">
        {actions.onDelete
          ? t('The weeks after it move one week earlier. Competitions keep their dates.')
          : t('A plan keeps at least one week.')}
      </p>
    </div>,
    document.body,
  );
}
