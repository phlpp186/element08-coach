/**
 * /plan/template/new and /plan/template/:id: the session template editor
 * over the library shared with the phone app. Saving writes the template's
 * row and returns to the Library's Templates tab.
 */
import { useMemo } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { useT } from '../i18n';
import { blankTemplate } from '../lib/coachTemplates/model';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useLibrary } from '../lib/supabase/planLibrary';
import { saveTemplate, useSharedTemplates } from '../lib/supabase/templateLibrary';
import { TemplateEditor } from '../components/templates/TemplateEditor';

const BACK = '/plan?tab=templates';

export function TemplateEditorView({ templateId }: { templateId: string | null }) {
  const t = useT();
  const { session, isCoach } = useAuth();
  const lib = useLibrary();
  const shared = useSharedTemplates();
  const found = templateId ? shared.find((s) => s.template.id === templateId) : undefined;
  // One blank template for the life of the view, not one per render.
  const blank = useMemo(() => blankTemplate('general'), []);

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
        onCancel={() => navigate(BACK)}
        onSave={async (tpl) => {
          await saveTemplate(tpl, found?.cloudId ?? null);
          navigate(BACK);
        }}
      />
    </main>
  );
}
