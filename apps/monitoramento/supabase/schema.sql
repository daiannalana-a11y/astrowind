-- Monitoramentos: esquema do banco (PostgreSQL / Supabase)
-- Execute inteiro no SQL Editor do Supabase. É seguro rodar mais de uma vez.

create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('campo', 'gestor', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nome      text not null default '',
  email     text not null default '',
  role      app_role not null default 'campo',
  unit_ids  text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id         text primary key,
  nome       text not null,
  ativo      boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.points (
  id         text primary key,
  unit_id    text not null references public.units(id),
  grupo      text not null check (grupo in ('pz', 'po', 'ete')),
  nome       text not null,
  info       text not null default '',
  prof       numeric,
  inativo    boolean not null default false,
  limites    jsonb not null default '{}'::jsonb,
  ordem      int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.readings (
  id         uuid primary key,
  point_id   text not null references public.points(id),
  unit_id    text not null references public.units(id),
  ts         timestamptz not null,
  v          jsonb not null default '{}'::jsonb,
  obs        text not null default '',
  resp       text not null default '',
  photos     text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists readings_point_ts on public.readings (point_id, ts desc);
create index if not exists readings_updated on public.readings (updated_at);
create index if not exists points_updated on public.points (updated_at);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  user_id    uuid,
  action     text not null,
  table_name text not null,
  row_id     text not null,
  before     jsonb,
  after      jsonb
);
create index if not exists audit_ts on public.audit_log (ts desc);

-- ---------------------------------------------------------------- funções auxiliares
create or replace function public.app_role_of_user() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_unit(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' or u = any(unit_ids) from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Cria o perfil assim que o usuário é criado no Auth. O primeiro usuário vira admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  select not exists (select 1 from public.profiles) into primeiro;
  insert into public.profiles (id, nome, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email,
          case when primeiro then 'admin'::app_role else 'campo'::app_role end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auditoria de alterações em leituras, pontos e unidades.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'criou'
      when tg_op = 'DELETE' then 'excluiu'
      when tg_op = 'UPDATE' and to_jsonb(new)->>'deleted_at' is not null and to_jsonb(old)->>'deleted_at' is null then 'excluiu'
      else 'alterou'
    end,
    tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['units', 'points', 'readings'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- segurança por linha (RLS)
alter table public.profiles  enable row level security;
alter table public.units     enable row level security;
alter table public.points    enable row level security;
alter table public.readings  enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role_of_user() = 'admin');
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.app_role_of_user() = 'admin') with check (public.app_role_of_user() = 'admin');

drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated using (public.has_unit(id));
drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (public.app_role_of_user() = 'admin') with check (public.app_role_of_user() = 'admin');

drop policy if exists points_select on public.points;
create policy points_select on public.points for select to authenticated using (public.has_unit(unit_id));
drop policy if exists points_write on public.points;
create policy points_write on public.points for all to authenticated
  using (public.app_role_of_user() in ('gestor', 'admin') and public.has_unit(unit_id))
  with check (public.app_role_of_user() in ('gestor', 'admin') and public.has_unit(unit_id));

drop policy if exists readings_select on public.readings;
create policy readings_select on public.readings for select to authenticated using (public.has_unit(unit_id));
drop policy if exists readings_insert on public.readings;
create policy readings_insert on public.readings for insert to authenticated
  with check (public.has_unit(unit_id) and created_by = auth.uid());
-- Quem registra pode corrigir por 24 h. Gestor e admin corrigem e excluem (exclusão lógica) a qualquer momento.
drop policy if exists readings_update on public.readings;
create policy readings_update on public.readings for update to authenticated
  using (public.has_unit(unit_id) and (
    public.app_role_of_user() in ('gestor', 'admin')
    or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (public.has_unit(unit_id));

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.app_role_of_user() in ('gestor', 'admin'));

-- ---------------------------------------------------------------- fotos (Storage)
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists fotos_select on storage.objects;
create policy fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.has_unit((storage.foldername(name))[1]));
drop policy if exists fotos_insert on storage.objects;
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.has_unit((storage.foldername(name))[1]));

-- ---------------------------------------------------------------- dados iniciais
insert into public.units (id, nome) values ('sjlp', 'São José da Lapa') on conflict (id) do nothing;

insert into public.points (id, unit_id, grupo, nome, info, prof, inativo, ordem) values
  ('sjlp-pz01',  'sjlp', 'pz',  'PZ.01', 'UTM 610691 / 7819985 · cota 783 m · fundo 718 m · profundidade 65 m', 65, false, 1),
  ('sjlp-pz02',  'sjlp', 'pz',  'PZ.02', 'Caixa de proteção pendente. Profundidade a confirmar.', null, false, 2),
  ('sjlp-pz03',  'sjlp', 'pz',  'PZ.03', 'UTM 608719 / 7820445 · cota 774 m · fundo 718 m · profundidade 56 m', 56, false, 3),
  ('sjlp-inhame','sjlp', 'pz',  'Inhame', '', null, false, 4),
  ('sjlp-chico', 'sjlp', 'pz',  'Chico', '', null, false, 5),
  ('sjlp-poco3', 'sjlp', 'po',  'Poço artesiano 3', 'Registro do hidrômetro e do horímetro do poço.', null, false, 6),
  ('sjlp-poco4', 'sjlp', 'po',  'Poço artesiano 4', 'Registro do hidrômetro e do horímetro do poço.', null, true, 7),
  ('sjlp-poco5', 'sjlp', 'po',  'Poço artesiano 5', 'Hidrômetro em manutenção, aguardando novo equipamento.', null, false, 8),
  ('sjlp-poco6', 'sjlp', 'po',  'Poço artesiano 6', 'Registro do hidrômetro e do horímetro do poço.', null, true, 9),
  ('sjlp-cava',  'sjlp', 'po',  'Cava', 'Hidrômetro Itron (bombeamento) e horímetro BB-BA05 (bomba d''água da cava).', null, false, 10),
  ('sjlp-ete',   'sjlp', 'ete', 'ETE', 'Horímetro 1: mostrador superior. Horímetro 2: mostrador inferior.', null, false, 11)
on conflict (id) do nothing;
