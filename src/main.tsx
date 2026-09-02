import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { AuthProvider } from './lib/supabase/AuthProvider';

// Dev-only visual harness, reached at ?preview=blockstrip. Never in a build:
// import.meta.env.DEV is false in production, so the branch is dropped.
const previewName =
  import.meta.env.DEV && new URLSearchParams(location.search).get('preview');

if (previewName === 'billing') {
  void import('./dev/BillingPreview').then(({ BillingPreview }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BillingPreview />
      </StrictMode>,
    );
  });
} else if (previewName === 'blockstrip') {
  void import('./dev/BlockStripPreview').then(({ BlockStripPreview }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BlockStripPreview />
      </StrictMode>,
    );
  });
} else if (previewName === 'measure') {
  void import('./dev/MeasurePreview').then(({ MeasurePreview }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <MeasurePreview />
      </StrictMode>,
    );
  });
} else if (previewName === 'pooltrace') {
  void import('./dev/PoolTracePreview').then(({ PoolTracePreview }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <PoolTracePreview />
      </StrictMode>,
    );
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  );
}
