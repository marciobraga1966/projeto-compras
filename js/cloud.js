/* Banco de dados central (Supabase / PostgreSQL).
   Quando js/env.js traz SUPABASE_URL e a chave pública, o Supabase é a fonte única dos dados:
   - o acesso exige login (usuários criados pelo administrador);
   - ao entrar, o portal baixa a base inteira do banco;
   - cada gravação vai para o banco em seguida (≤ 1 s) e o portal avisa se o banco recusar;
   - alterações dos outros usuários chegam a cada 15 s.
   O navegador guarda só uma cópia de trabalho (cache) da base central. */
(function (root) {
  'use strict';
  const { U, S } = root;
  const SYS = '_sistema';
  const PULL_MS = 15000;
  const K_SESSAO = 'brasmic-sessao';

  const env = root.BRASMIC_ENV || {};
  let sessao = null;        // { access, refresh, expira, user: { id, email } }
  let sync = null;          // { hashes, ultimo } por usuário
  let status = { estado: 'desligado', msg: '', quando: new Date() };
  let pushTimer = null, pullTimer = null, busy = false, pendente = false;
  const listeners = [];

  const Cloud = {};
  Cloud.ativo = () => !!(env.supabaseUrl && env.supabaseAnonKey);
  Cloud.url = () => (env.supabaseUrl || '').replace(/\/+$/, '');
  Cloud.sessao = () => sessao;
  Cloud.onStatus = fn => listeners.push(fn);
  Cloud.status = () => status;

  function ls(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null');
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function setStatus(estado, msg) {
    status = { estado: estado, msg: msg || '', quando: new Date() };
    listeners.forEach(fn => { try { fn(status); } catch (e) { console.error(e); } });
  }
  function syncKey() { return 'brasmic-sync-' + (sessao && sessao.user.id); }
  function saveSync() { ls(syncKey(), sync); }

  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function localRecords(dbx) {
    const d = dbx || S.db;
    const out = {};
    S.COLLECTIONS.forEach(col => (d[col] || []).forEach(r => { out[col + '/' + r.id] = { colecao: col, id: r.id, dados: r }; }));
    out[SYS + '/config'] = { colecao: SYS, id: 'config', dados: d.config };
    return out;
  }

  /* ---------- HTTP ---------- */
  function traduzErro(j, st) {
    const m = (j && (j.message || j.error_description || j.msg || j.error)) || ('erro ' + st);
    if (/invalid login|invalid_grant|credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/row-level security|permission denied|42501/i.test(m) || (j && j.code === '42501')) return 'Sem permissão para esta operação.';
    if (/registros.* does not exist|Could not find the table/i.test(m)) return 'O banco ainda não foi preparado: rode o script supabase/schema.sql no SQL Editor do Supabase.';
    if (/Alçada|aprová-lo/i.test(m)) return m;
    return m;
  }

  async function authRequest(grant, body) {
    const r = await fetch(Cloud.url() + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST', headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(traduzErro(j, r.status));
    sessao = {
      access: j.access_token, refresh: j.refresh_token,
      expira: Date.now() + ((j.expires_in || 3600) - 60) * 1000,
      user: { id: j.user ? j.user.id : (sessao && sessao.user.id), email: j.user ? j.user.email : (sessao && sessao.user.email) }
    };
    ls(K_SESSAO, sessao);
  }

  async function token() {
    if (!sessao) throw new Error('Sessão encerrada — entre novamente.');
    if (sessao.access && Date.now() < sessao.expira) return sessao.access;
    try { await authRequest('refresh_token', { refresh_token: sessao.refresh }); }
    catch (e) { sessao = null; ls(K_SESSAO, null); setStatus('login', 'Sessão expirada'); if (root.Auth) root.Auth.sessaoExpirada(); throw new Error('Sessão expirada — entre novamente.'); }
    return sessao.access;
  }

  /* Chamada REST ao banco; devolve { data, headers } */
  Cloud.rest = async function (method, path, body, headers) {
    for (let tent = 0; tent < 2; tent++) {
      const t = await token();
      const r = await fetch(Cloud.url() + '/rest/v1/' + path, {
        method: method,
        headers: Object.assign({ apikey: env.supabaseAnonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, headers || {}),
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      if (r.status === 401 && tent === 0) { sessao.expira = 0; continue; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const err = new Error(traduzErro(j, r.status));
        err.status = r.status; err.code = j.code;
        throw err;
      }
      const data = r.status === 204 ? null : await r.json().catch(() => null);
      return { data: data, headers: r.headers };
    }
  };

  /* Funções do servidor Vercel (api/) que usam a chave de serviço, ex.: criar usuário */
  Cloud.api = async function (path, body) {
    const t = await token();
    const r = await fetch('/api/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || ('Falha no servidor (erro ' + r.status + ')'));
    return j;
  };

  /* ---------- Sessão ---------- */
  Cloud.login = async function (email, senha) {
    await authRequest('password', { email: email.trim(), password: senha });
    return sessao.user;
  };

  Cloud.restaurarSessao = async function () {
    sessao = ls(K_SESSAO);
    if (!sessao || !sessao.refresh) { sessao = null; return null; }
    try { await token(); return sessao.user; } catch (e) { return null; }
  };

  Cloud.logout = async function () {
    clearInterval(pullTimer);
    try { if (sessao) await fetch(Cloud.url() + '/auth/v1/logout', { method: 'POST', headers: { apikey: env.supabaseAnonKey, Authorization: 'Bearer ' + sessao.access } }); } catch (e) { /* sem rede */ }
    sessao = null;
    ls(K_SESSAO, null);
    setStatus('desligado');
  };

  /* ---------- Sincronização ---------- */
  function applyLocal(col, id, dados) {
    if (col === SYS) { if (id === 'config' && dados) Object.assign(S.db.config, dados); return; }
    if (S.COLLECTIONS.indexOf(col) < 0) return;
    const list = S.db[col];
    const i = list.findIndex(x => x.id === id);
    if (i > -1) list[i] = dados; else list.push(dados);
  }
  function removeLocal(col, id) {
    const list = S.db[col];
    if (!list) return;
    const i = list.findIndex(x => x.id === id);
    if (i > -1) list.splice(i, 1);
  }

  async function pullOnce(tudo) {
    const desde = tudo || !sync.ultimo ? '1970-01-01T00:00:00Z' : new Date(new Date(sync.ultimo).getTime() - 5000).toISOString();
    let alterou = false, ultimo = sync.ultimo, offset = 0;
    for (;;) {
      const { data: rows } = await Cloud.rest('GET', 'registros?select=colecao,id,dados,excluido,atualizado_em&atualizado_em=gt.' + encodeURIComponent(desde) +
        '&order=atualizado_em.asc,colecao.asc,id.asc&limit=1000&offset=' + offset);
      if (!rows || !rows.length) break;
      const locais = localRecords();
      rows.forEach(row => {
        const k = row.colecao + '/' + row.id;
        const loc = locais[k];
        if (!ultimo || row.atualizado_em > ultimo) ultimo = row.atualizado_em;
        if (row.excluido) {
          if (loc) { removeLocal(row.colecao, row.id); alterou = true; }
          delete sync.hashes[k];
          return;
        }
        const h = hash(JSON.stringify(row.dados));
        const localSujo = loc && sync.hashes[k] !== undefined && sync.hashes[k] !== hash(JSON.stringify(loc.dados));
        if (sync.hashes[k] === h && loc) return;
        if (localSujo && !tudo) return; // alteração local ainda não enviada
        applyLocal(row.colecao, row.id, row.dados);
        sync.hashes[k] = h;
        alterou = true;
      });
      if (rows.length < 1000) break;
      offset += 1000;
    }
    sync.ultimo = ultimo;
    saveSync();
    if (alterou) S.saveLocal();
    return alterou;
  }

  async function emParalelo(lista, n, fn) {
    let i = 0, erro = null;
    const trabalhador = async () => {
      while (i < lista.length && !erro) {
        const item = lista[i++];
        try { await fn(item); } catch (e) { erro = e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabalhador));
    if (erro) throw erro;
  }

  async function pushOnce() {
    const locais = localRecords();
    const envio = [], exclusoes = [], novos = {};
    Object.keys(locais).forEach(k => {
      const h = hash(JSON.stringify(locais[k].dados));
      if (sync.hashes[k] !== h) { envio.push({ colecao: locais[k].colecao, id: locais[k].id, dados: locais[k].dados, excluido: false }); novos[k] = h; }
    });
    Object.keys(sync.hashes).forEach(k => { if (!locais[k]) exclusoes.push(k); });
    // registros novos: inclusão em lote; existentes: atualização (as regras do banco são diferentes para cada caso)
    const novosReg = envio.filter(r => sync.hashes[r.colecao + '/' + r.id] === undefined);
    const existentes = envio.filter(r => sync.hashes[r.colecao + '/' + r.id] !== undefined);
    for (let i = 0; i < novosReg.length; i += 100) {
      const lote = novosReg.slice(i, i + 100);
      try {
        await Cloud.rest('POST', 'registros', lote, { Prefer: 'return=minimal' });
      } catch (err) {
        if (err.status !== 409) throw err;
        // algum já existia no banco: grava como atualização
        existentes.push.apply(existentes, lote);
        continue;
      }
      lote.forEach(r => { sync.hashes[r.colecao + '/' + r.id] = novos[r.colecao + '/' + r.id]; });
      saveSync();
    }
    await emParalelo(existentes, 6, async r => {
      const { data } = await Cloud.rest('PATCH', 'registros?colecao=eq.' + encodeURIComponent(r.colecao) + '&id=eq.' + encodeURIComponent(r.id) + '&select=id',
        { dados: r.dados, excluido: false }, { Prefer: 'return=representation' });
      if (!data || !data.length) { const e = new Error('Sem permissão para alterar ' + S.rotulo(r.colecao).toLowerCase() + '.'); e.status = 403; throw e; }
      sync.hashes[r.colecao + '/' + r.id] = novos[r.colecao + '/' + r.id];
    });
    saveSync();
    await emParalelo(exclusoes, 6, async k => {
      const [colecao, id] = k.split('/');
      const { data } = await Cloud.rest('PATCH', 'registros?colecao=eq.' + encodeURIComponent(colecao) + '&id=eq.' + encodeURIComponent(id) + '&select=id', { excluido: true }, { Prefer: 'return=representation' });
      if (!data || !data.length) { const e = new Error('Sem permissão para excluir ' + S.rotulo(colecao).toLowerCase() + '.'); e.status = 403; throw e; }
      delete sync.hashes[k];
    });
    saveSync();
    return envio.length + exclusoes.length;
  }

  Cloud.pendencias = function () {
    if (!sync) return 0;
    const locais = localRecords();
    let n = 0;
    Object.keys(locais).forEach(k => { if (sync.hashes[k] !== hash(JSON.stringify(locais[k].dados))) n++; });
    Object.keys(sync.hashes).forEach(k => { if (!locais[k]) n++; });
    return n;
  };

  async function sincronizar(opts) {
    if (!sessao || !sync) return;
    if (busy) { pendente = true; return busy; }
    let resolve;
    busy = new Promise(r => { resolve = r; });
    setStatus('sincronizando');
    let erro = null;
    try {
      const enviados = await pushOnce();
      const alterou = await pullOnce(false);
      setStatus('ok', enviados ? enviados + ' alteração(ões) gravada(s) no banco' : '');
      if (alterou && !(opts && opts.silencioso)) refreshScreen();
    } catch (err) {
      erro = err;
      if (err.status === 403 || err.code === '42501' || /Alçada|permissão|aprová-lo/i.test(err.message)) {
        // o banco recusou: descarta a alteração local e volta ao que está no banco
        root.UI.toast('O banco recusou a gravação: ' + err.message + ' A tela foi atualizada com os dados do banco.', 'bad');
        await Cloud.recarregarDoBanco().catch(() => {});
        setStatus('ok', 'Alteração recusada pelo banco');
      } else {
        setStatus(navigator.onLine === false ? 'erro' : 'erro', navigator.onLine === false ? 'Sem internet — as alterações serão gravadas quando a conexão voltar' : err.message);
      }
    } finally {
      const b = busy;
      busy = false;
      resolve();
      if (pendente) { pendente = false; setTimeout(() => sincronizar(), 200); }
      void b;
    }
    if (erro && opts && opts.lancarErro) throw erro;
  }

  function refreshScreen() {
    const emForm = /\/(nova|editar)/.test(location.hash) || document.querySelector('#modals .modal-bg');
    if (emForm) { root.App && root.App.refreshNav(); }
    else if (root.App) root.App.route();
  }

  Cloud.schedulePush = function () {
    if (!sessao || !sync) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sincronizar({ silencioso: true }), 600);
  };

  /* Grava agora e espera a confirmação do banco (usado em importações e cadastros) */
  Cloud.gravarAgora = async function () {
    if (!sessao || !sync) return 0;
    clearTimeout(pushTimer);
    while (busy) await busy;
    const antes = Cloud.pendencias();
    await sincronizar({ silencioso: true, lancarErro: true });
    if (Cloud.pendencias()) throw new Error(status.msg || 'Não foi possível gravar no banco.');
    return antes;
  };

  Cloud.sincronizarAgora = () => sincronizar();

  function iniciarLoop() {
    clearInterval(pullTimer);
    pullTimer = setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, PULL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sessao && sync) sincronizar(); });
  window.addEventListener('online', () => { if (sessao && sync) sincronizar(); });

  /* Baixa a base inteira do banco (fonte única). Guarda o que existia só neste
     computador para que um comprador/administrador possa enviá-lo ao banco. */
  Cloud.carregarTudo = async function () {
    const anterior = JSON.parse(JSON.stringify(S.db));
    const salvo = ls(syncKey());
    sync = { hashes: {}, ultimo: null };
    S.replaceAllLocal();
    await pullOnce(true);
    await Cloud.carregarAlcadas();
    // registros que estavam só neste navegador (ex.: planilha importada antes da conexão)
    const noBanco = localRecords();
    const soLocais = {};
    const jaSincronizados = (salvo && salvo.hashes) || {};
    S.COLLECTIONS.forEach(col => (anterior[col] || []).forEach(r => {
      const k = col + '/' + r.id;
      if (!noBanco[k] && !jaSincronizados[k]) (soLocais[col] = soLocais[col] || []).push(r);
    }));
    if (Object.keys(soLocais).length) await S.guardarLegado(soLocais);
    S.saveLocal();
    setStatus('ok', 'Dados carregados do banco');
    iniciarLoop();
  };

  Cloud.recarregarDoBanco = async function () {
    sync = { hashes: {}, ultimo: null };
    S.replaceAllLocal();
    await pullOnce(true);
    await Cloud.carregarAlcadas();
    S.saveLocal();
    if (root.App) root.App.route();
  };

  /* Envia ao banco registros guardados só neste computador */
  Cloud.enviarLegado = async function (porColecao) {
    Object.keys(porColecao).forEach(col => porColecao[col].forEach(r => {
      if (!S.find(col, r.id)) S.db[col].push(r);
    }));
    S.saveLocal();
    return Cloud.gravarAgora();
  };

  /* ---------- Alçadas, perfis e auditoria (tabelas próprias) ---------- */
  Cloud.carregarAlcadas = async function () {
    const { data } = await Cloud.rest('GET', 'alcadas?select=nivel,descricao,limite&order=nivel');
    S.db.alcadas = (data || []).map(a => ({ nivel: a.nivel, descricao: a.descricao || '', limite: a.limite === null ? null : Number(a.limite) }));
  };

  Cloud.salvarAlcadas = async function (lista) {
    await Cloud.rest('POST', 'alcadas?on_conflict=nivel', lista, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    const max = lista.reduce((m, a) => Math.max(m, a.nivel), 0);
    await Cloud.rest('DELETE', 'alcadas?nivel=gt.' + max, undefined, { Prefer: 'return=minimal' });
    await Cloud.carregarAlcadas();
  };

  Cloud.meuPerfil = async function () {
    const { data } = await Cloud.rest('GET', 'perfis?select=*&user_id=eq.' + sessao.user.id);
    return data && data[0] ? perfilDoBanco(data[0]) : null;
  };

  function perfilDoBanco(p) {
    return {
      id: p.user_id, email: p.email, nome: p.nome, categoria: p.categoria, centros: p.centros || [],
      solicitante_id: p.solicitante_id || '', comprador_id: p.comprador_id || '',
      ver_totalizadores: !!p.ver_totalizadores, ver_registros: !!p.ver_registros, pode_cadastros: !!p.pode_cadastros,
      ativo: p.ativo !== false, criado_em: p.criado_em
    };
  }
  function perfilParaBanco(p) {
    return {
      email: p.email, nome: p.nome, categoria: p.categoria, centros: p.centros || [],
      solicitante_id: p.solicitante_id || null, comprador_id: p.comprador_id || null,
      ver_totalizadores: !!p.ver_totalizadores, ver_registros: !!p.ver_registros, pode_cadastros: !!p.pode_cadastros, ativo: p.ativo !== false
    };
  }

  Cloud.listarPerfis = async function () {
    const { data } = await Cloud.rest('GET', 'perfis?select=*&order=nome');
    return (data || []).map(perfilDoBanco);
  };

  Cloud.salvarPerfil = async function (p, senha) {
    if (!p.id) {
      const r = await Cloud.api('usuarios', { acao: 'criar', email: p.email, senha: senha, perfil: perfilParaBanco(p) });
      return r.user_id;
    }
    await Cloud.rest('PATCH', 'perfis?user_id=eq.' + p.id, perfilParaBanco(p), { Prefer: 'return=minimal' });
    if (senha) await Cloud.api('usuarios', { acao: 'senha', user_id: p.id, senha: senha });
    return p.id;
  };

  Cloud.registrarAcesso = function (evento) {
    return Cloud.rest('POST', 'rpc/registrar_acesso', { evento: evento }).catch(() => {});
  };

  Cloud.listarAuditoria = async function (f) {
    let q = 'auditoria?select=*&order=quando.desc&limit=' + (f.limite || 500);
    if (f.de) q += '&quando=gte.' + encodeURIComponent(f.de + 'T00:00:00');
    if (f.ate) q += '&quando=lte.' + encodeURIComponent(f.ate + 'T23:59:59.999');
    if (f.usuario) q += '&email=eq.' + encodeURIComponent(f.usuario);
    if (f.colecao) q += '&colecao=eq.' + encodeURIComponent(f.colecao);
    const { data } = await Cloud.rest('GET', q);
    return (data || []).map(a => ({ quando: a.quando, email: a.email, nome: a.nome || a.email, acao: a.acao, colecao: a.colecao, registro_id: a.registro_id, resumo: a.resumo, detalhe: a.detalhe }));
  };

  /* Diagnóstico: quantidade de registros no banco por coleção */
  Cloud.contagens = async function () {
    const out = {};
    for (const col of S.COLLECTIONS) {
      const r = await Cloud.rest('GET', 'registros?select=id&excluido=eq.false&colecao=eq.' + col + '&limit=1', undefined, { Prefer: 'count=exact' });
      const cr = r.headers.get('content-range') || '';
      out[col] = Number(cr.split('/')[1]) || 0;
    }
    return out;
  };

  root.Cloud = Cloud;
})(window);
