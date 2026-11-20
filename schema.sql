-- Hilvana AI · Ejecuta en Supabase → SQL Editor. Idempotente (puedes volver a ejecutarlo).
create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated on public.conversations(user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_created on public.messages(conversation_id, created_at);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free','plus','pro')),
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages int not null default 0,
  searches int not null default 0,
  images int not null default 0,
  primary key (user_id, day)
);
alter table public.usage add column if not exists audios int not null default 0;
alter table public.usage add column if not exists generations int not null default 0;
alter table public.usage add column if not exists deep int not null default 0;
alter table public.usage add column if not exists tokens bigint not null default 0;
create index if not exists usage_user_day on public.usage(user_id, day desc);

-- Antiabuso por minuto (solo lo toca el servidor)
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  hits int not null default 0,
  primary key (user_id, bucket)
);
alter table public.rate_limits enable row level security;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  instructions text check (char_length(instructions) <= 800),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.profiles enable row level security;
alter table public.feedback enable row level security;

-- Conversaciones y mensajes: el usuario solo LEE; todo lo escribe el servidor (así no se salta el borrado de imágenes).
drop policy if exists "own conversations" on public.conversations;
drop policy if exists "own conversations read" on public.conversations;
create policy "own conversations read" on public.conversations for select using (auth.uid() = user_id);

-- Los mensajes los escribe solo el servidor (service role). El usuario lee los suyos.
drop policy if exists "own messages read" on public.messages;
create policy "own messages read" on public.messages for select using (auth.uid() = user_id);
drop policy if exists "own messages delete" on public.messages;

drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions for select using (auth.uid() = user_id);

drop policy if exists "own usage read" on public.usage;
create policy "own usage read" on public.usage for select using (auth.uid() = user_id);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own feedback" on public.feedback;
create policy "own feedback" on public.feedback for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Imágenes generadas: bucket privado; cada usuario solo lee su carpeta (<user_id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated', 'generated', false, 8388608, array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "read own generated images" on storage.objects;
create policy "read own generated images" on storage.objects for select to authenticated
  using (bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text);

-- Cuota atómica: diaria (Europe/Madrid) y mensual. Devuelve 'ok' o 'day:<tipo>' / 'month:<tipo>'.
drop function if exists public.consume_usage(uuid,int,int,int,int,int,int);
drop function if exists public.refund_usage(uuid,int,int,int);
drop function if exists public.consume_usage(uuid,jsonb,jsonb);

create or replace function public.consume_usage(p_user uuid, p_d jsonb, p_m jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_mstart date := date_trunc('month', (now() at time zone 'Europe/Madrid'))::date;
  kinds text[] := array['messages','searches','images','audios','generations','deep'];
  k text; dd int; cur_day int; cur_month int;
begin
  insert into public.usage(user_id, day) values (p_user, v_day) on conflict do nothing;
  perform 1 from public.usage where user_id = p_user and day = v_day for update; -- serializa peticiones simultáneas
  foreach k in array kinds loop
    dd := coalesce((p_d->>k)::int, 0);
    if dd <= 0 then continue; end if;
    execute format('select %I from public.usage where user_id = $1 and day = $2', k) into cur_day using p_user, v_day;
    if cur_day + dd > coalesce((p_m->>k)::int, 0) then return 'day:' || k; end if;
    if p_m ? ('month_' || k) then
      execute format('select coalesce(sum(%I),0) from public.usage where user_id = $1 and day >= $2', k) into cur_month using p_user, v_mstart;
      if cur_month + dd > (p_m->>('month_' || k))::int then return 'month:' || k; end if;
    end if;
  end loop;
  update public.usage u set
    messages = u.messages + coalesce((p_d->>'messages')::int, 0),
    searches = u.searches + coalesce((p_d->>'searches')::int, 0),
    images = u.images + coalesce((p_d->>'images')::int, 0),
    audios = u.audios + coalesce((p_d->>'audios')::int, 0),
    generations = u.generations + coalesce((p_d->>'generations')::int, 0),
    deep = u.deep + coalesce((p_d->>'deep')::int, 0)
  where u.user_id = p_user and u.day = v_day;
  return 'ok';
end $$;

create or replace function public.refund_usage(p_user uuid, p_d jsonb)
returns void language sql security definer set search_path = public as $$
  update public.usage u set
    messages = greatest(u.messages - coalesce((p_d->>'messages')::int, 0), 0),
    searches = greatest(u.searches - coalesce((p_d->>'searches')::int, 0), 0),
    images = greatest(u.images - coalesce((p_d->>'images')::int, 0), 0),
    audios = greatest(u.audios - coalesce((p_d->>'audios')::int, 0), 0),
    generations = greatest(u.generations - coalesce((p_d->>'generations')::int, 0), 0),
    deep = greatest(u.deep - coalesce((p_d->>'deep')::int, 0), 0)
  where u.user_id = p_user and u.day = (now() at time zone 'Europe/Madrid')::date;
$$;

-- Ráfaga por minuto: true si aún está dentro del límite.
create or replace function public.hit_rate(p_user uuid, p_bucket text, p_limit int, p_window int)
returns boolean language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into public.rate_limits as r(user_id, bucket, window_start, hits) values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window) then now() else r.window_start end
  returning hits into h;
  return h <= p_limit;
end $$;

revoke all on function public.consume_usage(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.refund_usage(uuid,jsonb) from public, anon, authenticated;
-- Tokens de IA consumidos hoy (se suman tras cada respuesta)
create or replace function public.add_tokens(p_user uuid, p_n bigint)
returns void language sql security definer set search_path = public as $$
  insert into public.usage(user_id, day, tokens) values (p_user, (now() at time zone 'Europe/Madrid')::date, greatest(p_n, 0))
  on conflict (user_id, day) do update set tokens = public.usage.tokens + greatest(p_n, 0);
$$;

revoke all on function public.add_tokens(uuid,bigint) from public, anon, authenticated;
grant execute on function public.add_tokens(uuid,bigint) to service_role;
revoke all on function public.hit_rate(uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid,jsonb,jsonb) to service_role;
grant execute on function public.refund_usage(uuid,jsonb) to service_role;
grant execute on function public.hit_rate(uuid,text,int,int) to service_role;

-- Fila de suscripción 'free' al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
