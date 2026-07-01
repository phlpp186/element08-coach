/**
 * InfoTip — a small circled "i" that toggles a short explanatory popover. Used
 * next to actions whose purpose isn't obvious (Import/Export formats, the
 * .e08plan file, roster backup). Click to open; click again or blur to close.
 */
import { useState } from 'react';

export function InfoTip({
  text,
  align = 'right',
  dir = 'down',
}: {
  text: string;
  align?: 'left' | 'right';
  dir?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="More info"
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] font-heading leading-none text-textDim transition-colors hover:border-accent hover:text-accent"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-40 w-64 rounded-lg border border-border bg-panel p-3 text-xs leading-relaxed text-textDim shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${dir === 'up' ? 'bottom-7' : 'top-7'}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
