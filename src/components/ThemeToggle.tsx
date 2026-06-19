import { useEffect, useState } from 'react';

const KEY = 'element08.theme';

/** Floating dark/light switch. Toggles the `light` class on <html> and persists
 *  the choice; index.html applies it before first paint to avoid a flash. */
export function ThemeToggle() {
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'light';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    try {
      localStorage.setItem(KEY, light ? 'light' : 'dark');
    } catch {
      /* storage blocked — theme still applies for this session */
    }
  }, [light]);

  return (
    <button
      onClick={() => setLight((l) => !l)}
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
      title={light ? 'Dark theme' : 'Light theme'}
      className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panel/80 text-textDim backdrop-blur transition-colors hover:border-accent hover:text-accent"
    >
      {light ? <MoonIcon /> : <SunIcon />}
    </button>
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
