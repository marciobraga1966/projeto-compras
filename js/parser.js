/* Interpretação de textos livres: ditado por voz, OCR de requisições digitalizadas
   e propostas de fornecedores (PDF, imagem, e-mail, WhatsApp). Funções puras. */
(function (root) {
  'use strict';
  const U = root.U || (typeof require !== 'undefined' ? require('./util.js') : null);

  const P = {};

  /* Unidades de medida: sinônimos → código */
  const UNIT_SYNONYMS = {
    UN: ['un', 'und', 'unid', 'unidade', 'unidades', 'u'],
    PC: ['pc', 'pç', 'pca', 'pça', 'peca', 'peça', 'pecas', 'peças', 'pcs'],
    KG: ['kg', 'kgs', 'quilo', 'quilos', 'kilo', 'kilos', 'quilograma', 'quilogramas'],
    G: ['g', 'grama', 'gramas'],
    T: ['t', 'ton', 'tonelada', 'toneladas'],
    L: ['l', 'lt', 'lts', 'litro', 'litros'],
    ML: ['ml', 'mililitro', 'mililitros'],
    M: ['m', 'mt', 'mts', 'metro', 'metros'],
    M2: ['m2', 'm²', 'metro quadrado', 'metros quadrados'],
    M3: ['m3', 'm³', 'metro cubico', 'metros cubicos', 'metro cúbico', 'metros cúbicos'],
    CX: ['cx', 'cxs', 'caixa', 'caixas'],
    PCT: ['pct', 'pcts', 'pacote', 'pacotes'],
    RL: ['rl', 'rolo', 'rolos'],
    GL: ['gl', 'galao', 'galão', 'galoes', 'galões'],
    SC: ['sc', 'saco', 'sacos'],
    PAR: ['par', 'pares', 'pr'],
    JG: ['jg', 'jogo', 'jogos'],
    CJ: ['cj', 'conj', 'conjunto', 'conjuntos'],
    LT: ['lata', 'latas'],
    BD: ['bd', 'balde', 'baldes'],
    TB: ['tb', 'tambor', 'tambores'],
    KIT: ['kit', 'kits'],
    BR: ['br', 'barra', 'barras'],
    FL: ['fl', 'folha', 'folhas'],
    TUBO: ['tubo', 'tubos'],
    FD: ['fd', 'fardo', 'fardos'],
    CT: ['ct', 'cento', 'centos'],
    MIL: ['milheiro', 'milheiros'],
    SV: ['sv', 'serviço', 'servico', 'serviços', 'servicos'],
    H: ['h', 'hr', 'hora', 'horas']
  };
  P.UNITS = Object.keys(UNIT_SYNONYMS);
  const UNIT_LOOKUP = {};
  const unitKey = w => U.norm(String(w).replace(/²/g, '2').replace(/³/g, '3'));
  Object.keys(UNIT_SYNONYMS).forEach(code => {
    UNIT_LOOKUP[code.toLowerCase()] = code;
    UNIT_SYNONYMS[code].forEach(s => {
      const k = unitKey(s);
      if (!(k in UNIT_LOOKUP)) UNIT_LOOKUP[k] = code;
    });
  });
  // Unidades de uma letra só geram falsos positivos no meio de descrições
  const AMBIGUOUS = new Set(['u', 'g', 't', 'l', 'm', 'h', 'pr']);
  const unitWords = Object.keys(UNIT_LOOKUP).filter(w => !AMBIGUOUS.has(w)).sort((a, b) => b.length - a.length);
  const UNIT_RE_SRC = '(' + unitWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|') + ')';

  P.unitCode = function (word) {
    if (!word) return '';
    return UNIT_LOOKUP[unitKey(word)] || '';
  };

  /* Números por extenso (pt-BR) → dígitos */
  const NUM_WORDS = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
    dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
    oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
    quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
    setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
    meia: 0.5, meio: 0.5, duzia: 12, mil: 1000
  };

  P.wordsToNumbers = function (text) {
    const parts = String(text).split(/(\s+)/);
    const out = [];
    let acc = null, total = 0, pendingE = false, pendingSpace = '';
    const flush = () => {
      if (acc !== null || total) out.push(String(U.round(total + (acc || 0), 4)));
      if (pendingE) out.push(' e');
      acc = null; total = 0; pendingE = false;
    };
    for (let i = 0; i < parts.length; i++) {
      const raw = parts[i];
      if (!raw) continue;
      if (/^\s+$/.test(raw)) {
        if (acc !== null || total) pendingSpace = raw; else out.push(raw);
        continue;
      }
      const trailing = (raw.match(/[,;:.]+$/) || [''])[0];
      const w = U.norm(raw.slice(0, raw.length - trailing.length));
      const inNum = acc !== null || total;
      if (w in NUM_WORDS) {
        const v = NUM_WORDS[w];
        pendingE = false;
        if (w === 'mil') { total = (total + (acc || 1)) * 1000; acc = null; }
        else if (w === 'duzia') { acc = (acc || 1) * 12; }
        else acc = (acc || 0) + v;
        if (trailing) { flush(); out.push(trailing); }
        continue;
      }
      if (w === 'e' && inNum && !pendingE && !trailing) { pendingE = true; continue; }
      if (inNum) { flush(); out.push(pendingSpace || ' '); pendingSpace = ''; }
      out.push(raw);
    }
    flush();
    return out.join('').replace(/[ \t]{2,}/g, ' ');
  };

  /* Extrai uma quantidade + unidade de um segmento */
  function extractQty(seg) {
    let s = seg;
    let m;
    // quantidade explícita: "quantidade 10", "qtd: 10", "qtde 10 un"
    m = s.match(new RegExp('\\b(?:qtd[ea]?|quant(?:idade)?)\\.?\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)\\s*' + UNIT_RE_SRC + '?\\b', 'i'));
    if (m) {
      return { qtd: U.parseNum(m[1]), unidade: P.unitCode(m[2]), rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim() };
    }
    // início: "10 unidades de parafuso", "10 un parafuso", "10 parafusos"
    m = s.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(?:' + UNIT_RE_SRC + '\\b\\.?)?\\s*(?:de|do|da|dos|das|x)?\\s+(.+)$', 'i'));
    if (m) return { qtd: U.parseNum(m[1]), unidade: P.unitCode(m[2]), rest: m[3].trim() };
    // unidade antes da quantidade no fim: "... UN 10" / "... PC: 5"
    m = s.match(new RegExp('^(.+?)\\s*[-–|;:]?\\s+' + UNIT_RE_SRC + '\\.?\\s*[:|-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*$', 'i'));
    if (m) return { qtd: U.parseNum(m[3]), unidade: P.unitCode(m[2]), rest: m[1].trim() };
    // fim: "parafuso sextavado - 10 un", "óleo 68 | 20 litros"
    m = s.match(new RegExp('^(.+?)\\s*[-–|;:x]?\\s+(\\d+(?:[.,]\\d+)?)\\s*' + UNIT_RE_SRC + '\\.?\\s*$', 'i'));
    if (m) return { qtd: U.parseNum(m[2]), unidade: P.unitCode(m[3]), rest: m[1].trim() };
    // fim, número após separador: "Luva de raspa | 20", "Correia 800mm | 50 m"
    m = s.match(/^(.+?)\s*[-–|;:]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zçç²³]{1,6})?\.?\s*$/);
    if (m && (!m[3] || P.unitCode(m[3]))) return { qtd: U.parseNum(m[2]), unidade: P.unitCode(m[3]), rest: m[1].trim() };
    return null;
  }

  function extractBrand(seg) {
    const m = seg.match(/\bmarcas?\s*[:\-]?\s*([^,;|]+?)(?=\s*(?:$|[,;|]|\bobs\b|\bpara\b|\bref\b))/i);
    if (!m) return { marca: '', rest: seg };
    return { marca: m[1].trim().replace(/\s+/g, ' '), rest: (seg.slice(0, m.index) + ' ' + seg.slice(m.index + m[0].length)).trim() };
  }

  function cleanDesc(s) {
    return String(s || '')
      .replace(/^[\s\-–|:;,.()]+|[\s\-–|:;,.(]+$/g, '')
      .replace(/\s+e$/i, '')
      .replace(/^(?:de|do|da|dos|das)\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* Divide um ditado em segmentos de itens */
  P.splitDictation = function (text) {
    let t = ' ' + P.wordsToNumbers(text) + ' ';
    t = t.replace(/\b(?:pr[oó]ximo\s+item|item\s+seguinte|pr[oó]ximo|novo\s+item|adicionar(?:\s+item)?)\b/gi, '\n');
    t = t.replace(/[;\n]+/g, '\n');
    // separa antes de cada "número + unidade" que não esteja no início
    const re = new RegExp('(^|[\\s,])(?:e\\s+|mais\\s+)?(?=\\d+(?:[.,]\\d+)?\\s*' + UNIT_RE_SRC + '\\b)', 'gi');
    t = t.replace(re, (m0, pre) => (pre === ',' ? '\n' : '\n'));
    return t.split('\n').map(s => s.replace(/^[\s,]+|[\s,]+$/g, '')).filter(s => /[a-zà-ú]{2,}/i.test(s));
  };

  /* Remove do ditado as falas de cabeçalho (solicitante, destino, prioridade...) */
  P.stripHeaderPhrases = function (text) {
    return String(text)
      .replace(/\b(?:solicitante|comprador|centro\s+de\s+custo|equipamento|m[aá]quina|necessidade|prioridade)\s*[:\-]?\s*[^,;\n]*/gi, ' ')
      .replace(/\baplica[cç][aã]o\s*(?:direta|[:\-][^,;\n]*)/gi, ' ')
      .replace(/\b(?:para|pro|destino)\s+(?:o\s+)?estoque\b|\burgente\b|\bemerg[eê]ncia\b|\balta\s+prioridade\b/gi, ' ');
  };

  /* Liga item a produto cadastrado: por código exato ou por similaridade */
  P.matchProduct = function (desc, produtos, codeHint) {
    if (!produtos || !produtos.length) return null;
    const n = U.norm(desc + ' ' + (codeHint || ''));
    const byCode = produtos.find(p => p.codigo && new RegExp('(^|\\s)' + U.norm(p.codigo).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(n));
    if (byCode) return { produto: byCode, score: 1 };
    const bm = U.bestMatch(desc, produtos, p => p.descricao, 0.55);
    return bm ? { produto: bm.item, score: bm.score } : null;
  };

  /* Converte texto livre (ditado ou OCR) em itens de solicitação
     opts.mode = 'voz' | 'ocr' ; opts.produtos = cadastro para vínculo */
  P.parseItems = function (text, opts) {
    opts = opts || {};
    const mode = opts.mode || 'voz';
    let segs;
    if (mode === 'voz') segs = P.splitDictation(P.stripHeaderPhrases(text));
    else segs = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    const items = [];
    segs.forEach(raw => {
      let seg = raw.replace(/\s+/g, ' ').trim();
      if (mode === 'ocr') {
        if (/descri[cç][aã]o|quantidade|qtd\.?\s*$|^item\s*$|solicitante|requisi[cç][aã]o|centro de custo|assinatura|aprovado|data\s*:/i.test(seg) && !/\d+\s*[a-z]{2,}\s+\w+/i.test(seg.replace(/^.*?:/, ''))) return;
        if (!/[a-zà-ú]{3,}/i.test(seg)) return;
        seg = seg.replace(/[|]/g, ' | ').replace(/\s+/g, ' ');
        // remove numeração do item: "01 -", "1.", "3)", "item 2:"
        seg = seg.replace(/^\s*(?:item\s*)?\d{1,3}\s*[-.)|:º°]\s+/i, '');
      }
      const b = extractBrand(seg);
      seg = b.rest;
      // código do produto no início: "COD 1234 -" ou "[1234]"
      let codigo = '';
      const mc = seg.match(/^\s*(?:c[oó]d(?:igo)?\.?\s*[:\-]?\s*|\[)([A-Z0-9\-.]{3,})\]?\s*[-|:]?\s+/i);
      if (mc && /\d/.test(mc[1])) { codigo = mc[1]; seg = seg.slice(mc[0].length); }
      const q = extractQty(seg);
      if (!q && mode === 'ocr' && !opts.acceptWithoutQty) return;
      const descricao = capitalize(cleanDesc(q ? q.rest : seg));
      if (!descricao || descricao.length < 3) return;
      const item = {
        descricao: descricao,
        qtd: q && q.qtd > 0 ? q.qtd : 1,
        unidade: (q && q.unidade) || '',
        marca: b.marca,
        codigo: codigo,
        produtoId: '',
        confianca: q ? 'alta' : 'baixa'
      };
      const pm = P.matchProduct(descricao, opts.produtos, codigo);
      if (pm) {
        item.produtoId = pm.produto.id;
        item.unidade = item.unidade || pm.produto.unidade || '';
        item.codigo = pm.produto.codigo || codigo;
      }
      if (!item.unidade) item.unidade = 'UN';
      items.push(item);
    });
    return items;
  };

  /* Dados de cabeçalho ditados ou lidos da requisição */
  P.parseHeader = function (text, cad) {
    cad = cad || {};
    const t = P.wordsToNumbers(String(text));
    const n = U.norm(t);
    const out = {};
    if (/aplica[cç][aã]o\s+direta|uso\s+imediato|consumo\s+direto/i.test(t)) out.destino = 'aplicacao';
    else if (/\b(?:para|pro|destino|repor|reposi[cç][aã]o\s+de)\s+(?:o\s+)?estoque\b|\bestoque\b/i.test(t)) out.destino = 'estoque';
    if (/\burgent[ea]\b|\bemerg[eê]ncia/i.test(t)) out.prioridade = 'urgente';
    else if (/\balta\s+prioridade\b/i.test(t)) out.prioridade = 'alta';
    const findIn = (list, field, key) => {
      if (!list) return;
      const re = new RegExp('\\b' + key + '\\s*[:\\-]?\\s*([^,;\\n]+)', 'i');
      const m = t.match(re);
      const probe = m ? m[1] : null;
      let best = null, score = 0;
      list.forEach(x => {
        const label = x[field] || '';
        const code = x.codigo ? U.norm(x.codigo) : null;
        if (code && new RegExp('(^|\\s)' + code + '(\\s|$)').test(n) && probe && U.norm(probe).indexOf(code) > -1) { best = x; score = 1; return; }
        if (probe) {
          const sc = U.similarity(probe, label);
          if (sc > score) { score = sc; best = x; }
        } else if (label && n.indexOf(U.norm(label)) > -1 && U.norm(label).length > 3) {
          if (0.9 > score) { score = 0.9; best = x; }
        }
      });
      return score >= 0.5 ? best : null;
    };
    const sol = findIn(cad.solicitantes, 'nome', 'solicitante');
    if (sol) out.solicitanteId = sol.id;
    const comp = findIn(cad.compradores, 'nome', 'comprador');
    if (comp) out.compradorId = comp.id;
    const cc = findIn(cad.centrosCusto, 'descricao', 'centro\\s+de\\s+custo');
    if (cc) out.centroCustoId = cc.id;
    const ap = t.match(/\b(?:aplica[cç][aã]o|equipamento|m[aá]quina)\s*[:\-]\s*([^,;\n]+)/i);
    if (ap) out.aplicacao = ap[1].trim();
    const dt = t.match(/\b(?:necessidade|entrega|prazo)\D{0,20}(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/i);
    if (dt) {
      let y = dt[3] ? Number(dt[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      out.necessidade = y + '-' + String(dt[2]).padStart(2, '0') + '-' + String(dt[1]).padStart(2, '0');
    }
    return out;
  };

  /* ---------- Propostas de fornecedores ---------- */

  const MONEY_RE = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?|(?:R\$\s*)\d+(?:[.,]\d{1,4})?|\d+,\d{2,4}\b|\d+\.\d{2}\b/g;

  P.moneyValues = function (line) {
    const out = [];
    let m;
    MONEY_RE.lastIndex = 0;
    while ((m = MONEY_RE.exec(line))) {
      const v = U.parseNum(m[0]);
      if (v > 0) out.push({ v: v, idx: m.index, raw: m[0] });
    }
    return out;
  };

  P.parseProposalHeader = function (text) {
    const t = String(text);
    const out = {};
    const cnpj = t.match(/\b\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}\b/);
    if (cnpj) out.cnpj = U.fmtCnpj(cnpj[0]);
    const email = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (email) out.email = email[0].toLowerCase();
    const fone = t.match(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/);
    if (fone) out.telefone = fone[0].trim();
    const prazo = t.match(/prazo\s*(?:de)?\s*entrega\s*[:\-]?\s*(?:em\s*)?(\d+)\s*(?:dias|d\b)/i) || t.match(/entrega\s*(?:em|:)\s*(\d+)\s*dias/i);
    if (prazo) out.prazoEntregaDias = Number(prazo[1]);
    else if (/pronta\s+entrega|imediat/i.test(t)) out.prazoEntregaDias = 0;
    const pag = t.match(/(?:cond(?:i[cç][aã]o|\.)?\s*(?:de\s*)?pag(?:amento|to)?\.?|forma\s+de\s+pagamento|pagamento)\s*[:\-]?\s*([^\n]+)/i);
    if (pag) out.condPagamento = pag[1].trim().replace(/\s{2,}/g, ' ').slice(0, 60);
    const frete = t.match(/frete\s*[:\-]?\s*([^\n]*)/i);
    if (frete) {
      const f = frete[1];
      if (/\bcif\b|gr[aá]tis|incluso|por\s+conta\s+do\s+fornecedor/i.test(f)) { out.freteTipo = 'CIF'; out.frete = 0; }
      else if (/\bfob\b/i.test(f)) out.freteTipo = 'FOB';
      const fv = P.moneyValues(f);
      if (fv.length) out.frete = fv[0].v;
      else {
        const plain = f.match(/(\d+(?:[.,]\d+)?)/);
        if (plain && !out.freteTipo) out.frete = U.parseNum(plain[1]);
      }
    }
    const val = t.match(/validade\s*(?:da\s*proposta)?\s*[:\-]?\s*(\d+)\s*dias/i);
    if (val) out.validadeDias = Number(val[1]);
    const desc = t.match(/desconto\s*(?:de)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i);
    if (desc) out.descontoPct = U.parseNum(desc[1]);
    const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const nameLine = lines.find(l => /\b(ltda|s\.?\/?a\.?|eireli|\bme\b|epp|com[eé]rcio|ind[uú]stria|distribuidora|comercial)\b/i.test(l) && l.length < 90);
    if (nameLine) out.fornecedorNome = nameLine.replace(/^(?:raz[aã]o\s+social|fornecedor|empresa)\s*[:\-]\s*/i, '').replace(/\s*cnpj.*$/i, '').trim();
    const cot = t.match(/\bCT-\d{4}-\d{3,5}\b/i);
    if (cot) out.cotacaoNumero = cot[0].toUpperCase();
    return out;
  };

  /* Lê preços de cada item da cotação a partir do texto da proposta.
     itens: [{id, descricao, qtd, codigo}] */
  P.parseProposalPrices = function (text, itens) {
    const lines = String(text).split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const result = {};
    lines.forEach((line, li) => {
      const money = P.moneyValues(line);
      if (!money.length) return;
      // parte textual antes do primeiro valor monetário
      const textPart = line.slice(0, money[0].idx);
      let best = null, bestScore = 0;
      itens.forEach((it, idx) => {
        const probe = textPart || line;
        let sc = Math.max(U.similarity(probe, it.descricao), 0.9 * U.coverage(probe, it.descricao));
        if (it.codigo && U.norm(line).indexOf(U.norm(it.codigo)) > -1) sc = Math.max(sc, 0.95);
        const idxM = line.match(/^\s*(?:item\s*)?(\d{1,3})\s*[-.)|:]\s/i);
        if (idxM && Number(idxM[1]) === idx + 1) sc += 0.15;
        if (sc > bestScore) { bestScore = sc; best = it; }
      });
      if (!best || bestScore < 0.4) return;
      const qtd = Number(best.qtd) || 1;
      const vals = money.map(m => m.v);
      let unit = null, total = null;
      for (let i = 0; i < vals.length && unit === null; i++) {
        for (let j = 0; j < vals.length; j++) {
          if (i === j) continue;
          if (Math.abs(vals[i] * qtd - vals[j]) <= Math.max(0.05, vals[j] * 0.01)) { unit = vals[i]; total = vals[j]; break; }
        }
      }
      if (unit === null) {
        const lbl = line.toLowerCase();
        if (vals.length === 1 && /total/.test(lbl) && !/unit/.test(lbl) && qtd > 1) unit = U.round(vals[0] / qtd, 4);
        else unit = vals[0];
      }
      const bm = line.match(/\bmarca\s*[:\-]?\s*([A-Za-z0-9][\w\-&]*(?:\s[A-Z][\w\-&]*)?)/i);
      const prev = result[best.id];
      if (!prev || bestScore > prev.score) {
        result[best.id] = { unit: unit, total: total, marca: bm ? bm[1] : '', score: U.round(bestScore, 2), linha: li + 1, texto: line };
      }
    });
    return result;
  };

  P.parseProposal = function (text, itens) {
    const h = P.parseProposalHeader(text);
    h.precos = P.parseProposalPrices(text, itens || []);
    return h;
  };

  root.P = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
