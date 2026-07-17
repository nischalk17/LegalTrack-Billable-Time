import { useEffect, useState } from 'react';

const VARS = ['accent', 'accent2', 'green', 'yellow', 'red', 'purple', 'surface', 'border', 'text2'] as const;
type ThemeColors = Record<(typeof VARS)[number], string>;

function readColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const name of VARS) out[name] = style.getPropertyValue(`--${name}`).trim();
  return out;
}

const FALLBACK: ThemeColors = {
  accent: '#5b9dff', accent2: '#2f6fed', green: '#3fd67a', yellow: '#e8a93e',
  red: '#ff6363', purple: '#a78bfa', surface: '#151920', border: '#232a35', text2: '#8f99a8',
};

/** Recharts needs literal color strings, not CSS var() — this reads the
 * live theme's resolved values and re-reads them whenever data-theme
 * changes, so charts stay correct across a light/dark toggle. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    setColors(readColors());
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
