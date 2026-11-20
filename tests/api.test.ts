import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { app } from '../functions/api/[[route]]';
import { PLANS } from '../shared/plans';
import { World } from './world';

const ENV = {
  APP_URL: 'https://app.test', OPENAI_API_KEY: 'sk-test', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv',
  STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PLUS: 'price_plus', STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_y', STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
};

let w: World;
let restore: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  w = new World();
  restore = w.install();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { restore(); vi.useRealTimers(); vi.restoreAllMocks(); });

const call = (path: string, init: { method?: string; body?: unknown; token?: string; form?: FormData } = {}, env: Record<string, string> = ENV) =>
  app.request('/api' + path, {
    method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
    headers: { ...(init.token === '' ? {} : { Authorization: `Bearer ${init.token ?? 'tok'}` }), ...(init.form ? {} : { 'Content-Type': 'application/json' }) },
    body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
  }, env);

const chat = (body: Record<string, unknown>, token = 'tok') => call('/chat', { body, token });
const usage = (user = 'u1') => w.usageRow(user);
const lastModel = () => w.responsesCalls.filter((b) => b.stream).at(-1);

describe('sesión y perfil', () => {
  it('exige sesión', async () => {
    expect((await call('/me', { token: '' })).status).toBe(401);
    expect((await call('/me', { token: 'mala' })).status).toBe(401);
  });

  it('/me devuelve plan gratis y límites', async () => {
    const j: any = await (await call('/me')).json();
    expect(j.plan).toBe('free');
    expect(j.limits.messagesPerDay).toBe(PLANS.free.limits.messagesPerDay);
    expect(j.usage.messages).toBe(0);
  });

  it('/health no revela secretos', async () => {
    const j: any = await (await call('/health', { token: '' })).json();
    expect(j.configured.openai).toBe(true);
    expect(JSON.stringify(j)).not.toContain('sk-test');
  });

  it('guarda y lee el perfil', async () => {
    expect((await call('/profile', { method: 'PUT', body: { displayName: 'Ana', instructions: 'Sé breve' } })).status).toBe(200);
    expect(await (await call('/profile')).json()).toEqual({ displayName: 'Ana', instructions: 'Sé breve' });
    expect((await call('/profile', { method: 'PUT', body: { displayName: 'x'.repeat(80), instructions: '' } })).status).toBe(400);
  });
});

describe('chat', () => {
  it('responde en streaming, guarda mensajes, titula y descuenta cuota', async () => {
    const res = await chat({ message: 'Hola' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hola, mundo.');
    const convId = res.headers.get('X-Conversation-Id')!;
    expect(convId).toBeTruthy();
    expect(res.headers.get('X-Message-Id')).toBeTruthy();
    expect(w.tables.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(w.tables.messages[1].content).toBe('Hola, mundo.');
    expect(w.tables.conversations[0].title).toBe('Plan de viaje');
    expect(usage().messages).toBe(1);
    const b = lastModel();
    expect(b.model).toBe('gpt-6-luna');
    expect(b.reasoning.effort).toBe('low');
    expect(b.instructions).toContain('Hilvana AI');
  });

  it('usa el modelo de pago y razona más en peticiones difíciles', async () => {
    w.setPlan('u1', 'plus');
    await (await chat({ message: 'Calcula la hipoteca paso a paso para 200000 € a 25 años' })).text();
    const b = lastModel();
    expect(b.model).toBe('gpt-6.1-terra');
    expect(b.reasoning.effort).toBe('medium');
  });

  it('el modo Profundo solo existe en planes de pago', async () => {
    const r = await chat({ message: 'hola', mode: 'deep' });
    expect(r.status).toBe(403);
    expect(usage().messages).toBe(0);

    w.setPlan('u1', 'plus');
    await (await chat({ message: 'hola', mode: 'deep' })).text();
    const b = lastModel();
    expect(b.model).toBe('gpt-6.1-sol');
    expect(b.reasoning.effort).toBe('high');
    expect(usage().deep).toBe(1);
  });

  it('bloquea al llegar al límite diario sin llamar a OpenAI', async () => {
    usage().messages = PLANS.free.limits.messagesPerDay;
    const r = await chat({ message: 'hola' });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toContain('límite diario de mensajes');
    expect(w.responsesCalls).toHaveLength(0);
  });

  it('bloquea al llegar al límite mensual', async () => {
    w.usageRow('u1', '2026-10-01').messages = PLANS.free.limits.messagesPerMonth;
    const r = await chat({ message: 'hola' });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toContain('límite mensual');
  });

  it('la búsqueda web consume su propia cuota y añade fuentes sin tracking', async () => {
    const res = await chat({ message: 'precio de la luz hoy', webSearch: true });
    const t = await res.text();
    expect(t).toContain('**Fuentes**');
    expect(t).toContain('(https://example.com/a)');
    expect(usage().searches).toBe(1);
    expect(lastModel().tools[0].type).toBe('web_search');
  });

  it('si OpenAI falla, devuelve error y reembolsa la cuota', async () => {
    w.responsesStatus = 500;
    const r = await chat({ message: 'hola' });
    expect(r.status).toBe(502);
    expect(usage().messages).toBe(0);
  });

  it('si el motor falla no deja conversación ni pregunta huérfana', async () => {
    w.responsesStatus = 500;
    await chat({ message: 'hola' });
    expect(w.tables.conversations.length).toBe(0);
    expect(w.tables.messages.length).toBe(0);
  });

  it('aplica el estilo elegido y rechaza estilos inventados', async () => {
    const r = await chat({ message: 'hola', style: 'code' });
    expect(r.status).toBe(200); await r.text();
    expect(lastModel().instructions).toContain('ESTILO ACTIVO: PROGRAMAR');
    const g = await chat({ message: 'hola' }); await g.text();
    expect(lastModel().instructions).not.toContain('ESTILO ACTIVO');
    expect((await chat({ message: 'hola', style: 'hacker' })).status).toBe(400);
  });

  it('acepta una foto sin texto', async () => {
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const r = await chat({ images: [img] });
    expect(r.status).toBe(200);
    await r.text();
    expect(w.tables.messages.some((m: any) => m.role === 'user' && /Describe esta imagen/.test(m.content))).toBe(true);
  });

  it('usa el modelo de respaldo si el principal no existe', async () => {
    w.rejectModels = ['gpt-6-luna'];
    const r = await chat({ message: 'hola' });
    expect(await r.text()).toBe('Hola, mundo.');
    expect(lastModel().model).toBe('gpt-5-mini');
  });

  it('reintenta sin "reasoning" si el modelo no lo admite', async () => {
    w.rejectReasoning = true;
    const r = await chat({ message: 'hola' });
    expect(await r.text()).toBe('Hola, mundo.');
    expect(lastModel().reasoning).toBeUndefined();
  });

  it('rechaza contenido marcado por moderación sin gastar cuota', async () => {
    w.flagModeration = true;
    const r = await chat({ message: 'algo malo' });
    expect(r.status).toBe(422);
    expect(usage().messages).toBe(0);
  });

  it('respeta el máximo de fotos por mensaje y de caracteres', async () => {
    const img = 'data:image/jpeg;base64,AAAA';
    expect((await chat({ message: 'mira', images: [img, img] })).status).toBe(413);
    expect((await chat({ message: 'x'.repeat(PLANS.free.limits.maxInputChars + 1) })).status).toBe(413);
    expect(usage().messages).toBe(0);
    const ok = await chat({ message: 'mira', images: [img] });
    await ok.text();
    expect(usage().images).toBe(1);
  });

  it('regenerar sustituye la última respuesta sin duplicar la pregunta', async () => {
    const first = await chat({ message: 'hola' });
    await first.text();
    const convId = first.headers.get('X-Conversation-Id')!;
    const oldId = w.tables.messages[1].id;
    w.chatChunks = ['Otra ', 'respuesta.'];
    const r = await chat({ conversationId: convId, regenerate: true });
    expect(await r.text()).toBe('Otra respuesta.');
    expect(w.tables.messages).toHaveLength(2);
    expect(w.tables.messages[1].content).toBe('Otra respuesta.');
    expect(w.tables.messages[1].id).not.toBe(oldId);
    expect(w.responsesCalls.filter((b) => b.stream).at(-1).input.at(-1)).toEqual({ role: 'user', content: 'hola' });
    expect(usage().messages).toBe(2);
  });

  it('no deja leer ni escribir en conversaciones ajenas', async () => {
    const first = await chat({ message: 'secreto' });
    await first.text();
    const convId = first.headers.get('X-Conversation-Id')!;
    expect((await chat({ conversationId: convId, message: 'hola' }, 'tok2')).status).toBe(404);
    expect((await call(`/conversations/${convId}`, { method: 'DELETE', token: 'tok2' })).status).toBe(404);
  });

  it('limita las ráfagas por minuto', async () => {
    let last = 200;
    for (let i = 0; i < 9; i++) { const r = await chat({ message: 'hola ' + i }); last = r.status; await r.text(); }
    expect(last).toBe(429);
    expect(w.tables.messages.length).toBeLessThan(20);
  });

  it('incluye nombre y preferencias del usuario en el prompt', async () => {
    await call('/profile', { method: 'PUT', body: { displayName: 'Ana', instructions: 'Respuestas breves' } });
    await (await chat({ message: 'hola', tz: 'America/Mexico_City' })).text();
    const ins = lastModel().instructions as string;
    expect(ins).toContain('Ana');
    expect(ins).toContain('Respuestas breves');
    expect(ins).toContain('America/Mexico_City');
  });

  it('ignora una zona horaria inválida', async () => {
    await (await chat({ message: 'hola', tz: 'Marte/Olimpo' })).text();
    expect(lastModel().instructions).toContain('Europe/Madrid');
  });
});

describe('robustez del chat', () => {
  const waitFor = async (fn: () => boolean) => { for (let i = 0; i < 50 && !fn(); i++) await new Promise((r) => setTimeout(r, 5)); };

  it('guarda la respuesta aunque el cliente se desconecte y no reembolsa', async () => {
    const r = await chat({ message: 'hola' });
    await r.body!.cancel(); // el cliente se va sin leer
    await waitFor(() => w.tables.messages.some((m: any) => m.role === 'assistant'));
    expect(w.tables.messages.some((m: any) => m.role === 'assistant' && m.content.includes('Hola'))).toBe(true);
    expect(usage().messages).toBe(1);
  });

  it('si el razonamiento se agota sin texto, avisa y no reembolsa', async () => {
    w.incompleteEmpty = true;
    const r = await chat({ message: 'hola' });
    expect(await r.text()).toContain('espacio de razonamiento');
    expect(usage().messages).toBe(1);
  });

  it('el historial reenviado tiene tope de tamaño', async () => {
    const first = await chat({ message: 'x'.repeat(3900) });
    const convId = first.headers.get('X-Conversation-Id')!;
    await first.text();
    for (let i = 0; i < 8; i++) await (await chat({ message: 'y'.repeat(3900), conversationId: convId })).text();
    const sent = lastModel().input as Array<{ content: string }>;
    const total = sent.slice(0, -1).reduce((n, m) => n + String(m.content).length, 0);
    expect(total).toBeLessThanOrEqual(PLANS.free.limits.contextChars + 4000);
    expect(sent.length).toBeLessThan(18);
  });

  it('la búsqueda web limita las llamadas a la herramienta y se adapta si el modelo no lo admite', async () => {
    w.setPlan('u1', 'plus');
    await (await chat({ message: 'precio hoy', webSearch: true })).text();
    expect(lastModel().max_tool_calls).toBe(2);
    w.rejectMaxToolCalls = true;
    expect(await (await chat({ message: 'precio hoy', webSearch: true })).text()).toContain('Hola');
    expect(lastModel().max_tool_calls).toBeUndefined();
  });

  it('modera el mensaje completo, no solo el principio', async () => {
    w.setPlan('u1', 'plus');
    await (await chat({ message: 'a'.repeat(12000) })).text();
    expect(w.moderationInputs.at(-1)).toHaveLength(2);
  });

  it('no regenera una respuesta basada en fotos', async () => {
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const a = await chat({ message: 'mira', images: [img] });
    const convId = a.headers.get('X-Conversation-Id')!;
    await a.text();
    const r = await chat({ conversationId: convId, regenerate: true });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).code).toBe('photos');
  });

  it('falla cerrado si la base de datos no responde al leer el plan', async () => {
    const orig = w.tables.subscriptions;
    (w as any).tables.subscriptions = undefined; // la simulación devuelve 404 → error de lectura
    const r = await chat({ message: 'hola' });
    expect(r.status).toBe(500);
    w.tables.subscriptions = orig;
  });
});

describe('presupuesto de tokens', () => {
  it('suma los tokens reales de cada respuesta y el modo Profundo cuenta x3', async () => {
    await (await chat({ message: 'hola' })).text();
    expect(usage().tokens).toBe(1500);
    w.setPlan('u1', 'plus');
    await (await chat({ message: 'analiza esto', mode: 'deep' })).text();
    expect(usage().tokens).toBe(1500 + 4500);
  });

  it('estima los tokens por longitud si OpenAI no informa del uso', async () => {
    w.tokensUsed = null;
    await (await chat({ message: 'hola' })).text();
    expect(usage().tokens).toBeGreaterThan(0);
    expect(usage().tokens).toBeLessThan(50);
  });

  it('bloquea al agotar el presupuesto mensual y se renueva el mes siguiente', async () => {
    usage().tokens = PLANS.free.limits.tokensPerMonth;
    const r = await chat({ message: 'hola' });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toContain('presupuesto mensual');
    expect(usage().messages).toBe(0); // no gasta cuota de mensajes
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    expect((await chat({ message: 'hola' })).status).toBe(200);
  });

  it('/me informa del consumo y del límite', async () => {
    await (await chat({ message: 'hola' })).text();
    const me: any = await (await call('/me')).json();
    expect(me.tokens).toEqual({ today: 1500, month: 1500, limit: PLANS.free.limits.tokensPerMonth });
  });

  it('cada plan superior tiene más tokens', () => {
    expect(PLANS.plus.limits.tokensPerMonth).toBeGreaterThan(PLANS.free.limits.tokensPerMonth);
    expect(PLANS.pro.limits.tokensPerMonth).toBeGreaterThan(PLANS.plus.limits.tokensPerMonth);
  });
});

describe('documentos PDF', () => {
  const pdf = { name: 'contrato final.pdf', data: 'data:application/pdf;base64,JVBERi0xLjQK' };

  it('envía el PDF al modelo, cuenta como adjunto y no se puede regenerar sin él', async () => {
    const r = await chat({ message: 'resume', files: [pdf] });
    expect(r.status).toBe(200);
    const convId = r.headers.get('X-Conversation-Id')!;
    await r.text();
    const part = (lastModel().input as any[]).at(-1).content.find((x: any) => x.type === 'input_file');
    expect(part).toMatchObject({ filename: 'contrato final.pdf' });
    expect(part.file_data).toContain('application/pdf');
    expect(usage().images).toBe(1);
    expect(w.tables.messages[0].content).toContain('PDF adjunto: contrato final.pdf');
    expect((await chat({ conversationId: convId, regenerate: true })).status).toBe(400);
  });

  it('acepta un PDF sin texto y respeta el máximo de adjuntos del plan', async () => {
    expect((await chat({ files: [pdf] })).status).toBe(200);
    expect((await chat({ message: 'x', files: [pdf, pdf] })).status).toBe(413); // plan gratuito: 1 adjunto
  });

  it('rechaza archivos que no son PDF', async () => {
    expect((await chat({ message: 'x', files: [{ name: 'a.exe', data: 'data:application/x-msdownload;base64,AAAA' }] })).status).toBe(400);
  });
});

describe('editar y renombrar', () => {
  it('editar una pregunta descarta lo posterior y responde a la nueva', async () => {
    const a = await chat({ message: 'primera' });
    const convId = a.headers.get('X-Conversation-Id')!;
    const firstUser = a.headers.get('X-User-Message-Id')!;
    await a.text();
    await (await chat({ message: 'segunda', conversationId: convId })).text();
    expect(w.tables.messages.length).toBe(4);
    w.chatChunks = ['Respuesta ', 'nueva.'];
    const e = await chat({ message: 'primera corregida', conversationId: convId, editMessageId: firstUser });
    expect(e.status).toBe(200);
    expect(await e.text()).toBe('Respuesta nueva.');
    const msgs = w.tables.messages.filter((m: any) => m.conversation_id === convId);
    expect(msgs.map((m: any) => m.content)).toEqual(['primera corregida', 'Respuesta nueva.']);
    // el modelo no vio la conversación descartada
    expect((lastModel().input as any[]).map((m) => m.content)).toEqual(['primera corregida']);
  });

  it('no deja editar mensajes del asistente ni de otra conversación', async () => {
    const a = await chat({ message: 'hola' });
    const convId = a.headers.get('X-Conversation-Id')!;
    const botId = a.headers.get('X-Message-Id')!;
    await a.text();
    expect((await chat({ message: 'x', conversationId: convId, editMessageId: botId })).status).toBe(400);
    expect((await chat({ message: 'x', editMessageId: botId })).status).toBe(400);
  });

  it('renombra solo conversaciones propias', async () => {
    const a = await chat({ message: 'hola' });
    const convId = a.headers.get('X-Conversation-Id')!;
    await a.text();
    expect((await call('/conversations/' + convId, { method: 'PATCH', body: { title: '  Mi   plan  ' } })).status).toBe(200);
    expect(w.tables.conversations[0].title).toBe('Mi plan');
    expect((await call('/conversations/' + convId, { method: 'PATCH', body: { title: 'robado' }, token: 'tok2' })).status).toBe(404);
    expect((await call('/conversations/' + convId, { method: 'PATCH', body: { title: '' } })).status).toBe(400);
  });
});

describe('sugerencias', () => {
  it('devuelve 3 preguntas de seguimiento', async () => {
    const r = await chat({ message: 'hola' });
    await r.text();
    const j: any = await (await call('/suggest', { body: { conversationId: r.headers.get('X-Conversation-Id') } })).json();
    expect(j.suggestions).toHaveLength(3);
  });
});

describe('sugerencias (límite diario)', () => {
  it('deja de sugerir al pasar el tope diario', async () => {
    const first = await chat({ message: 'hola' });
    const convId = first.headers.get('X-Conversation-Id')!;
    await first.text();
    w.tables.rate_limits.push({ user_id: 'u1', bucket: 'suggest_day', window_start: Date.now(), hits: 40 });
    const r: any = await (await call('/suggest', { body: { conversationId: convId } })).json();
    expect(r.suggestions).toEqual([]);
  });
});

describe('audio', () => {
  const audio = (bytes: number, type = 'audio/webm', name = 'a.webm') => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(bytes).fill(1)], name, { type }));
    return fd;
  };

  it('transcribe y descuenta', async () => {
    const r = await call('/transcribe', { form: audio(2000) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).text).toBe('hola desde el audio');
    expect(usage().audios).toBe(1);
    expect(w.transcribeModels).toEqual(['gpt-transcribe']);
  });

  it('respeta el tamaño máximo del plan', async () => {
    const r = await call('/transcribe', { form: audio(PLANS.free.limits.audioMaxMB * 1024 * 1024 + 1) });
    expect(r.status).toBe(413);
    expect(usage().audios).toBe(0);
  });

  it('rechaza formatos que no son audio', async () => {
    expect((await call('/transcribe', { form: audio(100, 'application/pdf', 'x.pdf') })).status).toBe(415);
  });

  it('usa el modelo de respaldo si el principal no existe', async () => {
    w.transcribeReject = ['gpt-transcribe'];
    const r = await call('/transcribe', { form: audio(500) });
    expect(r.status).toBe(200);
    expect(w.transcribeModels).toEqual(['gpt-transcribe', 'gpt-4o-mini-transcribe']);
  });

  it('reembolsa si falla el motor, pero no si el audio no tiene voz', async () => {
    w.transcribeFail = true;
    expect((await call('/transcribe', { form: audio(500) })).status).toBe(502);
    expect(usage().audios).toBe(0);
    w.transcribeFail = false; w.transcript = '   ';
    expect((await call('/transcribe', { form: audio(500) })).status).toBe(422);
    expect(usage().audios).toBe(1); // sin voz: OpenAI ya procesó el audio, no se reembolsa
  });

  it('aplica el límite diario de audios', async () => {
    usage().audios = PLANS.free.limits.audioPerDay;
    const r = await call('/transcribe', { form: audio(500) });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toContain('audios');
  });
});

describe('imágenes', () => {
  it('crea, guarda en privado y registra la conversación', async () => {
    const r = await call('/images', { body: { prompt: 'un faro al amanecer', shape: 'landscape' } });
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(j.path).toMatch(/^u1\/.+\.png$/);
    expect(w.storage.has(j.path)).toBe(true);
    expect(w.tables.messages[1].content).toContain(`hilvana-img:${j.path}`);
    expect(usage().generations).toBe(1);
    expect(w.imageCalls[0]).toMatchObject({ model: 'gpt-image-2.5-flare', size: '1536x1024', quality: 'low' });
  });

  it('reintenta con parámetros mínimos y con modelo de respaldo', async () => {
    w.setPlan('u1', 'plus');
    w.imageMode = 'rejectParams';
    expect((await call('/images', { body: { prompt: 'un faro' } })).status).toBe(200);
    expect(w.imageCalls.at(-1).output_format).toBeUndefined();
    w.rejectModels = ['gpt-image-2.5-flare'];
    expect((await call('/images', { body: { prompt: 'otro faro' } })).status).toBe(200);
    expect(w.imageCalls.at(-1).model).toBe('gpt-image-1');
  });

  it('reembolsa si falla y si el filtro de seguridad la bloquea', async () => {
    w.imageMode = 'fail';
    expect((await call('/images', { body: { prompt: 'un faro' } })).status).toBe(502);
    expect(usage().generations).toBe(0);
    w.imageMode = 'blocked';
    const r = await call('/images', { body: { prompt: 'algo' } });
    expect(r.status).toBe(422);
    expect(usage().generations).toBe(0);
  });

  it('aplica tope diario y mensual', async () => {
    usage().generations = PLANS.free.limits.imageGenPerDay;
    expect((await call('/images', { body: { prompt: 'un faro' } })).status).toBe(429);
    usage().generations = 0;
    w.usageRow('u1', '2026-10-02').generations = PLANS.free.limits.imageGenPerMonth;
    const r = await call('/images', { body: { prompt: 'un faro' } });
    expect(((await r.json()) as any).error).toContain('mensual');
  });

  it('borrar la conversación borra también sus imágenes', async () => {
    const j: any = await (await call('/images', { body: { prompt: 'un faro' } })).json();
    expect(w.storage.size).toBe(1);
    expect((await call(`/conversations/${j.conversationId}`, { method: 'DELETE' })).status).toBe(200);
    expect(w.storage.size).toBe(0);
    expect(w.tables.messages).toHaveLength(0);
  });
});

describe('cuenta', () => {
  it('exporta los datos del usuario', async () => {
    await (await chat({ message: 'hola' })).text();
    const j: any = await (await call('/account/export')).json();
    expect(j.messages).toHaveLength(2);
    expect(j.email).toBe('ana@test.dev');
  });

  it('exige confirmación para eliminar la cuenta', async () => {
    expect((await call('/account', { method: 'DELETE', body: { confirm: 'no' } })).status).toBe(400);
  });
});

describe('Stripe', () => {
  const signed = (obj: unknown, type: string, secret = ENV.STRIPE_WEBHOOK_SECRET) => {
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object: obj } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return app.request('/api/billing/webhook', { method: 'POST', headers: { 'stripe-signature': header, 'Content-Type': 'application/json' }, body: payload }, ENV);
  };

  it('rechaza firmas falsas', async () => {
    const r = await app.request('/api/billing/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=abc' }, body: '{}' }, ENV);
    expect(r.status).toBe(400);
  });

  it('activa el plan Plus al recibir la suscripción y lo anula al cancelarla', async () => {
    expect((await signed({ id: 'sub_1' }, 'customer.subscription.created')).status).toBe(200);
    expect(w.tables.subscriptions[0]).toMatchObject({ user_id: 'u1', plan: 'plus', status: 'active' });
    expect(((await (await call('/me')).json()) as any).plan).toBe('plus');

    w.subscription = { ...w.subscription, status: 'canceled' };
    await signed({ id: 'sub_1' }, 'customer.subscription.deleted');
    expect(w.tables.subscriptions[0]).toMatchObject({ plan: 'free', status: 'canceled' });
  });

  it('reconoce el plan Pro anual', async () => {
    w.subscription = { ...w.subscription, items: { data: [{ price: { id: 'price_pro_y' }, current_period_end: 1893456000 }] } };
    await signed({ id: 'sub_1' }, 'customer.subscription.updated');
    expect(w.tables.subscriptions[0].plan).toBe('pro');
  });

  it('crea la sesión de pago (mensual y anual) y bloquea si ya hay plan', async () => {
    const a: any = await (await call('/billing/checkout', { body: { plan: 'plus', interval: 'year' } })).json();
    expect(a.url).toContain('checkout.stripe.test');
    w.setPlan('u1', 'plus');
    expect((await call('/billing/checkout', { body: { plan: 'pro' } })).status).toBe(409);
  });

  it('un evento viejo de una suscripción cancelada no pisa la suscripción nueva', async () => {
    w.subscription = { ...w.subscription, id: 'sub_old', status: 'canceled', created: 100 };
    w.extraSubscriptions = [{ ...w.subscription, id: 'sub_new', status: 'active', created: 200, items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1893456000 }] } }];
    await signed({ id: 'sub_old' }, 'customer.subscription.deleted');
    expect(w.tables.subscriptions[0]).toMatchObject({ plan: 'pro', status: 'active', stripe_subscription_id: 'sub_new' });
  });

  it('el webhook responde error (para que Stripe reintente) si falla la base de datos', async () => {
    w.failTables = ['subscriptions'];
    expect((await signed({ id: 'sub_1' }, 'customer.subscription.created')).status).toBe(500);
  });

  it('borrar la cuenta cancela todas las suscripciones y no borra nada si Stripe falla', async () => {
    w.setPlan('u1', 'plus'); w.tables.subscriptions[0].stripe_customer_id = 'cus_1';
    w.extraSubscriptions = [{ ...w.subscription, id: 'sub_dup', status: 'active' }];
    w.stripeFail = true;
    expect((await call('/account', { method: 'DELETE', body: { confirm: 'ELIMINAR' } })).status).toBe(500);
    expect(w.deletedUsers).toHaveLength(0);
    w.stripeFail = false;
    await call('/account', { method: 'DELETE', body: { confirm: 'ELIMINAR' } }); // (el simulador usa ids que no son UUID: aquí solo importa Stripe)
    expect(w.stripeCalls.filter((x) => x.startsWith('DELETE /v1/subscriptions/')).length).toBe(2);
  });

  it('avisa si falta el precio configurado', async () => {
    const r = await call('/billing/checkout', { body: { plan: 'plus' } }, { ...ENV, STRIPE_PRICE_PLUS: '' });
    expect(r.status).toBe(503);
  });
});

describe('planes', () => {
  it('cada plan superior es estrictamente mejor que el anterior', () => {
    const [f, p, r] = [PLANS.free.limits, PLANS.plus.limits, PLANS.pro.limits];
    for (const k of Object.keys(f) as Array<keyof typeof f>) {
      if (typeof f[k] === 'number') { expect(p[k]).toBeGreaterThanOrEqual(f[k] as number); expect(r[k]).toBeGreaterThanOrEqual(p[k] as number); }
    }
    expect(PLANS.plus.priceYearEur).toBeLessThan(PLANS.plus.priceMonthEur * 12);
    expect(PLANS.pro.priceYearEur).toBeLessThan(PLANS.pro.priceMonthEur * 12);
  });
});
