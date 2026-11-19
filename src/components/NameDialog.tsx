/**
 * NameDialog — asks for a plan name that no other plan carries: for a
 * duplicate, and for a new version saved beside the one the athletes keep.
 * Opens with the old name selected, and only saves once it has been changed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { nameProblem } from '../lib/planName';
import { useT } from '../i18n';

export function NameDialog({
  title,
  hint,
  initial,
  taken,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  hint: ReactNode;
  initial: string;
  /** Names of the plans that exist already. */
  taken: readonly string[];
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const problem = nameProblem(name, taken);
  const submit = () => {
    if (!problem && !busy) onConfirm(name.trim());
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div
        className="board w-full max-w-md space-y-3 p-5"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-lg">{title}</h3>
        <p className="text-sm text-textDim">{hint}</p>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-textDim">{t('Name')}</span>
          <input
            ref={ref}
            className="field font-heading"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape' && !busy) onCancel();
            }}
          />
        </label>
        <p className={`min-h-4 text-xs ${problem === 'taken' ? 'text-amber' : 'text-textDim'}`}>
          {problem === 'taken' ? t('Another plan has this name already. Change it to continue.') : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!!problem || busy}
            onClick={submit}
            className="rounded-lg bg-accent px-4 py-2 font-heading text-ink disabled:opacity-50"
          >
            {confirmLabel}
          </button>
          <button disabled={busy} onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
