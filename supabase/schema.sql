-- Banco de dados do sistema de compras Brasmic (Supabase / PostgreSQL)
-- Execute uma única vez em: Supabase → SQL Editor → New query → cole tudo → Run.

-- Cada solicitação, cotação, pedido, fornecedor, produto etc. é uma linha.
create table if not exists public.registros (
  colecao        text        not null,             -- solicitacoes, cotacoes, pedidos, fornecedores, produtos...
  id             text        not null,
  dados          jsonb,                            -- conteúdo completo do registro
  excluido       boolean     not null default false,  -- exclusões ficam marcadas para chegar aos outros computadores
  atualizado_em  timestamptz not null default now(),
  atualizado_por text,
  primary key (colecao, id)
);

create index if not exists registros_atualizado_em_idx on public.registros (atualizado_em);

-- Data/hora e usuário de cada alteração são definidos pelo servidor (não pelo relógio do computador).
create or replace function public.registros_carimbo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := coalesce(auth.jwt() ->> 'email', new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists registros_carimbo on public.registros;
create trigger registros_carimbo
  before insert or update on public.registros
  for each row execute function public.registros_carimbo();

-- Segurança: somente usuários cadastrados (Authentication → Users) acessam os dados.
alter table public.registros enable row level security;

drop policy if exists "usuarios leem" on public.registros;
create policy "usuarios leem" on public.registros
  for select to authenticated using (true);

drop policy if exists "usuarios inserem" on public.registros;
create policy "usuarios inserem" on public.registros
  for insert to authenticated with check (true);

drop policy if exists "usuarios alteram" on public.registros;
create policy "usuarios alteram" on public.registros
  for update to authenticated using (true) with check (true);

-- Não há política de DELETE: nada é apagado fisicamente pelo aplicativo (exclusões são marcadas),
-- o que preserva o histórico de compras.

-- Histórico de auditoria: guarda cada versão alterada (quem, quando, o quê).
create table if not exists public.registros_historico (
  seq            bigint generated always as identity primary key,
  colecao        text not null,
  id             text not null,
  dados          jsonb,
  excluido       boolean,
  alterado_em    timestamptz not null default now(),
  alterado_por   text
);

create or replace function public.registros_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.registros_historico (colecao, id, dados, excluido, alterado_por)
  values (new.colecao, new.id, new.dados, new.excluido, new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists registros_auditoria on public.registros;
create trigger registros_auditoria
  after insert or update on public.registros
  for each row execute function public.registros_auditoria();

alter table public.registros_historico enable row level security;
-- O histórico só é consultado pelo painel do Supabase (administrador); o aplicativo não lê nem grava nele.
