/**
 * The block editor's working copy of one plan. Changes to the block (exercise
 * edits, deleted sessions, options) go through the block service, which
 * rebuilds the plan; sessions the coach adds change here. Either way nothing
 * is saved until the coach saves (the view owns that).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { sessionMetas, type BlockInfo, type BlockPatch, type BlockPlan, type SessionMeta } from '../../lib/appBlock';
import type { BlockFailure, BlockService } from '../../lib/supabase/appBlockService';

/** ready: the service knows the plan. unavailable/failed: it could not be
 *  asked, so only the coach's own sessions change. newer/notBlock: shown,
 *  not changed (a newer app made it, or no block did). */
export type DraftStatus = 'loading' | 'ready' | 'unavailable' | 'failed' | 'notCoach' | 'newer' | 'notBlock';

export interface BlockDraft {
  plan: BlockPlan | null;
  info: BlockInfo | null;
  status: DraftStatus;
  busy: boolean;
  /** Why the last change did not go through. */
  failure: { reason: BlockFailure; message: string } | null;
  dirty: boolean;
  /** Label and day of every session seen, for deleted ones. */
  known: Map<string, SessionMeta>;
  load(plan: BlockPlan): Promise<void>;
  change(patch: BlockPatch): Promise<boolean>;
  local(fn: (p: BlockPlan) => BlockPlan): void;
  markSaved(): void;
  retry(): Promise<void>;
}

const STATUS: Record<BlockFailure, DraftStatus> = {
  unavailable: 'unavailable',
  failed: 'failed',
  notCoach: 'notCoach',
  newer: 'newer',
  refused: 'notBlock',
};

export function useBlockDraft(service: BlockService): BlockDraft {
  const [plan, setPlan] = useState<BlockPlan | null>(null);
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const [status, setStatus] = useState<DraftStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BlockDraft['failure']>(null);
  const [dirty, setDirty] = useState(false);
  const known = useRef(new Map<string, SessionMeta>()).current;
  const planRef = useRef<BlockPlan | null>(null);
  const busyRef = useRef(false);

  const put = useCallback(
    (p: BlockPlan) => {
      sessionMetas(p, known);
      planRef.current = p;
      setPlan(p);
    },
    [known],
  );

  const askInfo = useCallback(
    async (p: BlockPlan) => {
      if (!p.source?.id) {
        setInfo(null);
        setStatus('notBlock');
        return;
      }
      setStatus('loading');
      const r = await service.call({ op: 'info', plan: p });
      if (r.ok && r.data.info) {
        setInfo(r.data.info);
        setStatus('ready');
      } else if (r.ok) {
        setStatus('failed');
      } else {
        setStatus(STATUS[r.reason]);
      }
    },
    [service],
  );

  const load = useCallback(
    async (p: BlockPlan) => {
      put(p);
      setDirty(false);
      setFailure(null);
      await askInfo(p);
    },
    [put, askInfo],
  );

  const retry = useCallback(async () => {
    if (planRef.current) await askInfo(planRef.current);
  }, [askInfo]);

  const change = useCallback(
    async (patch: BlockPatch) => {
      const p = planRef.current;
      if (!p || busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setFailure(null);
      try {
        const r = await service.call({ op: 'change', plan: p, patch });
        if (r.ok && r.data.plan) {
          put(r.data.plan);
          if (r.data.info) setInfo(r.data.info);
          setDirty(true);
          return true;
        }
        if (r.ok) {
          setFailure({ reason: 'failed', message: '' });
          return false;
        }
        setFailure({ reason: r.reason, message: r.message });
        if (r.reason === 'newer' || r.reason === 'unavailable' || r.reason === 'notCoach')
          setStatus(STATUS[r.reason]);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [service, put],
  );

  const local = useCallback(
    (fn: (p: BlockPlan) => BlockPlan) => {
      const p = planRef.current;
      if (!p || busyRef.current) return;
      put(fn(p));
      setDirty(true);
    },
    [put],
  );

  const markSaved = useCallback(() => setDirty(false), []);

  return useMemo(
    () => ({ plan, info, status, busy, failure, dirty, known, load, change, local, markSaved, retry }),
    [plan, info, status, busy, failure, dirty, known, load, change, local, markSaved, retry],
  );
}
