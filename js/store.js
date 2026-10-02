/* Armazenamento: estado em memória + cópia no IndexedDB do navegador.
   Com o Supabase configurado, esta cópia é só um cache da base central (ver js/cloud.js).
   Sem Supabase (modo local/demonstração), é a própria base e a auditoria é feita aqui. */
(function (root) {
  'use strict';
  const U = root.U;

  const DB_NAME = 'brasmic-compras';
  const STORE = 'kv';
  const KEY = 'db';
  const KEY_LEGADO = 'legado';

  // coleções compartilhadas (gravadas na tabela "registros" do banco)
  const COLLECTIONS = ['solicitantes', 'compradores', 'centrosCusto', 'fornecedores', 'produtos', 'equipamentos', 'categoriasDespesa',
    'solicitacoes', 'cotacoes', 'pedidos', 'movimentos', 'entregas'];

  const ROTULO = {
    solicitantes: 'Solicitante', compradores: 'Comprador', centrosCusto: 'Centro de custo', fornecedores: 'Fornecedor',
    produtos: 'Produto', solicitacoes: 'Solicitação', cotacoes: 'Cotação', pedidos: 'Pedido', movimentos: 'Movimento de estoque',
    equipamentos: 'Equipamento', categoriasDespesa: 'Categoria de despesa', entregas: 'Entrega',
    _sistema: 'Configurações', usuarios: 'Usuário', alcadas: 'Alçadas'
  };

  function emptyDb() {
    const db = {
      versao: 2,
      config: {
        empresa: { nome: 'Brasmic Mineração Areia & Brita', cnpj: '', endereco: '', cidade: '', telefone: '', email: '' },
        prazoRespostaDias: 3,
        validadePadraoDias: 15,
        localEntrega: 'Almoxarifado central',
        considerarFreteNoMapa: true,
        exemplo: false
      },
      seq: {},
      log: [],
      // somente no modo local (no Supabase ficam nas tabelas perfis, alcadas e auditoria)
      usuarios: [],
      alcadas: [],
      auditoria: []
    };
    COLLECTIONS.forEach(c => { db[c] = []; });
    return db;
  }

  let db = emptyDb();
  let idb = null;
  const listeners = [];

  function openIdb() {
    return new Promise(resolve => {
      try {
        if (!root.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  function idbGet(key) {
    return new Promise(resolve => {
      if (!idb) return resolve(null);
      try {
        const r = idb.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  function idbPut(key, value) {
    return new Promise(resolve => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction(STORE, 'readwrite');
        if (value === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function migrate(d) {
    const out = Object.assign(emptyDb(), d || {});
    out.config = Object.assign(emptyDb().config, (d && d.config) || {});
    out.config.empresa = Object.assign(emptyDb().config.empresa, (d && d.config && d.config.empresa) || {});
    COLLECTIONS.concat(['usuarios', 'alcadas', 'auditoria', 'log']).forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
    out.seq = out.seq || {};
    // versão 1: destino era só da solicitação → passa para cada item
    out.solicitacoes.forEach(s => (s.itens || []).forEach(it => { if (!it.destino) it.destino = s.destino === 'estoque' ? 'estoque' : 'aplicacao'; }));
    return out;
  }

  const S = {};

  S.init = async function () {
    idb = await openIdb();
    let saved = await idbGet(KEY);
    if (!saved) {
      try { const l = localStorage.getItem(DB_NAME); if (l) saved = JSON.parse(l); } catch (e) { /* sem localStorage */ }
    }
    db = migrate(saved);
    auditBase = snapshot();
    return !!saved;
  };

  /* ---------- Auditoria local (no Supabase quem registra é o próprio banco) ---------- */
  let auditBase = {};
  function rotuloRegistro(r) {
    return r ? (r.numero || r.razao || r.descricao || r.nome || r.codigo || r.id || '') : '';
  }
  function snapshot() {
    const m = {};
    COLLECTIONS.forEach(col => (db[col] || []).forEach(r => { m[col + '/' + r.id] = JSON.stringify(r); }));
    m['_sistema/config'] = JSON.stringify(db.config);
    return m;
  }
  function auditar() {
    if (root.Cloud && root.Cloud.ativo()) return;
    const atual = snapshot();
    const u = root.Auth && root.Auth.user;
    const quem = { user_id: u ? u.id : null, email: u ? u.email : 'sistema', nome: u ? u.nome : 'Sistema' };
    const add = (acao, k, antes, depois) => {
      const [colecao, id] = k.split('/');
      const a = antes ? JSON.parse(antes) : null, d = depois ? JSON.parse(depois) : null;
      let detalhe = null;
      if (a && d) {
        detalhe = {};
        Object.keys(Object.assign({}, a, d)).forEach(c => {
          if (c === 'alteradoEm' || c === 'historico') return;
          if (JSON.stringify(a[c]) !== JSON.stringify(d[c])) detalhe[c] = { de: a[c] === undefined ? null : a[c], para: d[c] === undefined ? null : d[c] };
        });
        if (!Object.keys(detalhe).length) return;
      }
      db.auditoria.unshift(Object.assign({ quando: U.nowIso(), acao: acao, colecao: colecao, registro_id: id, resumo: (ROTULO[colecao] || colecao) + ' ' + rotuloRegistro(d || a), detalhe: detalhe }, quem));
    };
    Object.keys(atual).forEach(k => {
      if (!(k in auditBase)) add('criou', k, null, atual[k]);
      else if (auditBase[k] !== atual[k]) add('alterou', k, auditBase[k], atual[k]);
    });
    Object.keys(auditBase).forEach(k => { if (!(k in atual)) add('excluiu', k, auditBase[k], null); });
    if (db.auditoria.length > 5000) db.auditoria.length = 5000;
    auditBase = atual;
  }

  /* Registro manual na auditoria local (acessos, usuários, alçadas) */
  S.auditarEvento = function (acao, colecao, registroId, resumo, detalhe) {
    if (root.Cloud && root.Cloud.ativo()) return;
    const u = root.Auth && root.Auth.user;
    db.auditoria.unshift({ quando: U.nowIso(), user_id: u ? u.id : null, email: u ? u.email : 'sistema', nome: u ? u.nome : 'Sistema', acao: acao, colecao: colecao, registro_id: registroId || '', resumo: resumo, detalhe: detalhe || null });
    persistir();
  };

  let saveTimer = null;
  function persistir() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const ok = await idbPut(KEY, db);
      if (!ok) { try { localStorage.setItem(DB_NAME, JSON.stringify(db)); } catch (e) { /* armazenamento indisponível: segue em memória */ } }
    }, 150);
  }

  S.save = function () {
    auditar();
    persistir();
    if (root.Cloud) root.Cloud.schedulePush();
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  };

  /* Salva a cópia local sem auditar nem enviar ao banco (dados que vieram do banco) */
  S.saveLocal = function () {
    auditBase = snapshot();
    persistir();
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  };

  S.onChange = function (fn) { listeners.push(fn); };

  Object.defineProperty(S, 'db', { get: () => db });

  S.config = function () { return db.config; };
  S.all = function (col) { return db[col] || []; };
  S.find = function (col, id) { return (db[col] || []).find(x => x.id === id) || null; };
  S.rotulo = col => ROTULO[col] || col;

  const NUM_COL = { SC: 'solicitacoes', CT: 'cotacoes', PC: 'pedidos' };
  S.nextNumber = function (prefix) {
    const year = new Date().getFullYear();
    const k = prefix + '-' + year;
    // considera números criados por outros usuários (base central)
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    const maxUsado = (db[NUM_COL[prefix]] || []).reduce((m, x) => { const r = re.exec(x.numero || ''); return r ? Math.max(m, Number(r[1])) : m; }, 0);
    db.seq[k] = Math.max(db.seq[k] || 0, maxUsado) + 1;
    return prefix + '-' + year + '-' + U.pad(db.seq[k], 4);
  };

  S.nextCode = function (prefix, col) {
    const k = 'cod-' + prefix;
    let n = db.seq[k] || 0;
    const existing = new Set((db[col] || []).map(x => x.codigo));
    do { n++; } while (existing.has(prefix + '-' + U.pad(n, 3)));
    db.seq[k] = n;
    return prefix + '-' + U.pad(n, 3);
  };

  S.upsert = function (col, obj, silent) {
    const list = db[col];
    if (!obj.id) {
      obj.id = U.uid();
      obj.criadoEm = obj.criadoEm || U.nowIso();
      const u = root.Auth && root.Auth.user;
      if (u && !obj.criadoPor) { obj.criadoPor = u.id; obj.criadoPorNome = u.nome; }
      list.push(obj);
    } else {
      const i = list.findIndex(x => x.id === obj.id);
      obj.alteradoEm = U.nowIso();
      if (i > -1) list[i] = obj; else list.push(obj);
    }
    if (!silent) S.save();
    return obj;
  };

  S.remove = function (col, id) {
    const list = db[col];
    const i = list.findIndex(x => x.id === id);
    if (i > -1) list.splice(i, 1);
    S.save();
  };

  S.log = function (texto) {
    db.log.unshift({ data: U.nowIso(), texto: texto });
    if (db.log.length > 300) db.log.length = 300;
  };

  S.replaceAll = function (data) {
    db = migrate(data);
    S.save();
  };

  /* Zera a cópia local sem gerar exclusões no banco (antes de baixar a base central) */
  S.replaceAllLocal = function () {
    const usuarios = db.usuarios, alcadas = db.alcadas, auditoria = db.auditoria;
    db = emptyDb();
    if (!(root.Cloud && root.Cloud.ativo())) { db.usuarios = usuarios; db.alcadas = alcadas; db.auditoria = auditoria; }
    auditBase = snapshot();
  };

  S.reset = function () {
    db = emptyDb();
    S.save();
  };

  S.exportJson = function () {
    return JSON.stringify(db, null, 1);
  };

  /* Dados que ficaram só neste computador antes da conexão ao banco central */
  S.guardarLegado = async function (porColecao) {
    const atual = (await idbGet(KEY_LEGADO)) || {};
    Object.keys(porColecao).forEach(col => {
      const ids = new Set((atual[col] || []).map(r => r.id));
      atual[col] = (atual[col] || []).concat(porColecao[col].filter(r => !ids.has(r.id)));
    });
    await idbPut(KEY_LEGADO, atual);
  };
  S.legado = async function () { return (await idbGet(KEY_LEGADO)) || null; };
  S.limparLegado = function (colecoes) {
    return S.legado().then(l => {
      if (!l) return;
      (colecoes || Object.keys(l)).forEach(c => { delete l[c]; });
      return idbPut(KEY_LEGADO, Object.keys(l).length ? l : null);
    });
  };

  S.COLLECTIONS = COLLECTIONS;

  root.S = S;
})(window);
