/**
 * The `app-block` edge function: builds and rebuilds app blocks (the S&C
 * base block) for the portal, which never holds a block itself (its code is
 * public). Coaches only.
 *
 * Every call resolves (never throws): a failure says why, so the editor can
 * say the service is not there yet, show a plan from a newer app read-only,
 * or report a refused change.
 */
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from './client';
import type { BlockAnswers, BlockInfo, BlockPatch, BlockPlan } from '../appBlock';

export interface AppBlockSummary {
  id: string;
  name: string;
  weeks: number;
}

export type BlockRequest =
  | { op: 'info'; plan?: BlockPlan }
  | { op: 'create'; block: string; start: string; answers?: BlockAnswers; name?: string }
  | { op: 'change'; plan: BlockPlan; patch: BlockPatch };

export interface BlockResponse {
  plan?: BlockPlan;
  info?: BlockInfo;
  blocks?: AppBlockSummary[];
}

/** unavailable: not deployed or not reachable. newer: the plan was made by
 *  a newer app than the service runs (409). */
export type BlockFailure = 'unavailable' | 'newer' | 'notCoach' | 'refused' | 'failed';

export type BlockCall =
  | { ok: true; data: BlockResponse }
  | { ok: false; reason: BlockFailure; message: string };

export interface BlockService {
  call(req: BlockRequest): Promise<BlockCall>;
}

async function errorText(res: Response | undefined): Promise<string> {
  try {
    const body = (await res?.clone().json()) as { error?: unknown; message?: unknown } | undefined;
    return String(body?.error ?? body?.message ?? '');
  } catch {
    return '';
  }
}

export const remoteBlockService: BlockService = {
  async call(req) {
    try {
      const { data, error } = await supabase.functions.invoke<BlockResponse>('app-block', { body: req });
      if (!error) {
        return data && typeof data === 'object'
          ? { ok: true, data }
          : { ok: false, reason: 'unavailable', message: '' };
      }
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response | undefined;
        const status = res?.status ?? 0;
        const message = await errorText(res);
        if (status === 404) return { ok: false, reason: 'unavailable', message };
        if (status === 409) return { ok: false, reason: 'newer', message };
        if (status === 401 || status === 403) return { ok: false, reason: 'notCoach', message };
        if (status === 400 || status === 413) return { ok: false, reason: 'refused', message };
        return { ok: false, reason: 'failed', message };
      }
      // A function that was never deployed fails its CORS preflight, which
      // reaches here as a fetch error, like no network at all.
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError)
        return { ok: false, reason: 'unavailable', message: error.message };
      return { ok: false, reason: 'failed', message: (error as Error).message ?? '' };
    } catch (e) {
      return { ok: false, reason: 'unavailable', message: (e as Error).message ?? '' };
    }
  },
};
