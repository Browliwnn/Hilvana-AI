export type Theme = 'system' | 'light' | 'dark';
const KEY = 'hv-theme';

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

export function applyTheme(t: Theme) {
  const r = document.documentElement;
  if (t === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* sin almacenamiento */ }
}

export const nextTheme = (t: Theme): Theme => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');
