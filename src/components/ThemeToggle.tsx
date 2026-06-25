import { useEffect, useState } from 'react';

const KEY = 'element08.theme';

type Theme = 'dark' | 'light' | 'neon';
const ORDER: Theme[] = ['dark', 'light', 'neon'];
const LABEL: Record<Theme, string> = { dark: 'Dark', light: 'Light', neon: 'Neon' };

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'neon' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle('light', t === 'light');
  root.classList.toggle('neon', t === 'neon');
}

/** Floating theme switch that cycles Dark → Light → Neon. Toggles the matching
 *  class on <html> and persists the choice; index.html applies it before first
 *  paint to avoid a flash. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage blocked — theme still applies for this session */
    }
  }, [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[theme]} — switch to ${LABEL[next]}`}
      className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panel/80 text-textDim backdrop-blur transition-colors hover:border-accent hover:text-accent"
    >
      {theme === 'light' ? <SunIcon /> : theme === 'neon' ? <BoltIcon /> : <MoonIcon />}
    </button>
  );
}

function BoltIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
