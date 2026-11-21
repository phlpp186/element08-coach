import { useEffect } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastMsg {
  text: string;
  actions?: ToastAction[];
}

/** One message at the bottom of the window. With actions (Undo) it stays
 *  longer and takes clicks. */
export function Toast({ msg, onClose }: { msg: ToastMsg | null; onClose: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(onClose, msg.actions?.length ? 7000 : 2200);
    return () => window.clearTimeout(id);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-panel px-4 py-2 text-sm text-text shadow-lg"
    >
      <span className="min-w-0 truncate">{msg.text}</span>
      {msg.actions?.map((a) => (
        <button
          key={a.label}
          onClick={() => {
            onClose();
            a.run();
          }}
          className="pill shrink-0 px-3 py-0.5 text-xs"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
