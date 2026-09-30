/* Banco de dados na nuvem (Supabase / PostgreSQL).
   Cada registro (solicitação, cotação, pedido, cadastro…) é uma linha da tabela "registros".
   O navegador mantém uma cópia local para funcionar sem internet e sincroniza:
   envia o que mudou logo após salvar e busca as alterações dos outros usuários a cada 15 s. */
(function (root) {
  'use strict';
  const { U, S } = root;
  const KEY = 'brasmic-nuvem';
  const SYS = '_sistema';
  const PULL_MS = 15000;

  let cfg = null;          // { url, anonKey, email, refresh, access, expira, ultimo, hashes }
  let status = { estado: 'desligado', msg: '' };
  let pushTimer = null, pullTimer = null, busy = false, pendente = false;
  const listeners = [];

  const Cloud = {};

  function load() {
    try { cfg = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { cfg = null; }
  }
  function persist() {
    if (testando) return;
    try { if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg)); else localStorage.removeItem(KEY); } catch (e) { /* sem localStorage */ }
  }
  function setStatus(estado, msg) {
    status = { estado: estado, msg: msg || '', quando: new Date() };
    listeners.forEach(fn => { try { fn(status); } catch (e) { console.error(e); } });
  }

  Cloud.onStatus = fn => listeners.push(fn);
  Cloud.status = () => status;
  let testando = false;
  Cloud.configured = () => !testando && !!(cfg && cfg.url && cfg.refresh && cfg.conectado);
  Cloud.info = () => cfg ? { url: cfg.url, email: cfg.email, anonKey: cfg.anonKey } : null;

  /* hash curto (cyrb53) para detectar alterações sem guardar cópias inteiras */
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

  /* todos os registros locais como { chave: {colecao, id, dados} } */
  function localRecords() {
    const out = {};
    S.COLLECTIONS.forEach(col => S.all(col).forEach(r => { out[col + '/' + r.id] = { colecao: col, id: r.id, dados: r }; }));
    out[SYS + '/config'] = { colecao: SYS, id: 'config', dados: S.db.config };
    return out;
  }

  /* ---------- HTTP ---------- */
  function base() { return cfg.url.replace(/\/+$/, ''); }

  async function authRequest(grant, body) {
    const r = await fetch(base() + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST', headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error_description || j.msg || j.message || ('erro ' + r.status);
      throw new Error(/invalid login|invalid_grant|credentials/i.test(m) ? 'E-mail ou senha incorretos.' : m);
    }
    cfg.access = j.access_token;
    cfg.refresh = j.refresh_token;
    cfg.expira = Date.now() + ((j.expires_in || 3600) - 60) * 1000;
    persist();
  }

  async function token() {
    if (cfg.access && Date.now() < cfg.expira) return cfg.access;
    await authRequest('refresh_token', { refresh_token: cfg.refresh });
    return cfg.access;
  }

  async function api(method, path, body, extraHeaders) {
    for (let tent = 0; tent < 2; tent++) {
      const t = await token();
      const r = await fetch(base() + '/rest/v1/' + path, {
        method: method,
        headers: Object.assign({ apikey: cfg.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, extraHeaders || {}),
        body: body ? JSON.stringify(body) : undefined
      });
      if (r.status === 401 && tent === 0) { cfg.expira = 0; continue; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (/relation .*registros.* does not exist|Could not find the table/i.test(j.message || '')) throw new Error('A tabela "registros" não existe no banco. Rode o script supabase/schema.sql no SQL Editor do Supabase.');
        throw new Error(j.message || ('Falha na comunicação com o banco (erro ' + r.status + ')'));
      }
      return r.status === 204 ? null : r.json().catch(() => null);
    }
  }

  /* ---------- Sincronização ---------- */
  async function pullOnce(tudo) {
    const desde = tudo || !cfg.ultimo ? '1970-01-01T00:00:00Z' : new Date(new Date(cfg.ultimo).getTime() - 5000).toISOString();
    let alterou = false, ultimo = cfg.ultimo, offset = 0;
    for (;;) {
      const rows = await api('GET', 'registros?select=colecao,id,dados,excluido,atualizado_em&atualizado_em=gt.' + encodeURIComponent(desde) +
        '&order=atualizado_em.asc,colecao.asc,id.asc&limit=1000&offset=' + offset);
      if (!rows || !rows.length) break;
      const locais = localRecords();
      rows.forEach(row => {
        const k = row.colecao + '/' + row.id;
        const loc = locais[k];
        const localSujo = loc && cfg.hashes[k] !== hash(JSON.stringify(loc.dados));
        if (!ultimo || row.atualizado_em > ultimo) ultimo = row.atualizado_em;
        if (row.excluido) {
          if (loc) { removeLocal(row.colecao, row.id); alterou = true; }
          delete cfg.hashes[k];
          return;
        }
        const h = hash(JSON.stringify(row.dados));
        if (cfg.hashes[k] === h && loc && !localSujo) return;       // já temos esta versão
        if (localSujo && cfg.hashes[k] !== undefined && !tudo) return; // alteração local ainda não enviada vence
        applyLocal(row.colecao, row.id, row.dados);
        cfg.hashes[k] = h;
        alterou = true;
      });
      if (rows.length < 1000) break;
      offset += 1000;
    }
    cfg.ultimo = ultimo;
    persist();
    if (alterou) S.saveLocal();
    return alterou;
  }

  function applyLocal(col, id, dados) {
    if (col === SYS) {
      if (id === 'config' && dados) Object.assign(S.db.config, dados);
      return;
    }
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

  async function pushOnce() {
    const locais = localRecords();
    const envio = [];
    const novosHashes = {};
    Object.keys(locais).forEach(k => {
      const h = hash(JSON.stringify(locais[k].dados));
      if (cfg.hashes[k] !== h) { envio.push({ colecao: locais[k].colecao, id: locais[k].id, dados: locais[k].dados, excluido: false }); novosHashes[k] = h; }
    });
    Object.keys(cfg.hashes).forEach(k => {
      if (!locais[k]) { const [colecao, id] = k.split('/'); envio.push({ colecao: colecao, id: id, dados: null, excluido: true }); novosHashes[k] = null; }
    });
    if (!envio.length) return 0;
    for (let i = 0; i < envio.length; i += 100) {
      const lote = envio.slice(i, i + 100);
      await api('POST', 'registros?on_conflict=colecao,id', lote, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      lote.forEach(r => {
        const k = r.colecao + '/' + r.id;
        if (novosHashes[k] === null) delete cfg.hashes[k]; else cfg.hashes[k] = novosHashes[k];
      });
      persist();
    }
    return envio.length;
  }

  async function sync(opts) {
    if (!Cloud.configured()) return;
    if (busy) { pendente = true; return; }
    busy = true;
    setStatus('sincronizando');
    try {
      const enviados = await pushOnce();
      const alterou = await pullOnce(false);
      setStatus('ok', enviados ? enviados + ' alteração(ões) enviada(s)' : '');
      if (alterou && !(opts && opts.silencioso)) refreshScreen();
    } catch (err) {
      if (/incorretos|refresh token|Invalid Refresh/i.test(err.message)) {
        setStatus('login', 'Sessão expirada — entre novamente');
        cfg.refresh = ''; persist();
        pedirLogin();
      } else setStatus('erro', navigator.onLine === false ? 'Sem internet — os dados ficam salvos neste computador e serão enviados depois' : err.message);
    } finally {
      busy = false;
      if (pendente) { pendente = false; setTimeout(() => sync(), 200); }
    }
  }

  /* Só redesenha a tela se o usuário não estiver no meio de um formulário */
  function refreshScreen() {
    const emForm = /\/(nova|editar)/.test(location.hash) || document.querySelector('#modals .modal-bg');
    if (emForm) { root.App && root.App.refreshNav(); root.UI.toast('Outros usuários atualizaram dados — a tela será atualizada ao sair deste formulário'); }
    else if (root.App) root.App.route();
  }

  Cloud.schedulePush = function () {
    if (!Cloud.configured()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync({ silencioso: true }), 800);
  };

  Cloud.syncNow = () => sync();

  function startLoop() {
    clearInterval(pullTimer);
    pullTimer = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, PULL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Cloud.configured()) sync(); });
  window.addEventListener('online', () => { if (Cloud.configured()) sync(); });

  /* ---------- Conexão ---------- */

  /* Testa credenciais e retorna quantos registros já existem no banco */
  Cloud.testar = async function (url, anonKey, email, senha) {
    const antigo = cfg;
    cfg = { url: url.trim(), anonKey: anonKey.trim(), email: email.trim(), hashes: {}, ultimo: null };
    testando = true;
    try {
      await authRequest('password', { email: cfg.email, password: senha });
      const r = await api('GET', 'registros?select=id&excluido=eq.false&colecao=neq.' + SYS + '&limit=1');
      const temDados = !!(r && r.length);
      const novo = cfg;
      cfg = antigo;
      return { temDados: temDados, sessao: novo };
    } catch (err) {
      cfg = antigo;
      throw err;
    } finally {
      testando = false;
    }
  };

  /* modo: 'enviar' (sobe os dados deste computador) | 'baixar' (substitui os locais pelos da nuvem) */
  Cloud.conectar = async function (sessao, modo) {
    cfg = sessao;
    cfg.hashes = {};
    cfg.ultimo = null;
    cfg.conectado = true;
    persist();
    if (modo === 'baixar') {
      const emp = S.db.config.empresa;
      S.replaceAllLocal();
      S.db.config.empresa = emp;
      await pullOnce(true);
    } else {
      await pushOnce();
      await pullOnce(false);
    }
    S.saveLocal();
    setStatus('ok', 'Conectado');
    startLoop();
  };

  Cloud.desconectar = function () {
    clearInterval(pullTimer);
    cfg = null;
    persist();
    setStatus('desligado');
  };

  Cloud.entrar = async function (senha) {
    await authRequest('password', { email: cfg.email, password: senha });
    setStatus('ok', 'Conectado');
    startLoop();
    await sync();
  };

  function pedirLogin() {
    const UI = root.UI;
    if (document.querySelector('#login-nuvem')) return;
    UI.modal({
      title: 'Entrar no banco de dados da empresa', size: 'narrow', sticky: true,
      body: '<p class="small muted" style="margin:0" id="login-nuvem">Informe a senha de <b>' + U.esc(cfg && cfg.email) + '</b> para sincronizar com os outros usuários. Enquanto isso, o que você fizer fica salvo neste computador.</p>' +
        '<div class="f"><label for="ln-pass">Senha</label><input type="password" id="ln-pass" autocomplete="current-password"></div>',
      buttons: [{ label: 'Trabalhar sem sincronizar' }, { label: 'Entrar', cls: 'pri', action: async m => {
        try { await Cloud.entrar(UI.$('#ln-pass', m.el).value); UI.toast('Sincronizado com a nuvem', 'ok'); }
        catch (err) { UI.toast(err.message, 'bad'); return false; }
      } }]
    });
  }

  Cloud.iniciar = async function () {
    load();
    if (!cfg || !cfg.url || !cfg.conectado) { setStatus('desligado'); return; }
    if (!cfg.refresh) { setStatus('login'); pedirLogin(); return; }
    startLoop();
    await sync();
  };

  load();
  root.Cloud = Cloud;
})(window);
