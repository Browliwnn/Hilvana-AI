import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Brain, FileText, Globe, ImagePlus, Menu, Mic, Palette, Paperclip, Pencil, Plus, Search, Square, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/session';
import { ApiError, deleteConversation, renameConversation, generateImage, getMe, getSuggestions, prepareImage, streamChat, transcribe, type Me } from '../lib/api';
import { useRecorder } from '../lib/recorder';
import { Link, navigate } from '../lib/router';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Message, type MsgData } from '../components/Message';
import { MAX_IMAGE_BYTES, STYLES, type ImageShape, type StyleId } from '../../shared/plans';

interface Conv { id: string; title: string }
interface Err { text: string; upgrade?: boolean }

const STARTERS: Array<{ t: string; s: string }> = [
  { t: 'Explícame el IVA como si tuviera 12 años', s: 'Respuesta clara y con ejemplos' },
  { t: 'Redacta un correo firme y amable para pedir un reembolso', s: 'Listo para copiar y enviar' },
  { t: 'Alquilar o comprar vivienda en España: pros y contras', s: 'Comparativa con cifras a tener en cuenta' },
  { t: 'Prepárame un plan de estudio de 4 semanas para inglés B2', s: 'Calendario semanal realista' },
  { t: 'Escribe una función en TypeScript que valide un IBAN español', s: 'Código completo con ejemplo de uso' },
  { t: 'Tengo este error en mi web y no sé por qué: pégalo y lo depuramos', s: 'Causa raíz y arreglo mínimo' },
];
const SHAPES: Array<{ id: ImageShape; label: string }> = [
  { id: 'square', label: 'Cuadrada' }, { id: 'portrait', label: 'Vertical' }, { id: 'landscape', label: 'Horizontal' },
];
const TIME_RE = /\b(hoy|ayer|ahora|actual(?:es|mente)?|[uú]ltim[oa]s?|precio|cotizaci[oó]n|noticias?|el tiempo|clima|resultado|qui[eé]n gan[oó]|202[5-9])\b/i;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Chat() {
  const { session, loading } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<MsgData[]>([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; index: number } | null>(null);
  const [web, setWeb] = useState(false);
  const [deep, setDeep] = useState(false);
  const [style, setStyle] = useState<StyleId>(() => { try { const v = localStorage.getItem('hv-style'); return v && v in STYLES ? (v as StyleId) : 'general'; } catch { return 'general'; } });
  const pickStyle = (v: StyleId) => { setStyle(v); try { localStorage.setItem('hv-style', v); } catch { /* sin almacenamiento */ } };
  const [imageMode, setImageMode] = useState(false);
  const [shape, setShape] = useState<ImageShape>('square');
  const [photos, setPhotos] = useState<Array<{ name: string; data: string }>>([]);
  const [docs, setDocs] = useState<Array<{ name: string; data: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<Err | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [side, setSide] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { document.title = 'Hilvana AI'; }, []);
  useEffect(() => { if (!loading && !session) navigate('/entrar', true); }, [loading, session]);

  const refreshMe = useCallback(() => { getMe().then(setMe).catch(() => {}); }, []);
  const refreshConvs = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('conversations').select('id,title').order('updated_at', { ascending: false }).limit(80);
    setConvs((data as Conv[]) ?? []);
  }, []);

  useEffect(() => { if (session) { refreshMe(); refreshConvs(); } }, [session, refreshMe, refreshConvs]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    const t = taRef.current;
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
  }, [text]);

  const limits = me?.limits;
  const fail = (e: any) => {
    if (e?.name === 'AbortError') return;
    setError({ text: e?.message || 'Error inesperado.', upgrade: e instanceof ApiError && (e.code === 'limit' || e.code === 'plan' || e.code === 'too_many_images' || e.code === 'too_long') });
  };

  // ---- Voz ----
  const doTranscribe = useCallback(async (blob: Blob | File) => {
    setError(null); setTranscribing(true);
    try {
      const t = await transcribe(blob);
      setText((prev) => (prev.trim() ? prev.trim() + '\n' : '') + t);
      taRef.current?.focus();
      refreshMe();
    } catch (e) { fail(e); } finally { setTranscribing(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMe]);
  const rec = useRecorder(limits?.audioMaxSeconds ?? 60, doTranscribe, (t) => setError({ text: t }));

  // ---- Conversaciones ----
  async function open(id: string) {
    if (busy || !supabase) return;
    setSide(false); setError(null); setActive(id); setImageMode(false); setSuggestions([]);
    const { data } = await supabase.from('messages').select('id,role,content').eq('conversation_id', id).order('created_at');
    const list = (data as MsgData[]) ?? [];
    setMsgs(list);
    const ids = list.filter((m) => m.role === 'assistant' && m.id).map((m) => m.id!);
    if (ids.length) {
      const { data: fb } = await supabase.from('feedback').select('message_id,rating').in('message_id', ids);
      if (fb?.length) setMsgs((cur) => cur.map((m) => { const f = fb.find((x: any) => x.message_id === m.id); return f ? { ...m, rating: f.rating as 1 | -1 } : m; }));
    }
  }

  function fresh() {
    if (busy) return;
    setActive(undefined); setMsgs([]); setEditing(null); setDocs([]); setError(null); setSide(false); setSuggestions([]); taRef.current?.focus();
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta conversación? Se borran también sus imágenes.')) return;
    try { await deleteConversation(id); } catch (e) { return fail(e); }
    if (active === id) fresh();
    refreshConvs();
  }

  // ---- Adjuntos ----
  async function onFiles(files: FileList | null) {
    if (!files || !limits) return;
    setError(null);
    for (const f of Array.from(files)) {
      try {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (photos.length + docs.length >= limits.imagesPerMessage) { setError({ text: `Tu plan admite ${limits.imagesPerMessage} adjunto(s) (fotos o PDF) por mensaje.`, upgrade: true }); break; }
          if (f.size > MAX_IMAGE_BYTES) { setError({ text: 'El PDF es demasiado grande (máx. 3,5 MB). Prueba a comprimirlo o a pegar solo las páginas que necesites.' }); continue; }
          const data = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(new Error('No se pudo leer el PDF.')); r.readAsDataURL(f); });
          setDocs((d) => [...d, { name: f.name, data: data.replace(/^data:[^;]*;/, 'data:application/pdf;') }]);
        } else if (f.type.startsWith('image/')) {
          if (photos.length + docs.length >= limits.imagesPerMessage) { setError({ text: `Tu plan admite ${limits.imagesPerMessage} foto(s) por mensaje.`, upgrade: true }); break; }
          const data = await prepareImage(f);
          setPhotos((p) => [...p, { name: f.name, data }]);
        } else if (f.type.startsWith('audio/') || /\.(mp3|m4a|wav|webm|ogg|flac)$/i.test(f.name)) {
          if (f.size > limits.audioMaxMB * 1024 * 1024) { setError({ text: `El audio supera ${limits.audioMaxMB} MB (límite de tu plan).`, upgrade: true }); continue; }
          await doTranscribe(f);
        } else if (/\.(txt|md|csv|json|log)$/i.test(f.name) || f.type.startsWith('text/')) {
          if (f.size > 300_000) { setError({ text: 'El archivo de texto es demasiado grande (máx. 300 KB).' }); continue; }
          const body = (await f.text()).slice(0, Math.max(500, limits.maxInputChars - 800));
          setText((p) => `${p}${p ? '\n\n' : ''}[Archivo: ${f.name}]\n\`\`\`\n${body}\n\`\`\`\n`);
        } else setError({ text: 'Formato no admitido. Usa fotos, PDF, audio (mp3, m4a, wav…) o texto (txt, md, csv, json).' });
      } catch (e: any) { setError({ text: e?.message || 'No se pudo leer el archivo.' }); }
    }
  }

  // ---- Envío ----
  const patchLast = (fn: (m: MsgData) => MsgData) => setMsgs((m) => { const c = m.slice(); c[c.length - 1] = fn(c[c.length - 1]); return c; });

  async function runStream(opts: { message: string; images?: string[]; files?: Array<{ name: string; data: string }>; regenerate?: boolean; editMessageId?: string }): Promise<{ ok: boolean; convId?: string }> {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    let cid = active;
    setSuggestions([]);
    try {
      await streamChat({
        conversationId: active, message: opts.message, webSearch: web, images: opts.images, files: opts.files, mode: deep ? 'deep' : 'fast', style,
        regenerate: opts.regenerate, editMessageId: opts.editMessageId, signal: ctrl.signal,
        onMeta: ({ conversationId, messageId, userMessageId }) => {
          if (conversationId) cid = conversationId;
          if (!active && conversationId) setActive(conversationId);
          setMsgs((cur) => { const c = cur.slice(); const n = c.length; if (c[n - 1]) c[n - 1] = { ...c[n - 1], id: messageId || undefined }; if (userMessageId && c[n - 2]?.role === 'user') c[n - 2] = { ...c[n - 2], id: userMessageId }; return c; });
        },
        onDelta: (d) => { acc += d; patchLast((m) => ({ ...m, content: acc })); },
      });
      return { ok: true, convId: cid };
    } catch (e) {
      fail(e);
      return { ok: false };
    } finally {
      abortRef.current = null;
      setBusy(false); setWeb(false);
      refreshMe(); refreshConvs();
    }
  }

  async function send(raw = text) {
    const message = raw.trim();
    if ((!message && !((photos.length || docs.length) && !imageMode)) || busy || rec.recording || transcribing) return;
    setError(null); setBusy(true);

    if (imageMode) {
      setText('');
      setMsgs((m) => [...m, { role: 'user', content: `🎨 ${message}` }, { role: 'assistant', content: '' }]);
      try {
        const r = await generateImage({ conversationId: active, prompt: message, shape });
        if (!active) setActive(r.conversationId);
        patchLast(() => ({ id: r.messageId, role: 'assistant', content: `![${r.alt}](hilvana-img:${r.path})\n\n_Imagen creada con IA._` }));
      } catch (e) {
        fail(e); setText(message); setMsgs((m) => m.slice(0, -2));
      } finally { setBusy(false); refreshMe(); refreshConvs(); }
      return;
    }

    const imgs = photos.map((p) => p.data);
    const kept = photos;
    const pdfs = docs;
    const ed = editing;
    const before = msgs;
    setText(''); setPhotos([]); setDocs([]); setEditing(null);
    setMsgs((m) => [...(ed ? m.slice(0, ed.index) : m), { role: 'user', content: (imgs.length || pdfs.length) ? `${message || (pdfs.length && !imgs.length ? 'Resume este documento y dime lo más importante.' : 'Describe esta imagen y dime qué ves.')}\n\n_[${[imgs.length ? (imgs.length === 1 ? 'Imagen adjunta' : imgs.length + ' imágenes adjuntas') : '', pdfs.length ? 'PDF adjunto: ' + pdfs.map((d) => d.name).join(', ') : ''].filter(Boolean).join(' · ')}]_` : message }, { role: 'assistant', content: '' }]);
    const r = await runStream({ message, images: imgs, files: pdfs, editMessageId: ed?.id });
    if (!r.ok) {
      if (ed) setMsgs(before); else setMsgs((m) => (m[m.length - 1]?.content ? m : m.slice(0, -2)));
      setText((t) => t || message); setPhotos(kept); setDocs(pdfs); if (ed) setEditing(ed);
    }
    else if (r.convId) getSuggestions(r.convId).then(setSuggestions);
  }

  function startEdit(i: number) {
    const m = msgs[i];
    if (busy || !m?.id) return;
    setEditing({ id: m.id, index: i });
    setText(m.content.replace(/\n\n_\[(Imagen adjunta|\d+ imágenes adjuntas|PDF adjunto)[^\]]*\]_\s*$/, ''));
    setImageMode(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function rename(c: Conv) {
    const t = prompt('Nuevo título de la conversación', c.title)?.trim();
    if (!t || t === c.title) return;
    try { await renameConversation(c.id, t.slice(0, 80)); refreshConvs(); } catch (e) { fail(e); }
  }

  function exportChat() {
    const title = convs.find((c) => c.id === active)?.title ?? 'Conversación';
    const md = `# ${title}\n\n` + msgs.map((m) => `**${m.role === 'user' ? 'Tú' : 'Hilvana AI'}**\n\n${m.content.replace(/!\[[^\]]*\]\(hilvana-img:[^)]*\)/g, '[imagen]')}`).join('\n\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) + '.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function regenerate() {
    if (busy || !active) return;
    setError(null); setBusy(true);
    const before = msgs[msgs.length - 1];
    patchLast((m) => ({ ...m, content: '', id: undefined, rating: undefined }));
    const r = await runStream({ message: '', regenerate: true });
    if (!r.ok) patchLast((m) => (m.content ? m : before));
    else if (r.convId) getSuggestions(r.convId).then(setSuggestions);
  }

  async function rate(i: number, r: 1 | -1) {
    const m = msgs[i];
    if (!m?.id || !supabase || !session) return;
    const next = m.rating === r ? undefined : r;
    setMsgs((cur) => cur.map((x, k) => (k === i ? { ...x, rating: next } : x)));
    if (next) await supabase.from('feedback').upsert({ user_id: session.user.id, message_id: m.id, rating: next });
    else await supabase.from('feedback').delete().eq('message_id', m.id).eq('user_id', session.user.id);
  }

  const shown = useMemo(() => convs.filter((c) => c.title.toLowerCase().includes(filter.trim().toLowerCase())), [convs, filter]);

  if (loading || !session) return <div className="boot">Cargando…</div>;

  const u = me?.usage;
  const left = me && u ? {
    messages: Math.max(Math.min(me.limits.messagesPerDay - u.messages, me.limits.messagesPerMonth - me.month.messages), 0),
    generations: Math.max(Math.min(me.limits.imageGenPerDay - u.generations, me.limits.imageGenPerMonth - me.month.generations), 0),
    audios: Math.max(me.limits.audioPerDay - u.audios, 0),
  } : null;
  const pct = me && u ? Math.min(100, (u.messages / me.limits.messagesPerDay) * 100) : 0;
  const hint = imageMode && left ? `Te quedan ${left.generations} imágenes hoy.` : left ? `Te quedan ${left.messages} mensajes hoy.` : '';
  const canSend = (!!text.trim() || ((photos.length > 0 || docs.length > 0) && !imageMode)) && !busy && !rec.recording && !transcribing;
  const webHint = !web && !imageMode && !busy && !!me && me.limits.searchesPerDay > 0 && text.length > 8 && TIME_RE.test(text);

  return (
    <div className="chat-app">
      <aside className={`side ${side ? 'open' : ''}`}>
        <div className="side-top"><Link to="/"><Logo size={26} /></Link><button className="icon-btn side-x" onClick={() => setSide(false)} aria-label="Cerrar"><X size={18} /></button></div>
        <button className="btn btn-thread btn-block" onClick={fresh}><Plus size={16} /> Nueva conversación</button>
        {convs.length > 5 && <label className="side-search"><Search size={14} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" aria-label="Buscar conversaciones" /></label>}
        <div className="side-list">
          {convs.length === 0 && <p className="side-empty">Tus conversaciones aparecerán aquí.</p>}
          {shown.map((c) => (
            <div key={c.id} className={`side-item ${c.id === active ? 'on' : ''}`}>
              <button onClick={() => open(c.id)} title={c.title}>{c.title}</button>
              <button className="icon-btn" onClick={() => rename(c)} aria-label="Renombrar" title="Renombrar"><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => remove(c.id)} aria-label="Eliminar"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="side-foot">
          {me && u && (
            <div className="meter" title={`Hoy: ${u.messages}/${me.limits.messagesPerDay} mensajes · ${u.searches}/${me.limits.searchesPerDay} búsquedas · ${u.images}/${me.limits.imagesReadPerDay} fotos · ${u.generations}/${me.limits.imageGenPerDay} imágenes creadas · ${u.audios}/${me.limits.audioPerDay} audios`}>
              <div className="meter-row"><span>Mensajes hoy</span><b>{u.messages}/{me.limits.messagesPerDay}</b></div>
              <div className="meter-bar"><i style={{ width: pct + '%' }} /></div>
            </div>
          )}
          <div className="side-acc-row">
            <Link to="/cuenta" className="side-acc"><UserRound size={16} /><span>{me?.email ?? 'Cuenta'}</span><em>{me?.plan === 'free' ? 'Gratis' : me?.plan === 'plus' ? 'Plus' : me?.plan === 'pro' ? 'Pro' : ''}</em></Link>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      {side && <div className="scrim" onClick={() => setSide(false)} />}

      <main className="chat-main">
        <header className="chat-bar">
          <button className="icon-btn menu" onClick={() => setSide(true)} aria-label="Menú"><Menu size={20} /></button>
          <span className="chat-title">{convs.find((c) => c.id === active)?.title ?? 'Nueva conversación'}</span>
          {msgs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={exportChat} title="Descargar la conversación en Markdown">Exportar</button>}
          {me?.plan === 'free' && <Link to="/cuenta" className="btn btn-ghost btn-sm">Mejorar plan</Link>}
        </header>

        <div className="chat-scroll">
          {msgs.length === 0 ? (
            <div className="empty">
              <h1>¿Qué hilo <em>seguimos</em>?</h1>
              <p>Escribe, dicta con el micro, adjunta una foto o pídeme que cree una imagen.</p>
              <div className="quick">
                <button onClick={() => fileRef.current?.click()}><ImagePlus size={16} /> Leer una foto</button>
                <button onClick={rec.start}><Mic size={16} /> Dictar</button>
                <button onClick={() => { setImageMode(true); taRef.current?.focus(); }}><Palette size={16} /> Crear imagen</button>
                <button onClick={() => { setWeb(true); taRef.current?.focus(); }}><Globe size={16} /> Buscar en la web</button>
              </div>
              <div className="starters">{STARTERS.map((s) => <button key={s.t} onClick={() => send(s.t)}><b>{s.t}</b><small>{s.s}</small></button>)}</div>
            </div>
          ) : (
            <div className="thread">
              {msgs.map((m, i) => (
                <Message key={m.id ?? i} m={m} last={i === msgs.length - 1} busy={busy} onRegenerate={regenerate} onRate={(r) => rate(i, r)} onEdit={() => startEdit(i)} />
              ))}
              {!busy && suggestions.length > 0 && (
                <div className="suggest" aria-label="Preguntas sugeridas">
                  {suggestions.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="dock">
          {error && (
            <div className="notice err" role="alert">
              {error.text} {error.upgrade && me?.plan !== 'pro' && <Link to="/cuenta">Ver planes</Link>}
            </div>
          )}
          {webHint && <button className="hint" onClick={() => setWeb(true)}><Globe size={14} /> Parece un dato reciente: activar búsqueda web para citar fuentes</button>}
          <div className={`composer ${imageMode ? 'is-image' : ''}`}>
            {editing && <div className="edit-banner" role="status"><Pencil size={13} /> Editando un mensaje: se reemplazará lo que venía después. <button onClick={() => { setEditing(null); setText(''); }}>Cancelar</button></div>}
            {(photos.length > 0 || docs.length > 0 || imageMode) && (
              <div className="chips">
                {photos.map((p, i) => (
                  <span className="thumb" key={i}><img src={p.data} alt={p.name} /><button onClick={() => setPhotos((x) => x.filter((_, k) => k !== i))} aria-label="Quitar foto">×</button></span>
                ))}
                {docs.map((d, i) => (
                  <span className="doc-chip" key={d.name + i}><FileText size={14} /> <span>{d.name}</span><button onClick={() => setDocs((x) => x.filter((_, k) => k !== i))} aria-label="Quitar PDF">×</button></span>
                ))}
                {imageMode && SHAPES.map((s) => <button key={s.id} className={`pill ${shape === s.id ? 'on' : ''}`} onClick={() => setShape(s.id)}>{s.label}</button>)}
              </div>
            )}
            {rec.recording ? (
              <div className="recording"><span className="rec-dot" /> Grabando {fmt(rec.seconds)} <small>/ {fmt(limits?.audioMaxSeconds ?? 60)}</small>
                <span className="grow" /><button className="btn btn-ghost btn-sm" onClick={rec.cancel}>Cancelar</button><button className="btn btn-thread btn-sm" onClick={rec.stop}>Transcribir</button></div>
            ) : (
              <textarea
                ref={taRef} rows={1} value={text} maxLength={30000}
                placeholder={transcribing ? 'Transcribiendo tu audio…' : imageMode ? 'Describe la imagen: sujeto, estilo, luz, ambiente…' : 'Escribe tu pregunta…'}
                disabled={transcribing}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              />
            )}
            <div className="composer-row">
              <div className="tools">
                {!imageMode && <button className="tool icon" onClick={() => fileRef.current?.click()} title="Adjuntar foto, PDF, audio o texto" aria-label="Adjuntar"><Paperclip size={16} /></button>}
                {!imageMode && <button className="tool icon" disabled={busy || transcribing || rec.recording} onClick={rec.start} title="Dictar con el micrófono" aria-label="Dictar"><Mic size={16} /></button>}
                {!imageMode && <select className={`tool style-sel ${style !== 'general' ? 'on' : ''}`} value={style} onChange={(e) => pickStyle(e.target.value as StyleId)} aria-label="Estilo de respuesta" title={STYLES[style].hint}>
                  {(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}
                </select>}
                {!imageMode && <button className={`tool ${web ? 'on' : ''}`} onClick={() => setWeb(!web)} aria-pressed={web}><Globe size={15} /> <span className="lbl">Web</span></button>}
                {!imageMode && <button className={`tool ${deep ? 'on' : ''}`} onClick={() => { if (limits && !limits.deepMode) setError({ text: 'El modo Profundo (razonamiento más largo) es de los planes Plus y Pro.', upgrade: true }); else setDeep(!deep); }} aria-pressed={deep} title="Razona más antes de responder"><Brain size={15} /> <span className="lbl">Profundo</span></button>}
                <button className={`tool ${imageMode ? 'on' : ''}`} onClick={() => { setImageMode(!imageMode); setError(null); }} aria-pressed={imageMode}><Palette size={15} /> <span className="lbl">Crear imagen</span></button>
              </div>
              {busy
                ? <button className="send" onClick={() => abortRef.current?.abort()} disabled={!abortRef.current} aria-label="Detener"><Square size={14} fill="currentColor" /></button>
                : <button className="send" disabled={!canSend} onClick={() => send()} aria-label={imageMode ? 'Crear' : 'Enviar'}><ArrowUp size={18} /></button>}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac,.txt,.md,.csv,.json,.log" hidden
              onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <p className="fine">{hint} La IA puede equivocarse: verifica lo importante.</p>
        </div>
      </main>
    </div>
  );
}
