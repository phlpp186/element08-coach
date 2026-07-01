/**
 * IntakeEditor — the coach's intro-questionnaire block: physical stats + diving
 * experience, current training, goals, blockers, and health/safety. Coach-owned,
 * filled during onboarding (from a call, email, or an external form). Shared by
 * the manual roster detail and the connected-athlete detail. "Copy blank form"
 * puts the questions on the clipboard so a coach can paste them into a message
 * to send a prospect.
 */
import { useState } from 'react';
import type { Intake } from '../lib/types';
import { Labeled } from './sessions';
import { useT } from '../i18n';

export function IntakeEditor({
  value,
  onChange,
}: {
  value: Intake | undefined;
  onChange: (patch: Partial<Intake>) => void;
}) {
  const t = useT();
  const v = value ?? {};
  const [copied, setCopied] = useState(false);

  const set = (k: keyof Intake) => (e: { target: { value: string } }) => onChange({ [k]: e.target.value });

  const blankForm = [
    t('Intro questionnaire'),
    '',
    `${t('Height')}:`,
    `${t('Weight')}:`,
    `${t('Age')}:`,
    '',
    `${t('Diving experience')}:`,
    '',
    `${t('Current training')}:`,
    '',
    `${t('Goals')}:`,
    '',
    `${t("What's holding you back")}:`,
    '',
    `${t('Health & safety (injuries, equalisation, medical)')}:`,
    '',
  ].join('\n');

  const flagCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyForm = async () => {
    try {
      await navigator.clipboard.writeText(blankForm);
      flagCopied();
      return;
    } catch {
      /* async clipboard blocked — fall back to execCommand */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = blankForm;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flagCopied();
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={copyForm}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-textDim hover:border-accent hover:text-text"
        >
          {copied ? t('Copied ✓') : t('Copy blank form')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Labeled label={t('Height')}>
          <input className="field" placeholder="e.g. 180 cm" value={v.height ?? ''} onChange={set('height')} />
        </Labeled>
        <Labeled label={t('Weight')}>
          <input className="field" placeholder="e.g. 75 kg" value={v.weight ?? ''} onChange={set('weight')} />
        </Labeled>
        <Labeled label={t('Age')}>
          <input className="field" placeholder="e.g. 34" value={v.age ?? ''} onChange={set('age')} />
        </Labeled>
      </div>

      <Labeled label={t('Diving experience')}>
        <textarea
          className="field min-h-16"
          placeholder={t('Years diving, certifications, disciplines, PBs so far…')}
          value={v.experience ?? ''}
          onChange={set('experience')}
        />
      </Labeled>
      <Labeled label={t('Current training')}>
        <textarea
          className="field min-h-16"
          placeholder={t('What their week looks like now: pool, depth, dry, gym…')}
          value={v.currentTraining ?? ''}
          onChange={set('currentTraining')}
        />
      </Labeled>
      <Labeled label={t('Goals')}>
        <textarea
          className="field min-h-16"
          placeholder={t('What they want to achieve, and by when…')}
          value={v.goals ?? ''}
          onChange={set('goals')}
        />
      </Labeled>
      <Labeled label={t("What's holding you back")}>
        <textarea
          className="field min-h-16"
          placeholder={t('Fear, equalisation, contractions, time, technique…')}
          value={v.blockers ?? ''}
          onChange={set('blockers')}
        />
      </Labeled>
      <Labeled label={t('Health & safety (injuries, equalisation, medical)')}>
        <textarea
          className="field min-h-16"
          placeholder={t('Anything affecting safe training: injuries, ear/sinus issues, medical…')}
          value={v.health ?? ''}
          onChange={set('health')}
        />
      </Labeled>
    </div>
  );
}
