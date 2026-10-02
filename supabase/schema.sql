-- =====================================================================
-- Portal de Compras Brasmic — banco de dados central (Supabase / PostgreSQL)
-- Execute TODO este arquivo em: Supabase → SQL Editor → New query → Run.
-- Pode ser executado de novo sem perder dados (atualiza tabelas e regras).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Dados do portal: cada solicitação, cotação, pedido, produto, fornecedor, equipamento,
-- solicitante, comprador, centro de custo, entrega (aceite) e movimento de estoque é uma linha.
create table if not exists public.registros (
  colecao        text        not null,
  id             text        not null,
  dados          jsonb,
  excluido       boolean     not null default false,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text,
  primary key (colecao, id)
);
create index if not exists registros_atualizado_em_idx on public.registros (atualizado_em);

-- Usuários do portal e suas permissões (o login fica no Supabase Auth)
create table if not exists public.perfis (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  nome              text not null default '',
  categoria         text not null default 'basico' check (categoria in ('basico', 'comprador', 'administrador')),
  centros           text[] not null default '{}',     -- centros de custo (ids) do usuário
  solicitante_id    text,                             -- vínculo com o cadastro de solicitantes
  comprador_id      text,                             -- vínculo com o cadastro de compradores (alçada)
  ver_totalizadores boolean not null default false,   -- valores sensíveis do painel
  ver_registros     boolean not null default false,   -- consulta da auditoria
  pode_cadastros    boolean not null default false,   -- comprador autorizado a alterar produtos/fornecedores
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- Alçadas de aprovação de pedidos (limite nulo = "acima de")
create table if not exists public.alcadas (
  nivel     int primary key check (nivel between 1 and 9),
  descricao text,
  limite    numeric(14, 2)
);
insert into public.alcadas (nivel, limite) values (1, 500), (2, 1000), (3, null)
  on conflict (nivel) do nothing;

-- Registro de tudo o que é feito no portal (quem, quando, o quê)
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  quando      timestamptz not null default now(),
  user_id     uuid,
  email       text,
  nome        text,
  acao        text not null,          -- criou | alterou | excluiu | acesso
  colecao     text,
  registro_id text,
  resumo      text,
  detalhe     jsonb                   -- campos alterados: { campo: { de, para } }
);
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);
create index if not exists auditoria_email_idx on public.auditoria (email);

-- ---------------------------------------------------------------------
-- 2. Funções de apoio às regras de acesso
-- ---------------------------------------------------------------------
create or replace function public.meu_perfil() returns public.perfis
language sql stable security definer set search_path = public as $$
  select * from public.perfis where user_id = auth.uid() and ativo
$$;

create or replace function public.minha_categoria() returns text
language sql stable security definer set search_path = public as $$
  select categoria from public.perfis where user_id = auth.uid() and ativo
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_categoria() = 'administrador', false)
$$;

create or replace function public.eh_comprador() returns boolean    -- comprador ou administrador
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_categoria() in ('comprador', 'administrador'), false)
$$;

create or replace function public.pode_cadastros() returns boolean   -- produtos e fornecedores
language sql stable security definer set search_path = public as $$
  select coalesce((select categoria = 'administrador' or (categoria = 'comprador' and pode_cadastros)
                   from public.perfis where user_id = auth.uid() and ativo), false)
$$;

create or replace function public.meus_centros() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select centros from public.perfis where user_id = auth.uid() and ativo), '{}')
$$;

create or replace function public.meu_solicitante() returns text
language sql stable security definer set search_path = public as $$
  select solicitante_id from public.perfis where user_id = auth.uid() and ativo
$$;

create or replace function public.ver_registros() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select categoria = 'administrador' or ver_registros
                   from public.perfis where user_id = auth.uid() and ativo), false)
$$;

-- Níveis de alçada do usuário (definidos no cadastro de compradores)
create or replace function public.meus_niveis() returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select (n)::int
    from public.perfis p
    join public.registros r on r.colecao = 'compradores' and r.id = p.comprador_id and not r.excluido
    cross join lateral jsonb_array_elements_text(coalesce(r.dados -> 'niveis', '[]'::jsonb)) as n
    where p.user_id = auth.uid() and p.ativo
  ), '{}')
$$;

-- Nível exigido para um valor (null = não há alçadas)
create or replace function public.nivel_necessario(valor numeric) returns int
language sql stable security definer set search_path = public as $$
  select min(nivel) from public.alcadas where limite is null or valor <= limite
$$;

-- ---------------------------------------------------------------------
-- 3. Regras de negócio aplicadas pelo próprio banco
-- ---------------------------------------------------------------------
create or replace function public.registros_regras()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nec int;
  status_antigo text;
  status_novo text;
begin
  -- carimbo do servidor (não depende do relógio do computador)
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := coalesce(auth.jwt() ->> 'email', new.atualizado_por);
  -- exclusão mantém o conteúdo (histórico e regras de visibilidade)
  if tg_op = 'UPDATE' and new.excluido and new.dados is null then
    new.dados := old.dados;
  end if;

  -- segregação de funções: quem gerou o pedido não pode aprová-lo (vale para todos)
  if new.colecao = 'pedidos' and tg_op = 'UPDATE' and old.dados ->> 'status' = 'aguardando_aprovacao'
     and new.dados ->> 'status' not in ('aguardando_aprovacao', 'cancelado')
     and old.dados ->> 'criadoPor' = auth.uid()::text then
    raise exception 'Quem gerou o pedido não pode aprová-lo';
  end if;

  -- alçada: pedido só sai de "aguardando aprovação" com autorizador de nível suficiente
  if new.colecao = 'pedidos' and not public.eh_admin() then
    status_novo := new.dados ->> 'status';
    status_antigo := case when tg_op = 'UPDATE' then old.dados ->> 'status' end;
    if tg_op = 'INSERT' and exists (select 1 from public.alcadas) and status_novo is distinct from 'aguardando_aprovacao'
       and not exists (select 1 from public.registros r where r.colecao = new.colecao and r.id = new.id) then
      raise exception 'Alçada: pedidos novos precisam aguardar aprovação';
    end if;
    if tg_op = 'UPDATE' and status_antigo = 'aguardando_aprovacao'
       and status_novo not in ('aguardando_aprovacao', 'cancelado') then
      nec := public.nivel_necessario(greatest(coalesce((old.dados ->> 'total')::numeric, 0), coalesce((new.dados ->> 'total')::numeric, 0)));
      if nec is not null and not (select coalesce(bool_and(n = any (public.meus_niveis())), false) from generate_series(1, nec) n) then
        raise exception 'Alçada insuficiente: este pedido exige autorizador com níveis 1 a %', nec;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registros_carimbo on public.registros;
drop trigger if exists registros_regras on public.registros;
create trigger registros_regras
  before insert or update on public.registros
  for each row execute function public.registros_regras();

-- ---------------------------------------------------------------------
-- 4. Auditoria automática (quem fez o quê)
-- ---------------------------------------------------------------------
create or replace function public.auditar(p_acao text, p_colecao text, p_id text, p_resumo text, p_detalhe jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (user_id, email, nome, acao, colecao, registro_id, resumo, detalhe)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', 'sistema'),
          coalesce((select nome from public.perfis where user_id = auth.uid()), auth.jwt() ->> 'email', 'Sistema'),
          p_acao, p_colecao, p_id, p_resumo, p_detalhe);
end;
$$;

create or replace function public.diferencas(antes jsonb, depois jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('de', antes -> k, 'para', depois -> k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(antes, '{}'::jsonb) || coalesce(depois, '{}'::jsonb)) as k) ks
  where k not in ('alteradoEm', 'historico') and (antes -> k) is distinct from (depois -> k)
$$;

create or replace function public.registros_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rotulo text := case new.colecao
    when 'solicitacoes' then 'Solicitação' when 'cotacoes' then 'Cotação' when 'pedidos' then 'Pedido'
    when 'produtos' then 'Produto' when 'fornecedores' then 'Fornecedor' when 'solicitantes' then 'Solicitante'
    when 'compradores' then 'Comprador' when 'centrosCusto' then 'Centro de custo' when 'movimentos' then 'Movimento de estoque'
    when 'equipamentos' then 'Equipamento' when 'entregas' then 'Entrega' when 'categoriasDespesa' then 'Categoria de despesa'
    when '_sistema' then 'Configurações' else new.colecao end;
  nome_reg text := coalesce(new.dados ->> 'numero', new.dados ->> 'razao', new.dados ->> 'descricao', new.dados ->> 'nome', new.dados ->> 'codigo', new.id);
  det jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.auditar(case when new.excluido then 'excluiu' else 'criou' end, new.colecao, new.id, rotulo || ' ' || nome_reg, null);
  elsif new.excluido and not old.excluido then
    perform public.auditar('excluiu', new.colecao, new.id, rotulo || ' ' || nome_reg, null);
  else
    det := public.diferencas(old.dados, new.dados);
    if det <> '{}'::jsonb or old.excluido <> new.excluido then
      perform public.auditar('alterou', new.colecao, new.id, rotulo || ' ' || nome_reg, det);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists registros_auditoria on public.registros;
create trigger registros_auditoria
  after insert or update on public.registros
  for each row execute function public.registros_auditoria();

create or replace function public.perfis_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  perform public.auditar(case when tg_op = 'INSERT' then 'criou' else 'alterou' end, 'usuarios', new.user_id::text,
    'Usuário ' || new.email,
    case when tg_op = 'INSERT' then jsonb_build_object('categoria', jsonb_build_object('de', null, 'para', new.categoria))
         else public.diferencas(to_jsonb(old) - 'atualizado_em', to_jsonb(new) - 'atualizado_em') end);
  return new;
end;
$$;
drop trigger if exists perfis_auditoria on public.perfis;
create trigger perfis_auditoria before insert or update on public.perfis
  for each row execute function public.perfis_auditoria();

create or replace function public.alcadas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.auditar(case tg_op when 'INSERT' then 'criou' when 'DELETE' then 'excluiu' else 'alterou' end, 'alcadas',
    coalesce(new.nivel, old.nivel)::text, 'Alçada nível ' || coalesce(new.nivel, old.nivel),
    jsonb_build_object('limite', jsonb_build_object('de', case when tg_op <> 'INSERT' then to_jsonb(old.limite) end, 'para', case when tg_op <> 'DELETE' then to_jsonb(new.limite) end)));
  return coalesce(new, old);
end;
$$;
drop trigger if exists alcadas_auditoria on public.alcadas;
create trigger alcadas_auditoria after insert or update or delete on public.alcadas
  for each row execute function public.alcadas_auditoria();

-- Entradas e saídas do portal (chamado pelo aplicativo após o login)
create or replace function public.registrar_acesso(evento text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform public.auditar('acesso', 'usuarios', auth.uid()::text, left(coalesce(evento, 'acesso'), 80), null);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Segurança por linha (RLS): quem vê e quem altera o quê
-- ---------------------------------------------------------------------
alter table public.registros enable row level security;
alter table public.perfis    enable row level security;
alter table public.alcadas   enable row level security;
alter table public.auditoria enable row level security;

-- remove políticas da versão anterior
drop policy if exists "usuarios leem" on public.registros;
drop policy if exists "usuarios inserem" on public.registros;
drop policy if exists "usuarios alteram" on public.registros;
drop policy if exists registros_ler on public.registros;
drop policy if exists registros_inserir on public.registros;
drop policy if exists registros_alterar on public.registros;

-- LEITURA: compradores e administradores veem tudo; básico vê cadastros de consulta
-- e as solicitações dos seus centros de custo (ou criadas por ele)
create policy registros_ler on public.registros for select to authenticated using (
  public.eh_comprador()
  or (public.minha_categoria() = 'basico' and (
        colecao in ('produtos', 'equipamentos', 'categoriasDespesa', 'solicitantes', 'centrosCusto', '_sistema')
     or (colecao = 'solicitacoes' and (dados ->> 'centroCustoId' = any (public.meus_centros()) or dados ->> 'criadoPor' = auth.uid()::text))
     or (colecao = 'entregas' and (dados ->> 'solicitanteUserId' = auth.uid()::text or dados ->> 'solicitanteId' = public.meu_solicitante()
                                   or dados ->> 'centroCustoId' = any (public.meus_centros())))
  ))
);

-- INCLUSÃO
create policy registros_inserir on public.registros for insert to authenticated with check (
  public.eh_admin()
  or (public.minha_categoria() = 'comprador' and (
        colecao in ('solicitacoes', 'cotacoes', 'pedidos', 'movimentos', 'entregas')
     or (colecao in ('produtos', 'fornecedores', 'equipamentos', 'categoriasDespesa') and public.pode_cadastros())
  ))
  or (public.minha_categoria() = 'basico' and colecao = 'solicitacoes'
      and dados ->> 'criadoPor' = auth.uid()::text
      and dados ->> 'centroCustoId' = any (public.meus_centros())
      and dados ->> 'status' in ('rascunho', 'aberta'))
);

-- ALTERAÇÃO (inclui exclusão lógica): básico só a própria solicitação ainda aberta
create policy registros_alterar on public.registros for update to authenticated using (
  public.eh_admin()
  or (public.minha_categoria() = 'comprador' and (
        colecao in ('solicitacoes', 'cotacoes', 'pedidos', 'movimentos', 'entregas')
     or (colecao in ('produtos', 'fornecedores', 'equipamentos', 'categoriasDespesa') and public.pode_cadastros())
  ))
  or (public.minha_categoria() = 'basico' and colecao = 'solicitacoes'
      and dados ->> 'criadoPor' = auth.uid()::text and dados ->> 'status' in ('rascunho', 'aberta', 'aguardando_aceite'))
  -- aceite do recebimento pelo solicitante
  or (public.minha_categoria() = 'basico' and colecao = 'entregas' and dados ->> 'status' = 'aguardando_aceite'
      and (dados ->> 'solicitanteUserId' = auth.uid()::text or dados ->> 'solicitanteId' = public.meu_solicitante()))
) with check (
  public.eh_admin()
  or (public.minha_categoria() = 'comprador' and (
        colecao in ('solicitacoes', 'cotacoes', 'pedidos', 'movimentos', 'entregas')
     or (colecao in ('produtos', 'fornecedores', 'equipamentos', 'categoriasDespesa') and public.pode_cadastros())
  ))
  or (public.minha_categoria() = 'basico' and colecao = 'solicitacoes'
      and dados ->> 'criadoPor' = auth.uid()::text
      and dados ->> 'centroCustoId' = any (public.meus_centros())
      and (dados ->> 'status' in ('rascunho', 'aberta', 'cancelada', 'atendida') or excluido))
  or (public.minha_categoria() = 'basico' and colecao = 'entregas' and not excluido
      and dados ->> 'status' in ('aceita', 'recusada')
      and (dados ->> 'solicitanteUserId' = auth.uid()::text or dados ->> 'solicitanteId' = public.meu_solicitante()))
);
-- não há DELETE: exclusões são marcadas (excluido = true) e ficam no histórico

-- PERFIS: cada um lê o próprio; administradores leem e alteram todos
drop policy if exists perfis_ler on public.perfis;
drop policy if exists perfis_admin on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (user_id = auth.uid() or public.eh_admin());
create policy perfis_admin on public.perfis for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ALÇADAS: todos os usuários ativos leem; só administradores alteram
drop policy if exists alcadas_ler on public.alcadas;
drop policy if exists alcadas_admin on public.alcadas;
create policy alcadas_ler on public.alcadas for select to authenticated using (public.minha_categoria() is not null);
create policy alcadas_admin on public.alcadas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- AUDITORIA: só leitura, para administradores e usuários autorizados; ninguém altera
drop policy if exists auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated using (public.ver_registros());

grant usage on schema public to authenticated;
grant select, insert, update on public.registros to authenticated;
grant select, insert, update, delete on public.perfis, public.alcadas to authenticated;
grant select on public.auditoria to authenticated;
revoke insert, update, delete on public.auditoria from authenticated, anon;
revoke all on public.registros, public.perfis, public.alcadas, public.auditoria from anon;
grant execute on function public.registrar_acesso(text) to authenticated;

-- tabela antiga da versão 1 (substituída por auditoria)
drop trigger if exists registros_auditoria_v1 on public.registros;

-- ---------------------------------------------------------------------
-- 6. PRIMEIRO ADMINISTRADOR
-- Depois de criar o seu usuário em Authentication → Users, rode a linha
-- abaixo trocando o e-mail (só é preciso uma vez):
--
--   select public.tornar_admin('seu.email@brasmic.com.br', 'Seu Nome');
-- ---------------------------------------------------------------------
create or replace function public.tornar_admin(p_email text, p_nome text default '')
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    return 'Usuário ' || p_email || ' não encontrado. Crie-o antes em Authentication → Users.';
  end if;
  insert into public.perfis (user_id, email, nome, categoria, ver_totalizadores, ver_registros, pode_cadastros, ativo)
  values (uid, lower(p_email), coalesce(nullif(p_nome, ''), p_email), 'administrador', true, true, true, true)
  on conflict (user_id) do update set categoria = 'administrador', ativo = true;
  return 'Pronto: ' || p_email || ' agora é administrador do portal.';
end;
$$;
revoke execute on function public.tornar_admin(text, text) from public, anon, authenticated;
