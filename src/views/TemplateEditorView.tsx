/**
 * /plan/template/new and /plan/template/:id: the session template editor
 * over the library shared with the phone app. Saving writes the template's
 * row and returns to the Library's Templates tab.
 */
import { useEffect, useMemo } from 'react';
import { navigate, useRoute } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { blankTemplate, newPart, MAX_PART_TEXT } from '../lib/coachTemplates/model';
import { clearTemplateLines, stashedTemplateLines } from '../lib/templateDraft';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useLibrary } from '../lib/supabase/planLibrary';
import { saveTemplate, useSharedTemplates } from '../lib/supabase/templateLibrary';
import { TemplateEditor } from '../components/templates/TemplateEditor';

/** Where Save and Cancel lead: the page the coach came from. */
const BACK = { library: '/plan?tab=templates', exercises: '/exercises?view=templates' };

export function TemplateEditorView({ templateId }: { templateId: string | null }) {
  const t = useT();
  const { session, isCoach } = useAuth();
  const lib = useLibrary();
  const shared = useSharedTemplates();
  const found = templateId ? shared.find((s) => s.template.id === templateId) : undefined;
  const back = useRoute().query.get('from') === 'exercises' ? BACK.exercises : BACK.library;
  // One blank template for the life of the view, not one per render. It
  // starts with the exercises picked on the Exercises page, if any wait.
  const blank = useMemo(() => {
    const tpl = blankTemplate('general');
    const lines = templateId ? null : stashedTemplateLines();
    if (!lines) return tpl;
    const part = newPart('text');
    return {
      ...tpl,
      blocks: [{ ...part, exercise: { kind: 'text' as const, text: lines.join('\n').slice(0, MAX_PART_TEXT) } }],
    };
  }, [templateId]);
  useEffect(() => clearTemplateLines, []);

  const note = (text: string) => (
    <main className="mx-auto max-w-5xl px-5 py-6">
      <p className="text-sm text-textDim">{text}</p>
    </main>
  );
  if (!session || !isCoach) return note(t('Sign in as a coach to use templates.'));
  if (templateId && !found) {
    return note(lib.lastSyncAt ? t('Template not found.') : t('Loading…'));
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-6">
      <TemplateEditor
        key={found?.cloudId ?? 'new'}
        initial={found?.template ?? blank}
        onCancel={() => navigate(back)}
        onSave={async (tpl) => {
          await saveTemplate(tpl, found?.cloudId ?? null);
          navigate(back);
        }}
      />
    </main>
  );
}
