/* Armazenamento: estado em memória + persistência no IndexedDB do navegador
   (com cópia de segurança em localStorage quando possível). */
(function (root) {
  'use strict';
  const U = root.U;

  const DB_NAME = 'brasmic-compras';
  const STORE = 'kv';
  const KEY = 'db';

  const COLLECTIONS = ['solicitantes', 'compradores', 'centrosCusto', 'fornecedores', 'produtos',
    'solicitacoes', 'cotacoes', 'pedidos', 'movimentos'];

  function emptyDb() {
    const db = {
      versao: 1,
      config: {
        empresa: {
          nome: 'Brasmic Mineração Areia & Brita',
          cnpj: '',
          endereco: '',
          cidade: '',
          telefone: '',
          email: ''
        },
        prazoRespostaDias: 3,
        validadePadraoDias: 15,
        localEntrega: 'Almoxarifado central',
        considerarFreteNoMapa: true,
        exemplo: false
      },
      seq: {},
      log: []
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

  function idbGet() {
    return new Promise(resolve => {
      if (!idb) return resolve(null);
      try {
        const tx = idb.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(KEY);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  function idbPut(value) {
    return new Promise(resolve => {
      if (!idb) return resolve(false);
      try {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function migrate(d) {
    const base = emptyDb();
    const out = Object.assign(base, d || {});
    out.config = Object.assign(emptyDb().config, (d && d.config) || {});
    out.config.empresa = Object.assign(emptyDb().config.empresa, (d && d.config && d.config.empresa) || {});
    COLLECTIONS.forEach(c => { if (!Array.isArray(out[c])) out[c] = []; });
    out.seq = out.seq || {};
    out.log = out.log || [];
    return out;
  }

  const S = {};

  S.init = async function () {
    idb = await openIdb();
    let saved = await idbGet();
    if (!saved) {
      try {
        const ls = localStorage.getItem(DB_NAME);
        if (ls) saved = JSON.parse(ls);
      } catch (e) { /* sem localStorage */ }
    }
    db = migrate(saved);
    return !!saved;
  };

  let saveTimer = null;
  S.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const ok = await idbPut(db);
      if (!ok) {
        try { localStorage.setItem(DB_NAME, JSON.stringify(db)); } catch (e) { console.warn('Falha ao salvar', e); }
      }
    }, 150);
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  };

  S.onChange = function (fn) { listeners.push(fn); };

  Object.defineProperty(S, 'db', { get: () => db });

  S.config = function () { return db.config; };

  S.all = function (col) { return db[col] || []; };

  S.find = function (col, id) { return (db[col] || []).find(x => x.id === id) || null; };

  S.nextNumber = function (prefix) {
    const year = new Date().getFullYear();
    const k = prefix + '-' + year;
    db.seq[k] = (db.seq[k] || 0) + 1;
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

  S.reset = function () {
    db = emptyDb();
    S.save();
  };

  S.exportJson = function () {
    return JSON.stringify(db, null, 1);
  };

  S.COLLECTIONS = COLLECTIONS;

  root.S = S;
})(window);
