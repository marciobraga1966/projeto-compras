/* Utilitários gerais — funções puras (funcionam no navegador e no Node para testes) */
(function (root) {
  'use strict';

  const U = {};

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const brl = typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;
  U.money = function (v) {
    const n = Number(v) || 0;
    return brl ? brl.format(n) : 'R$ ' + n.toFixed(2);
  };

  U.num = function (v, dec) {
    const n = Number(v) || 0;
    const d = dec === undefined ? (Number.isInteger(n) ? 0 : 2) : dec;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) });
  };

  U.pct = function (v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  };

  /* Converte "1.234,56", "1234.56", "R$ 12,5", "1,234.56" em número */
  U.parseNum = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined) return 0;
    let s = String(v).trim().replace(/r\$\s*/i, '').replace(/\s/g, '');
    if (!s) return 0;
    const neg = /^-/.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > -1) {
      const parts = s.split('.');
      // "1.234" (milhar) vs "12.5" (decimal)
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')) {
        s = s.replace(/\./g, '');
      }
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : (neg ? -n : n);
  };

  U.round = function (v, d) {
    const f = Math.pow(10, d === undefined ? 2 : d);
    return Math.round((Number(v) || 0) * f) / f;
  };

  U.today = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  U.addDays = function (iso, days) {
    const d = iso ? new Date(iso + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  U.date = function (iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10).split('-');
    if (s.length !== 3) return iso;
    return s[2] + '/' + s[1] + '/' + s[0];
  };

  U.dateTime = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  U.nowIso = function () { return new Date().toISOString(); };

  /* Normaliza texto para comparação: minúsculas, sem acento, sem pontuação */
  U.norm = function (s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/(\d)\s*x\s*(?=\d)/g, '$1 x ')
      .replace(/(\d)([a-z]{2,})/g, '$1 $2')
      .replace(/[^a-z0-9/.,x]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const STOP = new Set(['x', 'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em', 'a', 'o', 'e', 'p', 'c', 'un', 'und', 'pc', 'pca', 'unid', 'unidade', 'unidades']);
  U.tokens = function (s) {
    return U.norm(s).split(' ').map(t => t.replace(/[.,]+$/, '')).filter(t => t && !STOP.has(t));
  };

  /* Similaridade 0..1 entre duas descrições (Dice sobre tokens + prefixos) */
  U.similarity = function (a, b) {
    const ta = U.tokens(a), tb = U.tokens(b);
    if (!ta.length || !tb.length) return 0;
    let hits = 0;
    const used = new Set();
    ta.forEach(x => {
      for (let i = 0; i < tb.length; i++) {
        if (used.has(i)) continue;
        const y = tb[i];
        if (x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))) {
          hits++; used.add(i); break;
        }
      }
    });
    return (2 * hits) / (ta.length + tb.length);
  };

  /* Fração dos termos de "ref" presentes em "text" (0..1) */
  U.coverage = function (text, ref) {
    const tt = U.tokens(text), tr = U.tokens(ref);
    if (!tt.length || !tr.length) return 0;
    let hits = 0;
    tr.forEach(y => {
      if (tt.some(x => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))) hits++;
    });
    return hits / tr.length;
  };

  U.bestMatch = function (text, list, getText, min) {
    let best = null, score = 0;
    (list || []).forEach(item => {
      const sc = U.similarity(text, getText(item));
      if (sc > score) { score = sc; best = item; }
    });
    return score >= (min === undefined ? 0.5 : min) ? { item: best, score: score } : null;
  };

  U.onlyDigits = function (s) { return String(s || '').replace(/\D/g, ''); };

  U.fmtCnpj = function (s) {
    const d = U.onlyDigits(s);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s || '';
  };

  U.validCnpj = function (s) {
    const c = U.onlyDigits(s);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = (len) => {
      let sum = 0, pos = len - 7;
      for (let i = len; i >= 1; i--) {
        sum += Number(c.charAt(len - i)) * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(c.charAt(12)) && calc(13) === Number(c.charAt(13));
  };

  U.pad = function (n, len) { return String(n).padStart(len || 4, '0'); };

  U.sum = function (arr, fn) { return (arr || []).reduce((a, x) => a + (Number(fn ? fn(x) : x) || 0), 0); };

  U.groupBy = function (arr, fn) {
    const m = {};
    (arr || []).forEach(x => { const k = fn(x); (m[k] = m[k] || []).push(x); });
    return m;
  };

  U.debounce = function (fn, ms) {
    let t;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  };

  /* CSV simples (separador ; ou ,) */
  U.parseCsv = function (text) {
    const firstLine = text.split(/\r?\n/)[0] || '';
    const sep = (firstLine.split(';').length >= firstLine.split(',').length) ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };

  U.toCsv = function (rows) {
    return rows.map(r => r.map(c => {
      const s = c === null || c === undefined ? '' : String(c);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  };

  root.U = U;
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
