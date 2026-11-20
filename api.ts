import { supabase } from './supabase';
import type { ImageShape, Interval, PlanId, PlanLimits } from '../../shared/plans';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function token(): Promise<string> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  if (!data.session) throw new ApiError('Sesión caducada. Vuelve a entrar.', 401);
  return data.session.access_token;
}

async function fail(res: Response, fallback: string): Promise<never> {
  const body: any = await res.json().catch(() => ({}));
  throw new ApiError(body.error || fallback, res.status, body.code);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + '/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) return fail(res, 'Error inesperado.');
  return (await res.json().catch(() => ({}))) as T;
}

export interface Usage { messages: number; searches: number; images: number; audios: number; generations: number; deep: number }
export interface Me {
  email: string;
  plan: PlanId;
  limits: PlanLimits;
  usage: Usage;
  month: Usage;
  tokens: { today: number; month: number; limit: number };
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
}

export const getMe = () => call<Me>('/me');
export const getProfile = () => call<{ displayName: string; instructions: string }>('/profile');
export const saveProfile = (p: { displayName: string; instructions: string }) => call<{ ok: true }>('/profile', { method: 'PUT', body: JSON.stringify(p) });
export const startCheckout = (plan: 'plus' | 'pro', interval: Interval) => call<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, interval }) });
export const getSuggestions = (conversationId: string) => call<{ suggestions: string[] }>('/suggest', { method: 'POST', body: JSON.stringify({ conversationId }) }).then((r) => r.suggestions).catch(() => [] as string[]);
export const openPortal = () => call<{ url: string }>('/billing/portal', { method: 'POST' });
export const exportData = () => call<unknown>('/account/export');
export const deleteAccount = () => call<{ ok: true }>('/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'ELIMINAR' }) });
export const renameConversation = (id: string, title: string) => call<{ ok: true }>(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
export const deleteConversation = (id: string) => call<{ ok: true }>(`/conversations/${id}`, { method: 'DELETE' });

export async function streamChat(opts: {
  conversationId?: string;
  message: string;
  webSearch: boolean;
  images?: string[];
  files?: Array<{ name: string; data: string }>;
  mode: 'fast' | 'deep';
  style?: string;
  regenerate?: boolean;
  editMessageId?: string;
  signal: AbortSignal;
  onMeta: (m: { conversationId: string; messageId: string; userMessageId: string }) => void;
  onDelta: (t: string) => void;
}): Promise<void> {
  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    signal: opts.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({
      conversationId: opts.conversationId, message: opts.message, webSearch: opts.webSearch,
      images: opts.images, files: opts.files, mode: opts.mode, style: opts.style, regenerate: opts.regenerate, editMessageId: opts.editMessageId,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok || !res.body) return fail(res, 'No se pudo completar la solicitud.');
  opts.onMeta({
    conversationId: res.headers.get('X-Conversation-Id') || opts.conversationId || '',
    messageId: res.headers.get('X-Message-Id') || '',
    userMessageId: res.headers.get('X-User-Message-Id') || '',
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    opts.onDelta(dec.decode(value, { stream: true }));
  }
}

export const generateImage = (p: { conversationId?: string; prompt: string; shape: ImageShape }) =>
  call<{ conversationId: string; messageId: string; path: string; alt: string }>('/images', { method: 'POST', body: JSON.stringify(p) });

export async function transcribe(audio: Blob | File): Promise<string> {
  const fd = new FormData();
  fd.append('file', audio, (audio as File).name || 'audio');
  const res = await fetch(BASE + '/api/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: fd });
  if (!res.ok) return fail(res, 'No se pudo transcribir el audio.');
  return ((await res.json()) as { text: string }).text;
}

// Reduce la foto en el navegador (ahorra datos, cuota y tiempo).
export function prepareImage(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

export async function signedImageUrl(path: string): Promise<string | null> {
  const { data } = (await supabase?.storage.from('generated').createSignedUrl(path, 3600)) ?? { data: null };
  return data?.signedUrl ?? null;
}
