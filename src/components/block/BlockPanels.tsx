/**
 * The block editor's side panels: her numbers (what her phone last reported:
 * lifts and test results) and How it works (the block's options, as the app
 * shows them, each a change the block service rebuilds the plan with).
 */
import { DEFAULT_KG_STEP, testValue, withSwap, type BlockInfo, type BlockPatch, type BlockSource, type BlockTest, type Focus, type HerState, type PhoneStatus, type Pull } from '../../lib/appBlock';
import { fill, useT } from '../../i18n';

const FOCI: { id: Focus; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pool', label: 'Pool' },
  { id: 'both', label: 'Both' },
];
export const PULLS: { id: Pull; label: string }[] = [
  { id: 'assisted', label: 'Assisted' },
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'weighted', label: 'Weighted' },
];

const label = 'block text-xs font-bold text-textDim';

export function HerNumbers({ her, phone, tests }: { her: HerState | null; phone: PhoneStatus; tests: BlockTest[] }) {
  const t = useT();
  const rows = tests
    .map((test) => ({ test, base: testValue(test, her?.baseline[test.id]), re: testValue(test, her?.retest[test.id]) }))
    .filter((r) => r.base || r.re);
  return (
    <section className="board space-y-2 p-4">
      <div>
        <h3 className="font-heading text-sm text-text">{t('Her numbers')}</h3>
        <p className="text-xs text-textDim">{t('Her test results and next weights, as her phone last sent them.')}</p>
      </div>
      {!her || phone === 'none' ? (
        <p className="text-sm text-textDim">{t('Nothing from her phone yet')}</p>
      ) : (
        <>
          {her.lifts.length === 0 && rows.length === 0 && (
            <p className="text-sm text-textDim">{t('No tests or lifts logged yet.')}</p>
          )}
          {her.lifts.map((l) => (
            <div key={l.id} className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-1 text-sm">
              <span className="min-w-0 truncate text-text">{l.name}</span>
              <span className="shrink-0 text-textDim">
                {l.e1rm != null && fill(t('e1RM {n}'), { n: round1(l.e1rm) })}
                {l.e1rm != null && l.next != null && ' · '}
                {l.next != null && <b className="text-text">{fill(t('next {n} kg'), { n: round1(l.next) })}</b>}
                {l.e1rm == null && l.next == null && l.working != null && `${round1(l.working)} kg`}
              </span>
            </div>
          ))}
          {rows.map(({ test, base, re }) => (
            <div key={test.id} className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-1 text-sm">
              <span className="min-w-0 truncate text-text">{test.name}</span>
              <span className="shrink-0 text-right text-textDim">
                {base ?? '–'}
                {re && (
                  <>
                    {' → '}
                    <b className="text-text">{re}</b>
                  </>
                )}
              </span>
            </div>
          ))}
          {phone === 'waiting' && <p className="text-xs text-amber">{t('Waiting for her phone')}</p>}
        </>
      )}
    </section>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function HowItWorks({
  source,
  info,
  accessories,
  disabled,
  onChange,
}: {
  source: BlockSource;
  info: BlockInfo | null;
  accessories: string[];
  disabled: boolean;
  onChange: (patch: BlockPatch) => void;
}) {
  const t = useT();
  const names = info?.exercises ?? {};
  const nameOf = (id: string) => names[id] ?? id;
  const kg = source.kgStep ?? DEFAULT_KG_STEP;
  const excluded = new Set(source.excluded ?? []);
  const pill = (on: boolean) => `pill px-2.5 py-1 text-xs ${on ? 'pill-on' : ''}`;

  return (
    <section className="board space-y-3 p-4">
      <div>
        <h3 className="font-heading text-sm text-text">{t('How it works')}</h3>
        <p className="text-xs text-textDim">{t('Swaps and Not for me apply to every week, as in the app.')}</p>
      </div>

      <div className="space-y-1">
        <span className={label}>{t('Where does she dive?')}</span>
        <div className="flex flex-wrap gap-1.5">
          {FOCI.map((f) => (
            <button key={f.id} disabled={disabled} onClick={() => source.focus !== f.id && onChange({ focus: f.id })} className={pill((source.focus ?? 'both') === f.id)}>
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>

      {info && info.kgSteps.length > 0 && (
        <div className="space-y-1">
          <span className={label}>{t('Smallest weight jump')}</span>
          <div className="flex flex-wrap gap-1.5">
            {info.kgSteps.map((k) => (
              <button key={k} disabled={disabled} onClick={() => k !== kg && onChange({ kgStep: k })} className={pill(k === kg)}>
                {fill(t('{n} kg'), { n: k })}
              </button>
            ))}
          </div>
        </div>
      )}

      {info && (
        <div className="space-y-1">
          <span className={label}>{t('Pull-ups')}</span>
          <div className="flex flex-wrap gap-1.5">
            {PULLS.map((p) => (
              <button key={p.id} disabled={disabled} onClick={() => p.id !== info.pull && onChange({ pull: p.id })} className={pill(info.pull === p.id)}>
                {t(p.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {info && info.mainLifts.some((l) => info.swaps[l]?.length) && (
        <div className="space-y-1.5">
          <span className={label}>{t('Swaps')}</span>
          {info.mainLifts
            .filter((l) => info.swaps[l]?.length)
            .map((lift) => (
              <label key={lift} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-text">{nameOf(lift)}</span>
                <select
                  className="field w-auto max-w-[11rem] py-1 text-xs"
                  disabled={disabled}
                  value={source.swaps?.[lift] ?? ''}
                  onChange={(e) => onChange({ swaps: withSwap(source.swaps, lift, e.target.value || null) })}
                >
                  <option value="">{t('As planned')}</option>
                  {info.swaps[lift].map((alt) => (
                    <option key={alt} value={alt}>
                      {nameOf(alt)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
      )}

      {accessories.length > 0 && (
        <div className="space-y-1">
          <span className={label}>{t('Not for me')}</span>
          <p className="text-xs text-textDim">{t('Tap an exercise to take it out of every week. Tap again to bring it back.')}</p>
          <div className="flex flex-wrap gap-1.5">
            {accessories.map((id) => {
              const off = excluded.has(id);
              return (
                <button
                  key={id}
                  disabled={disabled}
                  aria-pressed={off}
                  onClick={() =>
                    onChange({
                      excluded: off ? [...excluded].filter((x) => x !== id) : [...excluded, id],
                    })
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs disabled:opacity-50 ${
                    off ? 'border-amber/60 text-amber line-through' : 'border-border text-text hover:border-accent'
                  }`}
                >
                  {nameOf(id)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        <span className={label}>{t('Her cycle')}</span>
        <p className="text-sm text-text">{source.cycle ? t('Taken into account') : t('Not used')}</p>
        <p className="text-xs text-textDim">{t('Hers: she changes it in the app.')}</p>
      </div>
    </section>
  );
}
