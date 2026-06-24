import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthProvider } from './lib/supabase/AuthProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeToggle />
      <App />
    </AuthProvider>
  </StrictMode>,
);
