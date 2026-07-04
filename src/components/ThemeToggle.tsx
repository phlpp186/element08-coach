import { useEffect, useState } from 'react';
import { useT } from '../i18n';

const KEY = 'element08.theme';

type Theme = 'light' | 'mid' | 'dark';
const ORDER: Theme[] = ['light', 'mid', 'dark'];
const LABEL: Record<Theme, string> = { light: 'Caribbean', mid: 'Misty', dark: 'Chalk Dark' };

/** Explicit stored choice, or null when the OS preference should decide.
 *  Retired values ('neon'/'sky') read as no preference. */
function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'mid' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function osTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(t: Theme) {
  const cl = document.documentElement.classList;
  cl.toggle('light', t === 'light');
  cl.toggle('mid', t === 'mid');
}

/** Cycles Caribbean (light) → Misty (mid) → Chalk Dark. Toggles the `light`
 *  or `mid` class on <html> (dark = no class); an explicit click persists the
 *  choice, otherwise the OS color scheme decides light/dark (index.html
 *  resolves it before first paint to avoid a flash). */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? osTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS scheme changes as long as the user hasn't picked explicitly.
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => {
      if (readStored() === null) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const next: Theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  const pick = () => {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked — theme still applies for this session */
    }
  };

  return (
    <button
      onClick={pick}
      aria-label={`${t('Theme:')} ${LABEL[theme]}. ${t('Switch to')} ${LABEL[next]}.`}
      title={`${t('Theme:')} ${LABEL[theme]}, ${t('switch to')} ${LABEL[next]}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel/80 text-textDim backdrop-blur transition-colors hover:border-accent hover:text-accent"
    >
      {theme === 'light' ? <SunIcon /> : theme === 'mid' ? <MidIcon /> : <MoonIcon />}
    </button>
  );
}

function MidIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
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
