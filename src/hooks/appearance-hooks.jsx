// designer.md §16 - appearance-hooks.jsx (v1.0, 30-09-2026). Copy verbatim into every web build.
// useAppearance: theme and font scale (§12), persisted to localStorage, applied to <html>.
// useRipple: the §9.3 ripple. Usage: <button className="state-layer ..." onPointerDown={ripple}>.
import { useCallback, useEffect, useState } from 'react';

const THEMES = ['system', 'light', 'dark'];
const SCALES = ['compact', 'default', 'large', 'xlarge'];

function read(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: keep in memory */ }
}
function applyTheme(theme) {
  const dark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useAppearance() {
  const [theme, setThemeState] = useState(() => read('ui.theme', THEMES, 'system'));
  const [fontScale, setFontScaleState] = useState(() => read('ui.fontScale', SCALES, 'default'));

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system'); // follow the device live while on Auto
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
  }, [fontScale]);

  const setTheme = useCallback((t) => {
    if (!THEMES.includes(t)) return;
    write('ui.theme', t); setThemeState(t);
  }, []);
  const setFontScale = useCallback((s) => {
    if (!SCALES.includes(s)) return;
    write('ui.fontScale', s); setFontScaleState(s);
  }, []);

  return { theme, setTheme, themes: THEMES, fontScale, setFontScale, fontScales: SCALES };
}

export function useRipple() {
  return useCallback((event) => {
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0; // keyboard activation: centre
    const x = keyboard ? rect.width / 2 : event.clientX - rect.left;
    const y = keyboard ? rect.height / 2 : event.clientY - rect.top;
    const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.setProperty('width', `${radius * 2}px`);
    span.style.setProperty('height', `${radius * 2}px`);
    span.style.setProperty('left', `${x - radius}px`);
    span.style.setProperty('top', `${y - radius}px`);
    host.appendChild(span);
    span.addEventListener('animationend', (e) => {
      if (e.animationName === 'ripple-fade') span.remove();
    });
    window.setTimeout(() => span.remove(), 1000); // reduced motion: animationend may not fire
  }, []);
}
