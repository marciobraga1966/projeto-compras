/* Reconhecimento das colunas de planilhas exportadas de ERPs (fornecedores, produtos, equipamentos).
   Usa sinônimos dos cabeçalhos e confere o conteúdo (ex.: coluna com e-mails vai para o campo e-mail,
   nunca para "contato"). Funções puras, testadas em tests/. */
(function (root) {
  'use strict';
  const U = root.U || (typeof require !== 'undefined' ? require('./util.js') : null);
  const IM = {};

  IM.SINONIMOS = {
    fornecedores: {
      codigo: ['codigo', 'cod', 'cod fornecedor', 'codigo do fornecedor', 'codigo fornecedor', 'id'],
      razao: ['razao social', 'razao', 'nome empresarial', 'fornecedor', 'nome do fornecedor', 'empresa', 'nome'],
      fantasia: ['nome fantasia', 'fantasia', 'apelido'],
      cnpj: ['cnpj', 'cpf', 'cnpj cpf', 'cpf cnpj', 'cnpj/cpf', 'cpf/cnpj', 'documento', 'inscricao federal'],
      contato: ['contato', 'nome do contato', 'nome contato', 'responsavel', 'representante', 'vendedor', 'pessoa de contato', 'atendente'],
      email: ['email', 'e mail', 'correio eletronico', 'email do contato', 'e mail do contato', 'email contato'],
      telefone: ['telefone', 'fone', 'tel', 'telefone comercial', 'fone comercial', 'telefone 1', 'fone 1'],
      whatsapp: ['whatsapp', 'whats', 'celular', 'cel', 'telefone celular'],
      cidade: ['cidade', 'municipio'],
      uf: ['uf', 'estado'],
      categorias: ['categorias', 'categoria', 'ramo', 'atividade', 'segmento', 'grupo', 'ramo de atividade'],
      obs: ['observacoes', 'observacao', 'obs']
    },
    produtos: {
      codigo: ['codigo', 'cod', 'referencia', 'ref', 'codigo do produto', 'cod produto', 'sku', 'codigo interno'],
      descricao: ['descricao', 'produto', 'descricao do produto', 'nome do produto', 'material', 'item', 'nome'],
      unidade: ['unidade', 'un', 'und', 'unid', 'um', 'unidade de medida', 'u m'],
      categoria: ['categoria', 'grupo', 'familia', 'classe', 'subgrupo', 'linha', 'grupo de produto'],
      marcas: ['marca', 'marcas', 'fabricante'],
      ncm: ['ncm', 'classificacao fiscal'],
      estoqueMin: ['estoque minimo', 'minimo', 'est min', 'estoque min'],
      estoqueMax: ['estoque maximo', 'maximo', 'est max', 'estoque max'],
      obs: ['observacoes', 'observacao', 'obs', 'especificacao', 'especificacao tecnica']
    },
    equipamentos: {
      codigo: ['codigo', 'cod', 'tag', 'frota', 'prefixo', 'numero', 'patrimonio'],
      descricao: ['descricao', 'equipamento', 'nome', 'nome do equipamento'],
      tipo: ['tipo', 'categoria', 'classe', 'grupo'],
      fabricante: ['fabricante', 'marca'],
      modelo: ['modelo'],
      serie: ['serie', 'numero de serie', 'chassi', 'placa'],
      centroCusto: ['centro de custo', 'cc', 'centro custo', 'setor'],
      obs: ['observacoes', 'observacao', 'obs']
    }
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const limpar = h => U.norm(String(h || '').replace(/[_\-()/.:]+/g, ' '));

  function pontuar(campo, h, sins) {
    if (!h) return 0;
    let melhor = 0;
    sins.forEach(s => {
      if (h === s) melhor = Math.max(melhor, 100);
      else if ((' ' + h + ' ').indexOf(' ' + s + ' ') > -1) melhor = Math.max(melhor, 50 + s.length);
    });
    // cabeçalho que fala de e-mail é do campo e-mail, nunca de "contato"
    if (/\bmail\b|\bemail\b/.test(h)) { if (campo === 'email') melhor = Math.max(melhor, 95); else melhor = 0; }
    if (campo === 'whatsapp' && /whats/.test(h)) melhor = Math.max(melhor, 96);
    if (campo === 'fantasia' && /fantasia/.test(h)) melhor = Math.max(melhor, 97);
    if (campo === 'razao' && /razao/.test(h)) melhor = Math.max(melhor, 97);
    return melhor;
  }

  /* Conteúdo de uma coluna: fração de células com e-mail, CNPJ/CPF ou telefone */
  IM.perfilColuna = function (rows, ci) {
    const vals = rows.map(r => String(r[ci] === undefined || r[ci] === null ? '' : r[ci]).trim()).filter(Boolean).slice(0, 50);
    if (!vals.length) return { vazia: true };
    const f = re => vals.filter(v => re(v)).length / vals.length;
    return {
      vazia: false,
      email: f(v => EMAIL_RE.test(v)),
      doc: f(v => { const d = U.onlyDigits(v); return d.length === 14 || d.length === 11; }),
      fone: f(v => { const d = U.onlyDigits(v); return d.length >= 8 && d.length <= 13 && !/[a-z]/i.test(v); })
    };
  };

  /* Retorna { campo: índiceDaColuna } */
  IM.mapear = function (tipo, cabecalho, linhas) {
    const sins = IM.SINONIMOS[tipo];
    const hs = cabecalho.map(limpar);
    const pares = [];
    Object.keys(sins).forEach(campo => hs.forEach((h, ci) => {
      const p = pontuar(campo, h, sins[campo]);
      if (p > 0) pares.push({ campo: campo, ci: ci, p: p });
    }));
    pares.sort((a, b) => b.p - a.p);
    const mapa = {}, usadas = new Set();
    pares.forEach(x => { if (!(x.campo in mapa) && !usadas.has(x.ci)) { mapa[x.campo] = x.ci; usadas.add(x.ci); } });
    // conferência pelo conteúdo
    if (tipo === 'fornecedores' && linhas && linhas.length) {
      const perfil = ci => IM.perfilColuna(linhas, ci);
      // coluna mapeada como contato (ou outro campo de texto) cheia de e-mails → é o e-mail
      ['contato', 'razao', 'fantasia', 'obs'].forEach(c => {
        if (c in mapa && perfil(mapa[c]).email >= 0.6) {
          if (!('email' in mapa) || perfil(mapa.email).vazia) mapa.email = mapa[c];
          delete mapa[c];
        }
      });
      // e-mail mapeado numa coluna sem e-mails: procura a coluna que tem e-mails
      if (!('email' in mapa) || !(perfil(mapa.email).email >= 0.3)) {
        const livre = cabecalho.map((_, ci) => ci).find(ci => !Object.values(mapa).includes(ci) && perfil(ci).email >= 0.6);
        if (livre !== undefined) mapa.email = livre;
      }
      if (!('cnpj' in mapa)) {
        const ci = cabecalho.map((_, i) => i).find(i => !Object.values(mapa).includes(i) && perfil(i).doc >= 0.8);
        if (ci !== undefined) mapa.cnpj = ci;
      }
    }
    return mapa;
  };

  /* Corrige cadastros antigos em que o e-mail foi gravado no campo contato */
  IM.contatoTrocado = f => !!(f && f.contato && EMAIL_RE.test(String(f.contato).trim()) && (!f.email || String(f.email).trim().toLowerCase() === String(f.contato).trim().toLowerCase()));
  IM.corrigirContato = function (f) {
    if (!IM.contatoTrocado(f)) return false;
    f.email = String(f.contato).trim().toLowerCase();
    f.contato = '';
    return true;
  };

  root.IM = IM;
  if (typeof module !== 'undefined' && module.exports) module.exports = IM;
})(typeof window !== 'undefined' ? window : globalThis);
