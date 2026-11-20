import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, getTheme, nextTheme, type Theme } from '../lib/theme';

const LABEL: Record<Theme, string> = { system: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: oscuro' };

export function ThemeToggle() {
  const [t, setT] = useState<Theme>(getTheme());
  const go = () => { const n = nextTheme(t); applyTheme(n); setT(n); };
  const Icon = t === 'light' ? Sun : t === 'dark' ? Moon : Monitor;
  return <button className="icon-btn" onClick={go} title={LABEL[t]} aria-label={LABEL[t]}><Icon size={18} /></button>;
}
