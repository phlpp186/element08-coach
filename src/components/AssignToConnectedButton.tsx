/**
 * AssignToConnectedButton — in the plan builder's bottom bar, assigns the plan
 * to a connected (paired) athlete, who receives it live in the app.
 * Coach-only; renders nothing when signed out / not a coach.
 *
 * Flow: the builder saves the plan and sends it to the plan library (which may
 * ask who of its current athletes gets this version) → assign the plan's
 * library row. The .e08plan download stays as the account-free fallback.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useRoster } from '../lib/supabase/useRoster';
import { assignPlan } from '../lib/supabase/coachData';
import { getCloudPlanLink } from '../lib/supabase/cloudPlanLinks';

type Msg = { text: string; ok: boolean };
type MenuAthlete = { studentId: string; name: string };

export function AssignToConnectedButton({
  ready,
  ensurePublished,
  menuBelow = false,
  onMessage,
}: {
  ready: boolean;
  /** Open the athlete list below the button when there is room (it opens
   *  upward from the builder's bottom bar). The list is drawn on top of the
   *  page, so a scrolling panel around the button cannot cut it off. */
  menuBelow?: boolean;
  /** Show the result line ("Assigned to …") in the caller's own layout
   *  instead of floating beside the button. */
  onMessage?: (msg: Msg | null) => void;
  /** Save the plan and send it to the library. Its saved-plan id, or null
   *  when it could not reach the library (clash or offline). */
  ensurePublished: () => Promise<string | null>;
}) {
  const t = useT();
  const { session, isCoach } = useAuth();
  const { athletes, loading } = useRoster();

  if (!session || !isCoach) return null;

  async function assign(studentId: string, name: string): Promise<Msg> {
    try {
      const recId = await ensurePublished();
      const cloudId = recId ? getCloudPlanLink(recId)?.cloudPlanId : undefined;
      if (!cloudId)
        return { text: t('Could not reach the library. Check your connection and try again.'), ok: false };
      await assignPlan(cloudId, studentId);
      return { text: `${t('Assigned to')} ${name} ✓`, ok: true };
    } catch (e) {
      return { text: (e as Error).message, ok: false };
    }
  }

  return (
    <AssignMenu
      ready={ready}
      menuBelow={menuBelow}
      onMessage={onMessage}
      athletes={athletes}
      loading={loading}
      assign={assign}
    />
  );
}

/** The button and its athlete list, without the account behind it. */
export function AssignMenu({
  ready,
  menuBelow = false,
  onMessage,
  athletes,
  loading,
  assign,
}: {
  ready: boolean;
  menuBelow?: boolean;
  onMessage?: (msg: Msg | null) => void;
  athletes: MenuAthlete[];
  loading: boolean;
  assign: (studentId: string, name: string) => Promise<Msg>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsgState] = useState<Msg | null>(null);
  const setMsg = (m: Msg | null) => {
    setMsgState(m);
    onMessage?.(m);
  };
  async function pick(studentId: string, name: string) {
    setBusy(studentId);
    setMsg(null);
    const res = await assign(studentId, name);
    setMsg(res);
    if (res.ok) setOpen(false);
    setBusy(null);
  }
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  // Place the list against the button in window coordinates: below when asked
  // and it fits, else above; never outside the window.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const gap = 8;
      const width = Math.min(256, window.innerWidth - 2 * gap);
      const left = Math.max(gap, Math.min(b.right - width, window.innerWidth - width - gap));
      const below = window.innerHeight - b.bottom - 2 * gap;
      const above = b.top - 2 * gap;
      const wanted = menuRef.current?.scrollHeight ?? 200;
      const down = menuBelow ? below >= Math.min(wanted, 160) || below >= above : above < Math.min(wanted, 160) && below > above;
      setPos(
        down
          ? { left, width, top: b.bottom + gap, maxHeight: below }
          : { left, width, bottom: window.innerHeight - b.top + gap, maxHeight: above },
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, menuBelow, athletes.length, loading]);

  // A click anywhere else, or Escape, closes the list.
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!menuRef.current?.contains(n) && !btnRef.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!ready}
        onClick={() => {
          setMsg(null);
          setOpen((v) => !v);
        }}
        className="pill text-accent px-4 py-2"
      >
        {t('Assign…')}
      </button>

      {msg && !open && !onMessage && (
        <div
          className={`absolute right-0 whitespace-nowrap text-xs ${menuBelow ? 'top-full mt-2' : 'bottom-full mb-2'} ${msg.ok ? 'text-recover' : 'text-red'}`}
        >
          {msg.text}
        </div>
      )}

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="board fixed z-[70] overflow-y-auto p-2"
          style={pos ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          <p className="px-2 py-1 text-xs text-textDim">{t('Assign to a connected athlete:')}</p>
          {loading ? (
            <p className="px-2 py-2 text-sm text-textDim">{t('Loading…')}</p>
          ) : athletes.length === 0 ? (
            <p className="px-2 py-2 text-sm text-textDim">
              {t('No connected athletes yet. Invite one from the Athletes page.')}
            </p>
          ) : (
            athletes.map((a) => (
              <button
                key={a.studentId}
                disabled={!!busy}
                onClick={() => void pick(a.studentId, a.name)}
                className="block w-full text-left px-2 py-2 text-sm rounded hover:bg-accent/10 disabled:opacity-50"
              >
                {busy === a.studentId ? '…' : a.name}
              </button>
            ))
          )}
          {msg && !msg.ok && <p className="px-2 py-1 text-xs text-red">{msg.text}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
