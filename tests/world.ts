// Mundo simulado: mini-PostgREST/Auth/Storage de Supabase, OpenAI y Stripe, todo en memoria.
// Permite probar la API real (functions/api) de punta a punta sin claves ni red.
export type Row = Record<string, any>;

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const madridDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export class World {
  tables: Record<string, Row[]> = { conversations: [], messages: [], subscriptions: [], usage: [], profiles: [], feedback: [], rate_limits: [] };
  storage = new Map<string, Uint8Array>();
  responsesCalls: any[] = [];
  imageCalls: any[] = [];
  transcribeModels: string[] = [];
  stripeCalls: string[] = [];
  moderationInputs: any[] = [];
  deletedUsers: string[] = [];
  failTables: string[] = [];
  incompleteEmpty = false;
  tokensUsed: number | null = 1500; // null = OpenAI no informa del uso
  rejectMaxToolCalls = false;
  extraSubscriptions: Row[] = [];
  stripeFail = false;
  // Interruptores de comportamiento
  flagModeration = false;
  rejectModels: string[] = [];
  rejectReasoning = false;
  responsesStatus = 0; // si != 0, /v1/responses responde con ese error
  chatChunks = ['Hola, ', 'mundo.'];
  imageMode: 'ok' | 'fail' | 'blocked' | 'rejectParams' = 'ok';
  transcribeReject: string[] = [];
  transcribeFail = false;
  transcript = 'hola desde el audio';
  private seq = 0;

  uuid() { this.seq += 1; return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`; }

  usageRow(user: string, day = madridDay()) {
    let r = this.tables.usage.find((x) => x.user_id === user && x.day === day);
    if (!r) { r = { user_id: user, day, messages: 0, searches: 0, images: 0, audios: 0, generations: 0, deep: 0, tokens: 0 }; this.tables.usage.push(r); }
    return r;
  }
  setPlan(user: string, plan: 'plus' | 'pro' | 'free', status = 'active') {
    const row = this.tables.subscriptions.find((x) => x.user_id === user);
    if (row) Object.assign(row, { plan, status }); else this.tables.subscriptions.push({ user_id: user, plan, status });
  }

  install() {
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      if (url.host === 'sb.test') return this.supabase(req, url);
      if (url.host === 'api.openai.com') return this.openai(req, url);
      if (url.host === 'api.stripe.com') return this.stripe(req, url);
      throw new Error('fetch inesperado: ' + req.url);
    }) as typeof fetch;
    return () => { globalThis.fetch = real; };
  }

  // ---------- Supabase ----------
  private match(row: Row, url: URL) {
    for (const [col, expr] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue;
      const i = expr.indexOf('.');
      const op = expr.slice(0, i), val = expr.slice(i + 1);
      const cell = row[col];
      if (op === 'eq' && String(cell) !== val) return false;
      if (op === 'neq' && String(cell) === val) return false;
      if (op === 'in' && !val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cell))) return false;
      if (op === 'like' && !new RegExp('^' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 's').test(String(cell ?? ''))) return false;
      if (op === 'gte' && !(String(cell) >= val)) return false;
    }
    return true;
  }

  private async supabase(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    if (p === '/auth/v1/user') {
      const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (tok === 'tok') return json({ id: 'u1', aud: 'authenticated', email: 'ana@test.dev', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
      if (tok === 'tok2') return json({ id: 'u2', aud: 'authenticated', email: 'bob@test.dev', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
      return json({ msg: 'invalid JWT' }, 401);
    }
    if (p.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') { this.deletedUsers.push(p.split('/').pop()!); return json({}); }
    if (p.startsWith('/storage/v1/object/list/')) {
      const prefix = ((await req.json()) as any).prefix || '';
      const names = [...this.storage.keys()].filter((k) => k.startsWith(prefix + '/')).map((k) => ({ name: k.slice(prefix.length + 1) }));
      return json(names);
    }
    if (p.startsWith('/storage/v1/object/generated') && req.method === 'DELETE') {
      for (const k of ((await req.json()) as any).prefixes ?? []) this.storage.delete(k);
      return json([]);
    }
    if (p.startsWith('/storage/v1/object/generated/')) {
      this.storage.set(decodeURIComponent(p.replace('/storage/v1/object/generated/', '')), new Uint8Array(await req.arrayBuffer()));
      return json({ Key: p });
    }
    if (p.startsWith('/rest/v1/rpc/')) return this.rpc(p.split('/').pop()!, (await req.json()) as any);

    const table = p.replace('/rest/v1/', '');
    const rows = this.tables[table];
    if (!rows) return json({ message: 'tabla desconocida ' + table }, 404);
    if (req.method !== 'GET' && this.failTables.includes(table)) return json({ code: 'XX000', message: 'db down' }, 500);
    const wantsObject = (req.headers.get('accept') || '').includes('vnd.pgrst.object');
    const respond = (list: Row[], status = 200) => {
      if (wantsObject) return list.length === 1 ? json(list[0], status) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
      return json(list, status);
    };
    const prefer = req.headers.get('prefer') || '';

    if (req.method === 'GET' || req.method === 'HEAD') {
      let out = rows.filter((r) => this.match(r, url));
      const order = url.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const limit = url.searchParams.get('limit');
      if (limit) out = out.slice(0, Number(limit));
      return respond(out);
    }
    if (req.method === 'POST') {
      const body = (await req.json()) as Row | Row[];
      const list = Array.isArray(body) ? body : [body];
      const keyCols = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
      const saved: Row[] = [];
      for (const item of list) {
        this.seq += 1; const now = new Date(Date.now() + this.seq).toISOString();
        const row: Row = { ...item };
        if (['conversations', 'messages'].includes(table)) { row.id ??= this.uuid(); row.created_at ??= now; }
        if (table === 'conversations') { row.title ??= 'Nueva conversación'; row.updated_at ??= now; }
        if (prefer.includes('merge-duplicates') && keyCols.length) {
          const ex = rows.find((r) => keyCols.every((k) => r[k] === row[k]));
          if (ex) { Object.assign(ex, row); saved.push(ex); continue; }
        }
        if (prefer.includes('ignore-duplicates')) {
          const pk = table === 'usage' ? ['user_id', 'day'] : ['user_id'];
          if (rows.some((r) => pk.every((k) => r[k] === row[k]))) continue;
        }
        rows.push(row); saved.push(row);
      }
      return prefer.includes('return=representation') ? respond(saved, 201) : new Response(null, { status: 201 });
    }
    if (req.method === 'PATCH') {
      const patch = (await req.json()) as Row;
      const hit = rows.filter((r) => this.match(r, url));
      hit.forEach((r) => Object.assign(r, patch));
      return prefer.includes('return=representation') ? respond(hit) : new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE') {
      const hit = rows.filter((r) => this.match(r, url));
      this.tables[table] = rows.filter((r) => !hit.includes(r));
      if (table === 'conversations') this.tables.messages = this.tables.messages.filter((m) => !hit.some((c) => c.id === m.conversation_id));
      return prefer.includes('return=representation') ? respond(hit) : new Response(null, { status: 204 });
    }
    return json({ message: 'método no soportado' }, 405);
  }

  private rpc(fn: string, a: any): Response {
    if (fn === 'consume_usage') {
      const { p_user, p_d, p_m } = a;
      const day = madridDay();
      const row = this.usageRow(p_user, day);
      const first = day.slice(0, 8) + '01';
      for (const k of ['messages', 'searches', 'images', 'audios', 'generations', 'deep']) {
        const dd = p_d[k] ?? 0;
        if (dd <= 0) continue;
        if (row[k] + dd > (p_m[k] ?? 0)) return json('day:' + k);
        if (('month_' + k) in p_m) {
          const month = this.tables.usage.filter((r) => r.user_id === p_user && r.day >= first).reduce((s, r) => s + r[k], 0);
          if (month + dd > p_m['month_' + k]) return json('month:' + k);
        }
      }
      for (const k of ['messages', 'searches', 'images', 'audios', 'generations', 'deep']) row[k] += p_d[k] ?? 0;
      return json('ok');
    }
    if (fn === 'add_tokens') { this.usageRow(a.p_user).tokens += Math.max(Number(a.p_n), 0); return new Response(null, { status: 204 }); }
    if (fn === 'refund_usage') {
      const row = this.usageRow(a.p_user);
      for (const k of ['messages', 'searches', 'images', 'audios', 'generations', 'deep']) row[k] = Math.max(row[k] - (a.p_d[k] ?? 0), 0);
      return new Response(null, { status: 204 });
    }
    if (fn === 'hit_rate') {
      const now = Date.now();
      let r = this.tables.rate_limits.find((x) => x.user_id === a.p_user && x.bucket === a.p_bucket);
      if (!r || now - r.window_start > a.p_window * 1000) { r = { user_id: a.p_user, bucket: a.p_bucket, window_start: now, hits: 0 }; this.tables.rate_limits = this.tables.rate_limits.filter((x) => x !== undefined && !(x.user_id === a.p_user && x.bucket === a.p_bucket)); this.tables.rate_limits.push(r); }
      r.hits += 1;
      return json(r.hits <= a.p_limit);
    }
    return json({ message: 'rpc desconocida ' + fn }, 404);
  }

  // ---------- OpenAI ----------
  private async openai(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    if (p === '/v1/moderations') {
      const b: any = await req.json();
      this.moderationInputs.push(b.input);
      const n = Array.isArray(b.input) ? b.input.length : 1;
      return json({ results: Array.from({ length: n }, () => ({ flagged: this.flagModeration })) });
    }

    if (p === '/v1/responses') {
      const body: any = await req.json();
      this.responsesCalls.push(body);
      if (this.rejectModels.includes(body.model)) return json({ error: { message: `The model \`${body.model}\` does not exist or you do not have access to it.` } }, 404);
      if (this.rejectReasoning && body.reasoning) return json({ error: { message: "Unsupported parameter: 'reasoning.effort' is not supported with this model." } }, 400);
      if (this.rejectMaxToolCalls && body.max_tool_calls) return json({ error: { message: "Unknown parameter: 'max_tool_calls'." } }, 400);
      if (this.responsesStatus) return json({ error: { message: 'boom' } }, this.responsesStatus);
      if (!body.stream) {
        const ins = String(body.instructions || '');
        const text = ins.includes('título') ? 'Plan de viaje' : ins.includes('preguntas de seguimiento') ? '["¿Y el precio?","¿Hay alternativas?","Dame un ejemplo"]' : 'ok';
        return json({ output: [{ content: [{ type: 'output_text', text }] }] });
      }
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start: (c) => {
          if (this.incompleteEmpty) { c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'response.incomplete' })}\n\n`)); c.close(); return; }
          for (const d of this.chatChunks) c.enqueue(enc.encode(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: d })}\n\n`));
          if (body.tools) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://example.com/a?utm_source=x', title: 'Ejemplo' } })}\n\n`));
          c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'response.completed', response: this.tokensUsed ? { usage: { total_tokens: this.tokensUsed } } : {} })}\n\n`));
          c.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    if (p === '/v1/images/generations') {
      const body: any = await req.json();
      this.imageCalls.push(body);
      if (this.imageMode === 'fail') return json({ error: { message: 'server error' } }, 500);
      if (this.imageMode === 'blocked') return json({ error: { message: 'Your request was rejected by the safety system.', code: 'moderation_blocked' } }, 400);
      if (this.imageMode === 'rejectParams' && body.output_format) return json({ error: { message: 'Unknown parameter: output_format' } }, 400);
      if (this.rejectModels.includes(body.model)) return json({ error: { message: `The model ${body.model} does not exist` } }, 404);
      return json({ data: [{ b64_json: TINY_PNG }] });
    }

    if (p === '/v1/audio/transcriptions') {
      const fd = await req.formData();
      const model = String(fd.get('model'));
      this.transcribeModels.push(model);
      if (this.transcribeFail) return json({ error: { message: 'down' } }, 500);
      if (this.transcribeReject.includes(model)) return json({ error: { message: 'model not found' } }, 404);
      return json({ text: this.transcript });
    }
    return json({ error: 'ruta openai no simulada ' + p }, 404);
  }

  // ---------- Stripe ----------
  subscription: Row = {
    id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, current_period_end: 1893456000,
    metadata: { user_id: 'u1' }, items: { data: [{ price: { id: 'price_plus' }, current_period_end: 1893456000 }] },
  };
  private async stripe(req: Request, url: URL): Promise<Response> {
    this.stripeCalls.push(`${req.method} ${url.pathname}`);
    if (url.pathname === '/v1/customers' && req.method === 'POST') return json({ id: 'cus_1' });
    if (this.stripeFail) return json({ error: { message: 'stripe down' } }, 500);
    if (url.pathname === '/v1/checkout/sessions' && req.method === 'GET') return json({ object: 'list', data: [], has_more: false });
    if (url.pathname === '/v1/checkout/sessions') return json({ id: 'cs_1', url: 'https://checkout.stripe.test/s' });
    if (url.pathname === '/v1/billing_portal/sessions') return json({ url: 'https://billing.stripe.test/p' });
    if (url.pathname === '/v1/subscriptions') return json({ object: 'list', data: [this.subscription, ...this.extraSubscriptions], has_more: false });
    if (url.pathname.startsWith('/v1/subscriptions/') && req.method === 'DELETE') return json({ ...this.subscription, status: 'canceled' });
    if (url.pathname.startsWith('/v1/subscriptions/')) return json([this.subscription, ...this.extraSubscriptions].find((x) => url.pathname.endsWith(x.id)) ?? this.subscription);
    return json({ error: { message: 'stripe no simulado ' + url.pathname } }, 404);
  }
}
