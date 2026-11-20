import { memo, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Download, Pencil, RotateCw, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react';
import { signedImageUrl } from '../lib/api';

const PROTO = 'hilvana-img:';

function GeneratedImage({ path, alt }: { path: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let on = true; signedImageUrl(path).then((u) => { if (!on) return; u ? setUrl(u) : setFailed(true); }); return () => { on = false; }; }, [path]);
  if (failed) return <span className="img-ph">La imagen ya no está disponible.</span>;
  if (!url) return <span className="img-ph shimmer" />;
  return (
    <span className="gen-img">
      <img src={url} alt={alt || 'Imagen creada con IA'} loading="lazy" />
      <a href={url} download="hilvana-ai.webp" className="gen-dl" aria-label="Descargar imagen"><Download size={15} /> Descargar</a>
    </span>
  );
}

function CodePre({ children }: { children?: ReactNode }) {
  const [ok, setOk] = useState(false);
  const el: any = Array.isArray(children) ? children[0] : children;
  const raw = el?.props?.children;
  const text = (Array.isArray(raw) ? raw.join('') : String(raw ?? '')).replace(/\n$/, '');
  const lang = /language-([\w+-]+)/.exec(el?.props?.className || '')?.[1];
  return (
    <div className="codeblock">
      <div className="code-head"><span>{lang || 'código'}</span>
        <button onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* sin permiso */ } }}>{ok ? 'Copiado' : 'Copiar'}</button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export interface MsgData { id?: string; role: 'user' | 'assistant'; content: string; rating?: 1 | -1 }

function speak(text: string, on: () => void, off: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const clean = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_`>|~-]{1,}/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const u = new SpeechSynthesisUtterance(clean.slice(0, 6000));
  u.lang = /[¿¡ñáéíóú]/i.test(clean) ? 'es-ES' : document.documentElement.lang || 'es-ES';
  u.onend = off; u.onerror = off;
  on(); synth.speak(u);
}

export const Message = memo(function Message({ m, last, busy, onRegenerate, onRate, onEdit }: {
  m: MsgData; last: boolean; busy: boolean; onRegenerate: () => void; onRate: (r: 1 | -1) => void; onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [talking, setTalking] = useState(false);
  useEffect(() => () => { if (talking) window.speechSynthesis?.cancel(); }, [talking]);

  if (m.role === 'user') return (
    <div className="bubble-row user">
      {m.id && !busy && onEdit && <button className="edit-btn" title="Editar y reenviar" aria-label="Editar y reenviar" onClick={onEdit}><Pencil size={14} /></button>}
      <div className="bubble user"><p>{m.content}</p></div>
    </div>
  );

  const streaming = busy && last;
  return (
    <div className="bubble assistant">
      {m.content ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(u) => (u.startsWith(PROTO) ? u : /^(https?:|mailto:)/i.test(u) ? u : '')}
          components={{
            a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" />,
            pre: CodePre,
            img: ({ src, alt }) => (typeof src === 'string' && src.startsWith(PROTO) ? <GeneratedImage path={src.slice(PROTO.length)} alt={alt} /> : null),
          }}
        >{m.content}</ReactMarkdown>
      ) : <span className="dots"><i /><i /><i /></span>}

      {!streaming && m.content && (
        <div className="actions">
          <button title="Copiar" aria-label="Copiar" onClick={async () => { try { await navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin permiso */ } }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          {'speechSynthesis' in window && (
            <button title={talking ? 'Parar' : 'Escuchar'} aria-label={talking ? 'Parar' : 'Escuchar'} onClick={() => (talking ? (window.speechSynthesis.cancel(), setTalking(false)) : speak(m.content, () => setTalking(true), () => setTalking(false)))}>
              {talking ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
          {m.id && <>
            <button className={m.rating === 1 ? 'on' : ''} title="Respuesta útil" aria-label="Respuesta útil" onClick={() => onRate(1)}><ThumbsUp size={15} /></button>
            <button className={m.rating === -1 ? 'on' : ''} title="Respuesta mejorable" aria-label="Respuesta mejorable" onClick={() => onRate(-1)}><ThumbsDown size={15} /></button>
          </>}
          {last && !m.content.includes(PROTO) && <button title="Regenerar" aria-label="Regenerar" onClick={onRegenerate}><RotateCw size={15} /></button>}
        </div>
      )}
    </div>
  );
});
