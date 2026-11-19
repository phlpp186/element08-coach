/**
 * The Library's Templates tab: the coach's session templates, the same list
 * as in the phone app (Coaching › Templates). Each one can be sent to an
 * athlete as a single session, edited, duplicated or deleted; "+ from
 * template" in the plan builder reads the same list.
 */
import { useEffect, useState } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import { fill, useT } from '../../i18n';
import { useSessionTemplates } from '../../lib/library';
import { duplicateTemplate, sortTemplates, usesPB, type CoachTemplate } from '../../lib/coachTemplates/model';
import { missingTargets, pbMapFrom, resolveTemplate, type PBMap } from '../../lib/coachTemplates/resolve';
import { templateSummary } from '../../lib/coachTemplates/summary';
import { templateTr } from '../../lib/coachTemplates/tr';
import { useAuth } from '../../lib/supabase/AuthProvider';
import { parsePBs } from '../../lib/supabase/athleteProfileCloud';
import { getAthleteProfile } from '../../lib/supabase/coachData';
import {
  deleteTemplate,
  saveTemplate,
  sendTemplate,
  useSharedTemplates,
  type SharedTemplate,
} from '../../lib/supabase/templateLibrary';
import { useRoster } from '../../lib/supabase/useRoster';
import { todayIso } from '../../lib/e08plan';
import { TYPE_LABEL } from './TemplateEditor';

export function TemplatesLibrary({ editedAgo }: { editedAgo: (iso: string) => string }) {
  const t = useT();
  const shared = useSharedTemplates();
  const local = useSessionTemplates();
  const [sending, setSending] = useState<SharedTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(shared.map((s) => [s.template.id, s]));
  const list = sortTemplates(shared.map((s) => s.template)).map((x) => byId.get(x.id)!);
  const tr = templateTr();

  const run = (p: Promise<unknown>) => {
    setError(null);
    p.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-textDim">
          {t('Reusable sessions: exercises, a dry table, a fitness program. Send one to an athlete or add it to a plan with + from template. The same list is in the app under Coaching › Templates.')}
        </p>
        <button
          onClick={() => navigate('/plan/template/new')}
          className="pill pill-on btn-raised px-3 py-1.5 text-sm"
        >
          + {t('New template')}
        </button>
      </div>
      {local.length > 0 && (
        <p className="text-sm text-amber">
          {fill(
            t('{n} template(s) saved in this browser are still being moved here. They stay in the browser until the move is confirmed.'),
            { n: local.length },
          )}
        </p>
      )}
      {error && <p className="text-sm text-red">{error}</p>}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-textDim">
          {t('No templates yet. Make one here or in the app.')}
        </div>
      ) : (
        <div className="board">
          {list.map(({ cloudId, template: tpl, updatedAt }) => (
            <div
              key={cloudId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 text-sm last:border-b-0"
            >
              <button
                onClick={() => navigate(`/plan/template/${encodeURIComponent(tpl.id)}`)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="font-heading">{tpl.name}</span>
                <span className="block truncate text-xs text-textDim">
                  {templateSummary(tpl, false, tr)}
                  {usesPB(tpl) ? ` · ${t('relative to PB')}` : ''}
                </span>
              </button>
              <span className="text-textDim">{t(TYPE_LABEL[tpl.type])}</span>
              <span className="text-textDim">
                {tpl.useCount > 0 ? fill(t('used {n}×'), { n: tpl.useCount }) : t('not sent yet')}
              </span>
              <span className="text-textDim">{editedAgo(updatedAt)}</span>
              <span className="flex gap-3 text-xs font-semibold uppercase tracking-wide">
                <button onClick={() => setSending({ cloudId, template: tpl, updatedAt })} className="text-accent">
                  {t('Send to athlete')}
                </button>
                <button
                  onClick={() => navigate(`/plan/template/${encodeURIComponent(tpl.id)}`)}
                  className="text-textDim hover:text-text"
                >
                  {t('Edit')}
                </button>
                <button
                  onClick={() =>
                    run(saveTemplate(duplicateTemplate(tpl, fill(t('{name} (copy)'), { name: tpl.name })), null))
                  }
                  className="text-textDim hover:text-text"
                >
                  {t('Duplicate')}
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        t('Delete this template? Sessions you already sent stay with your athletes.'),
                      )
                    )
                      run(deleteTemplate(cloudId));
                  }}
                  className="text-red"
                >
                  {t('Delete')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {sending && <SendDialog item={sending} onClose={() => setSending(null)} />}
    </div>
  );
}

/** Send one session from a template to one athlete on a date. */
function SendDialog({ item, onClose }: { item: SharedTemplate; onClose: () => void }) {
  const t = useT();
  const { profile } = useAuth();
  const { athletes, loading } = useRoster();
  const tpl: CoachTemplate = item.template;
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [pbs, setPbs] = useState<PBMap>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Only an older template has targets relative to a PB; then the athlete's
  // published PBs decide the numbers, and a missing one is typed in.
  const relative = usesPB(tpl);
  useEffect(() => {
    setPbs({});
    setOverrides({});
    if (!studentId || !relative) return;
    let live = true;
    getAthleteProfile(studentId)
      .then((row) => live && setPbs(pbMapFrom(parsePBs(row?.pbs))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [studentId, relative]);

  const typed: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const n = Number(v.replace(',', '.'));
    if (n > 0) typed[k] = n;
  }
  const missing = studentId ? missingTargets(resolveTemplate(tpl, pbs)) : [];
  const ready =
    !!studentId &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    missingTargets(resolveTemplate(tpl, pbs, typed)).length === 0;

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const added = await sendTemplate({
        template: tpl,
        cloudId: item.cloudId,
        studentId,
        pbs,
        overrides: typed,
        dates: [date],
        coachName: profile?.display_name ?? '',
        t: templateTr(),
      });
      setMsg({
        ok: true,
        text: added
          ? t('Sent. It shows in their Today and plan.')
          : t('That session is already in their plan for this day.'),
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const title = fill(t('Send “{name}”'), { name: tpl.name });
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-textDim';
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="board max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-heading text-base text-text">{title}</h3>
          <button onClick={onClose} className="px-1 text-textDim hover:text-text" aria-label={t('Close')}>
            ✕
          </button>
        </div>
        {athletes.length === 0 ? (
          <p className="text-sm text-textDim">
            {loading ? t('Loading…') : t('No connected athletes yet. Share an invite code first.')}
          </p>
        ) : (
          <>
            <label className="block">
              <span className={label}>{t('Athlete')}</span>
              <select
                className="field w-full px-3 py-2 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">{t('Choose an athlete')}</option>
                {athletes.map((a) => (
                  <option key={a.studentId} value={a.studentId}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{t('Date')}</span>
              <input
                type="date"
                className="field w-full px-3 py-2 text-sm"
                value={date}
                min={todayIso()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {missing.map((m) => (
              <label key={m.blockId} className="block">
                <span className={label}>
                  {fill(
                    m.unit === 's'
                      ? t('No PB for {discipline}: seconds for this athlete')
                      : t('No PB for {discipline}: metres for this athlete'),
                    { discipline: m.discipline },
                  )}
                </span>
                <input
                  className="field w-32 px-3 py-2 text-sm"
                  inputMode="decimal"
                  value={overrides[m.blockId] ?? ''}
                  onChange={(e) => setOverrides({ ...overrides, [m.blockId]: e.target.value })}
                />
              </label>
            ))}
            {msg && <p className={`text-sm ${msg.ok ? 'text-recover' : 'text-red'}`}>{msg.text}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="pill px-3 py-1.5 text-sm">
                {t('Close')}
              </button>
              <button
                onClick={send}
                disabled={!ready || busy}
                className="pill pill-on btn-raised px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {busy ? t('Sending…') : t('Send to athlete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
