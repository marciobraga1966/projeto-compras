/* Regras de negócio: fluxo solicitação → cotação → mapa → pedido → recebimento/estoque */
(function (root) {
  'use strict';
  const U = root.U, S = root.S;
  const D = {};

  D.STATUS_SOL = {
    rascunho: { t: 'Rascunho', c: 'neutral' },
    aberta: { t: 'Aberta', c: 'info' },
    em_cotacao: { t: 'Em cotação', c: 'warn' },
    pedido: { t: 'Pedido emitido', c: 'accent' },
    atendida: { t: 'Atendida', c: 'ok' },
    cancelada: { t: 'Cancelada', c: 'bad' }
  };
  D.STATUS_COT = {
    aberta: { t: 'Aguardando propostas', c: 'info' },
    em_analise: { t: 'Em análise', c: 'warn' },
    finalizada: { t: 'Finalizada', c: 'ok' },
    cancelada: { t: 'Cancelada', c: 'bad' }
  };
  D.STATUS_PED = {
    emitido: { t: 'Emitido', c: 'info' },
    enviado: { t: 'Enviado ao fornecedor', c: 'warn' },
    recebido_parcial: { t: 'Recebido parcial', c: 'accent' },
    recebido: { t: 'Recebido', c: 'ok' },
    cancelado: { t: 'Cancelado', c: 'bad' }
  };
  D.PRIORIDADE = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  D.DESTINO = { aplicacao: 'Aplicação direta', estoque: 'Estoque' };
  D.ORIGEM = { digitada: 'Digitada', digitalizada: 'Digitalizada', voz: 'Por voz', reposicao: 'Reposição automática' };

  D.nome = function (col, id, field) {
    const x = S.find(col, id);
    if (!x) return '—';
    return x[field || 'nome'] || x.razao || x.descricao || '—';
  };
  D.fornecedorNome = id => { const f = S.find('fornecedores', id); return f ? (f.fantasia || f.razao) : '—'; };
  D.pessoa = (col, id) => { const x = S.find(col, id); return x ? (x.codigo ? x.codigo + ' · ' : '') + x.nome : '—'; };
  D.centro = id => { const x = S.find('centrosCusto', id); return x ? x.codigo + ' · ' + x.descricao : '—'; };

  D.solTotalEstimado = function (sol) {
    return U.sum(sol.itens, it => {
      const p = S.find('produtos', it.produtoId);
      return (Number(it.qtd) || 0) * (p ? D.ultimoPreco(p) : 0);
    });
  };

  D.ultimoPreco = function (prod) {
    const h = (prod.historicoPrecos || []);
    return h.length ? h[h.length - 1].preco : (Number(prod.precoRef) || 0);
  };

  D.melhorPrecoHistorico = function (prod) {
    const h = (prod.historicoPrecos || []);
    if (!h.length) return null;
    return h.reduce((a, b) => (b.preco < a.preco ? b : a));
  };

  /* ---------- Solicitações ---------- */

  D.novaSolicitacao = function () {
    return {
      id: '', numero: '', data: U.today(), status: 'aberta', solicitanteId: '', compradorId: '',
      centroCustoId: '', destino: 'aplicacao', aplicacao: '', prioridade: 'normal',
      necessidade: U.addDays(U.today(), 7), origemEntrada: 'digitada', obs: '', anexos: [], itens: [], historico: []
    };
  };

  D.salvarSolicitacao = function (sol) {
    const nova = !sol.id;
    if (!sol.numero) sol.numero = S.nextNumber('SC');
    sol.itens.forEach(it => { if (!it.id) it.id = U.uid(); });
    sol.historico = sol.historico || [];
    sol.historico.push({ data: U.nowIso(), evento: nova ? 'Solicitação criada (' + (D.ORIGEM[sol.origemEntrada] || 'digitada') + ')' : 'Solicitação alterada' });
    // produtos novos digitados na solicitação entram no cadastro
    sol.itens.forEach(it => D.vincularProduto(it, 'solicitação ' + sol.numero));
    S.upsert('solicitacoes', sol, true);
    S.log((nova ? 'Criada ' : 'Alterada ') + sol.numero);
    S.save();
    return sol;
  };

  /* Garante que o item aponte para um produto cadastrado (cria se não existir) */
  D.vincularProduto = function (it, origem) {
    if (it.produtoId && S.find('produtos', it.produtoId)) return S.find('produtos', it.produtoId);
    if (!it.descricao) return null;
    const prods = S.all('produtos');
    const exact = prods.find(p => U.norm(p.descricao) === U.norm(it.descricao));
    const match = exact || (U.bestMatch(it.descricao, prods, p => p.descricao, 0.8) || {}).item;
    if (match) { it.produtoId = match.id; if (!it.unidade) it.unidade = match.unidade; return match; }
    const p = {
      codigo: S.nextCode('MAT', 'produtos'), descricao: it.descricao, unidade: it.unidade || 'UN',
      categoria: '', marcas: it.marca ? [it.marca] : [], ncm: '', estoqueMin: 0,
      origem: origem || 'cadastro', historicoPrecos: []
    };
    S.upsert('produtos', p, true);
    it.produtoId = p.id;
    return p;
  };

  D.addMarca = function (produtoId, marca) {
    const p = S.find('produtos', produtoId);
    if (!p || !marca) return;
    p.marcas = p.marcas || [];
    if (!p.marcas.some(m => U.norm(m) === U.norm(marca))) p.marcas.push(marca.trim());
  };

  /* ---------- Cotações ---------- */

  D.criarCotacao = function (solIds, compradorId) {
    const itens = [];
    solIds.forEach(sid => {
      const sol = S.find('solicitacoes', sid);
      if (!sol) return;
      sol.itens.forEach(it => {
        itens.push({
          id: U.uid(), solicitacaoId: sol.id, solItemId: it.id, produtoId: it.produtoId,
          descricao: it.descricao, qtd: Number(it.qtd) || 0, unidade: it.unidade, marca: it.marca || '',
          destino: sol.destino, centroCustoId: sol.centroCustoId
        });
      });
      sol.status = 'em_cotacao';
      sol.historico.push({ data: U.nowIso(), evento: 'Enviada para cotação' });
    });
    const firstSol = S.find('solicitacoes', solIds[0]);
    const cfg = S.config();
    const cot = {
      numero: S.nextNumber('CT'), data: U.today(), status: 'aberta',
      compradorId: compradorId || (firstSol && firstSol.compradorId) || '',
      solicitacaoIds: solIds.slice(), itens: itens, fornecedorIds: [],
      prazoResposta: U.addDays(U.today(), cfg.prazoRespostaDias || 3),
      propostas: [], selecao: {}, obs: ''
    };
    // sugere fornecedores que já cotaram estes produtos
    const sugeridos = new Set();
    itens.forEach(it => {
      const p = S.find('produtos', it.produtoId);
      (p && p.historicoPrecos || []).forEach(h => sugeridos.add(h.fornecedorId));
    });
    cot.fornecedorIds = Array.from(sugeridos).filter(id => S.find('fornecedores', id)).slice(0, 5);
    S.upsert('cotacoes', cot, true);
    S.log('Criada cotação ' + cot.numero);
    S.save();
    return cot;
  };

  D.novaProposta = function (fornecedorId) {
    const cfg = S.config();
    return {
      id: U.uid(), fornecedorId: fornecedorId || '', data: U.today(),
      validade: U.addDays(U.today(), cfg.validadePadraoDias || 15), prazoEntregaDias: '',
      condPagamento: '', freteTipo: 'CIF', frete: 0, descontoPct: 0, obs: '', origem: 'digitada',
      anexos: [], precos: {}
    };
  };

  /* Salva proposta e captura dados para os cadastros (fornecedor, produtos, marcas, histórico) */
  D.salvarProposta = function (cot, prop) {
    const i = cot.propostas.findIndex(p => p.id === prop.id);
    if (i > -1) cot.propostas[i] = prop; else cot.propostas.push(prop);
    if (prop.fornecedorId && cot.fornecedorIds.indexOf(prop.fornecedorId) < 0) cot.fornecedorIds.push(prop.fornecedorId);
    cot.itens.forEach(it => {
      const pr = prop.precos[it.id];
      D.vincularProduto(it, 'cotação ' + cot.numero);
      if (pr && pr.marca) D.addMarca(it.produtoId, pr.marca);
    });
    if (cot.status === 'aberta' && cot.propostas.length) cot.status = 'em_analise';
    D.autoSelecionar(cot, true);
    S.upsert('cotacoes', cot, true);
    S.log('Proposta de ' + D.fornecedorNome(prop.fornecedorId) + ' registrada em ' + cot.numero);
    S.save();
  };

  D.localizarOuCriarFornecedor = function (dados) {
    const forns = S.all('fornecedores');
    const cnpj = U.onlyDigits(dados.cnpj);
    let f = cnpj ? forns.find(x => U.onlyDigits(x.cnpj) === cnpj) : null;
    if (!f && dados.email) f = forns.find(x => x.email && x.email.toLowerCase() === dados.email.toLowerCase());
    if (!f && dados.fornecedorNome) {
      const bm = U.bestMatch(dados.fornecedorNome, forns, x => (x.razao || '') + ' ' + (x.fantasia || ''), 0.6);
      if (bm) f = bm.item;
    }
    return f;
  };

  D.criarFornecedorCapturado = function (dados) {
    const f = {
      codigo: S.nextCode('FOR', 'fornecedores'), razao: dados.fornecedorNome || 'Fornecedor ' + (dados.cnpj || ''),
      fantasia: '', cnpj: dados.cnpj || '', contato: '', email: dados.email || '', telefone: dados.telefone || '',
      whatsapp: '', cidade: '', uf: '', categorias: '', obs: 'Cadastrado automaticamente a partir de proposta recebida',
      origem: 'proposta', ativo: true
    };
    S.upsert('fornecedores', f, true);
    return f;
  };

  /* Mapa comparativo */
  D.mapa = function (cot) {
    const cfg = S.config();
    const props = cot.propostas.filter(p => p.fornecedorId);
    const linhas = cot.itens.map(it => {
      const ofertas = props.map(p => {
        const pr = p.precos[it.id];
        const unit = pr ? Number(pr.unit) || 0 : 0;
        const ok = pr && unit > 0 && pr.disponivel !== false;
        const efetivo = ok ? unit * (1 - (Number(p.descontoPct) || 0) / 100) : null;
        return {
          propostaId: p.id, fornecedorId: p.fornecedorId, unit: ok ? unit : null, efetivo: efetivo,
          total: ok ? efetivo * it.qtd : null, marca: pr ? pr.marca || '' : '', prazo: Number(p.prazoEntregaDias) || 0
        };
      });
      const validas = ofertas.filter(o => o.efetivo !== null);
      let melhor = null;
      validas.forEach(o => {
        if (!melhor || o.efetivo < melhor.efetivo - 1e-9 || (Math.abs(o.efetivo - melhor.efetivo) < 1e-9 && o.prazo < melhor.prazo)) melhor = o;
      });
      const pior = validas.reduce((a, o) => (!a || o.efetivo > a.efetivo ? o : a), null);
      const media = validas.length ? U.sum(validas, o => o.efetivo) / validas.length : null;
      const selId = cot.selecao[it.id];
      const sel = ofertas.find(o => o.propostaId === selId && o.efetivo !== null) || null;
      return {
        item: it, ofertas: ofertas, melhor: melhor, pior: pior, media: media, sel: sel,
        totalMelhor: melhor ? melhor.total : 0, totalSel: sel ? sel.total : 0,
        totalMedia: media !== null ? media * it.qtd : 0, totalPior: pior ? pior.total : 0
      };
    });
    const porProposta = props.map(p => {
      const itensCot = linhas.filter(l => l.ofertas.find(o => o.propostaId === p.id && o.efetivo !== null));
      const bruto = U.sum(itensCot, l => { const o = l.ofertas.find(x => x.propostaId === p.id); return o.unit * l.item.qtd; });
      const liquido = U.sum(itensCot, l => l.ofertas.find(x => x.propostaId === p.id).total);
      const frete = cfg.considerarFreteNoMapa ? Number(p.frete) || 0 : 0;
      const vencidos = linhas.filter(l => l.sel && l.sel.propostaId === p.id);
      return {
        proposta: p, fornecedorId: p.fornecedorId, itensCotados: itensCot.length, completo: itensCot.length === linhas.length,
        bruto: bruto, desconto: bruto - liquido, frete: frete, total: liquido + frete,
        vencidos: vencidos.length, totalVencido: U.sum(vencidos, l => l.totalSel) + (vencidos.length ? frete : 0),
        melhores: linhas.filter(l => l.melhor && l.melhor.propostaId === p.id).length
      };
    });
    const fretesSel = U.sum(porProposta.filter(x => x.vencidos > 0), x => x.frete);
    const totalMelhor = U.sum(linhas, l => l.totalMelhor);
    const totalSel = U.sum(linhas, l => l.totalSel) + fretesSel;
    const totalMedia = U.sum(linhas, l => l.totalMedia);
    const totalPior = U.sum(linhas, l => l.totalPior);
    const completos = porProposta.filter(x => x.completo).sort((a, b) => a.total - b.total);
    return {
      linhas: linhas, porProposta: porProposta, totalMelhor: totalMelhor, totalSel: totalSel, fretesSel: fretesSel,
      totalMedia: totalMedia, totalPior: totalPior,
      economiaMedia: totalMedia - (totalSel - fretesSel), economiaPior: totalPior - (totalSel - fretesSel),
      melhorUnico: completos[0] || null,
      itensSemPreco: linhas.filter(l => !l.melhor).length,
      itensSelecionados: linhas.filter(l => l.sel).length
    };
  };

  /* Seleciona automaticamente o menor preço de cada item.
     somenteVazios=true preserva escolhas manuais já feitas */
  D.autoSelecionar = function (cot, somenteVazios) {
    const m = D.mapa(cot);
    m.linhas.forEach(l => {
      const atual = cot.selecao[l.item.id];
      const atualValido = atual && l.ofertas.find(o => o.propostaId === atual && o.efetivo !== null);
      if (somenteVazios && atualValido && cot.selecaoManual && cot.selecaoManual[l.item.id]) return;
      cot.selecao[l.item.id] = l.melhor ? l.melhor.propostaId : null;
    });
    if (!somenteVazios) cot.selecaoManual = {};
  };

  D.selecionarFornecedorUnico = function (cot, propostaId) {
    cot.itens.forEach(it => {
      const p = cot.propostas.find(x => x.id === propostaId);
      const pr = p && p.precos[it.id];
      cot.selecao[it.id] = pr && Number(pr.unit) > 0 && pr.disponivel !== false ? propostaId : null;
    });
    cot.selecaoManual = {};
    cot.itens.forEach(it => { cot.selecaoManual[it.id] = true; });
  };

  /* Gera um pedido por fornecedor vencedor */
  D.gerarPedidos = function (cot) {
    const m = D.mapa(cot);
    const cfg = S.config();
    const porProp = U.groupBy(m.linhas.filter(l => l.sel), l => l.sel.propostaId);
    const criados = [];
    Object.keys(porProp).forEach(pid => {
      const prop = cot.propostas.find(p => p.id === pid);
      const ls = porProp[pid];
      const ped = {
        numero: S.nextNumber('PC'), data: U.today(), cotacaoId: cot.id, fornecedorId: prop.fornecedorId,
        compradorId: cot.compradorId, status: 'emitido', condPagamento: prop.condPagamento || '',
        prazoEntregaDias: prop.prazoEntregaDias, previsaoEntrega: U.addDays(U.today(), Number(prop.prazoEntregaDias) || 0),
        freteTipo: prop.freteTipo || '', frete: Number(prop.frete) || 0, descontoPct: Number(prop.descontoPct) || 0,
        localEntrega: cfg.localEntrega || '', obs: '',
        itens: ls.map(l => ({
          id: U.uid(), cotItemId: l.item.id, produtoId: l.item.produtoId, descricao: l.item.descricao,
          qtd: l.item.qtd, unidade: l.item.unidade, marca: l.sel.marca || l.item.marca || '',
          unit: l.sel.unit, unitLiquido: l.sel.efetivo, total: l.sel.total,
          destino: l.item.destino, solicitacaoId: l.item.solicitacaoId, centroCustoId: l.item.centroCustoId, recebido: 0
        })),
        recebimentos: []
      };
      ped.subtotal = U.sum(ped.itens, i => i.total);
      ped.total = ped.subtotal + ped.frete;
      S.upsert('pedidos', ped, true);
      criados.push(ped);
      // histórico de preços por produto
      ped.itens.forEach(i => {
        const p = S.find('produtos', i.produtoId);
        if (!p) return;
        p.historicoPrecos = p.historicoPrecos || [];
        p.historicoPrecos.push({ data: U.today(), fornecedorId: ped.fornecedorId, preco: i.unitLiquido, marca: i.marca, cotacao: cot.numero, pedido: ped.numero });
        D.addMarca(p.id, i.marca);
      });
    });
    // registra preços ofertados (não vencedores) como referência de mercado
    cot.propostas.forEach(p => {
      cot.itens.forEach(it => {
        const pr = p.precos[it.id];
        const prod = S.find('produtos', it.produtoId);
        if (!prod || !pr || !(Number(pr.unit) > 0)) return;
        prod.cotacoesRecebidas = prod.cotacoesRecebidas || [];
        prod.cotacoesRecebidas.push({ data: p.data, fornecedorId: p.fornecedorId, preco: Number(pr.unit), marca: pr.marca || '', cotacao: cot.numero });
        if (prod.cotacoesRecebidas.length > 50) prod.cotacoesRecebidas.shift();
      });
    });
    cot.status = 'finalizada';
    cot.economia = { media: m.economiaMedia, pior: m.economiaPior, total: m.totalSel };
    cot.pedidoIds = criados.map(p => p.id);
    cot.solicitacaoIds.forEach(sid => {
      const sol = S.find('solicitacoes', sid);
      if (sol && sol.status !== 'cancelada') {
        sol.status = 'pedido';
        sol.historico.push({ data: U.nowIso(), evento: 'Pedido(s) emitido(s): ' + criados.map(p => p.numero).join(', ') });
      }
    });
    S.log('Cotação ' + cot.numero + ' finalizada: ' + criados.length + ' pedido(s)');
    S.save();
    return criados;
  };

  /* ---------- Recebimento e estoque ---------- */

  D.receber = function (ped, qtds, nf, data) {
    const rec = { id: U.uid(), data: data || U.today(), nf: nf || '', itens: {} };
    ped.itens.forEach(i => {
      const q = Number(qtds[i.id]) || 0;
      if (q <= 0) return;
      rec.itens[i.id] = q;
      i.recebido = (Number(i.recebido) || 0) + q;
      const destinoEstoque = i.destino === 'estoque';
      S.upsert('movimentos', {
        data: rec.data, produtoId: i.produtoId, tipo: 'entrada', qtd: q, custoUnit: i.unitLiquido,
        doc: ped.numero + (nf ? ' / NF ' + nf : ''), origem: 'Recebimento de pedido',
        centroCustoId: i.centroCustoId, obs: destinoEstoque ? '' : 'Aplicação direta'
      }, true);
      if (!destinoEstoque) {
        // aplicação direta: entra e sai no mesmo ato, para rastrear o consumo
        S.upsert('movimentos', {
          data: rec.data, produtoId: i.produtoId, tipo: 'saida', qtd: q, custoUnit: i.unitLiquido,
          doc: ped.numero, origem: 'Aplicação direta', centroCustoId: i.centroCustoId,
          solicitacaoId: i.solicitacaoId, obs: ''
        }, true);
      }
    });
    ped.recebimentos.push(rec);
    const completo = ped.itens.every(i => (Number(i.recebido) || 0) >= Number(i.qtd) - 1e-9);
    ped.status = completo ? 'recebido' : 'recebido_parcial';
    // solicitação atendida quando todos os pedidos que a envolvem foram recebidos
    const solIds = new Set(ped.itens.map(i => i.solicitacaoId));
    solIds.forEach(sid => {
      const sol = S.find('solicitacoes', sid);
      if (!sol) return;
      const peds = S.all('pedidos').filter(p => p.status !== 'cancelado' && p.itens.some(i => i.solicitacaoId === sid));
      const tudo = peds.every(p => p.itens.filter(i => i.solicitacaoId === sid).every(i => (Number(i.recebido) || 0) >= Number(i.qtd) - 1e-9));
      if (tudo) { sol.status = 'atendida'; sol.historico.push({ data: U.nowIso(), evento: 'Material recebido — solicitação atendida' }); }
    });
    S.log('Recebimento ' + ped.numero + (nf ? ' NF ' + nf : ''));
    S.save();
  };

  D.saldo = function (produtoId) {
    return U.sum(S.all('movimentos').filter(m => m.produtoId === produtoId), m => (m.tipo === 'saida' ? -1 : 1) * (Number(m.qtd) || 0));
  };

  D.custoMedio = function (produtoId) {
    const ent = S.all('movimentos').filter(m => m.produtoId === produtoId && m.tipo === 'entrada' && m.custoUnit);
    const q = U.sum(ent, m => m.qtd);
    return q ? U.sum(ent, m => m.qtd * m.custoUnit) / q : 0;
  };

  D.abaixoMinimo = function () {
    return S.all('produtos').filter(p => Number(p.estoqueMin) > 0 && D.saldo(p.id) < Number(p.estoqueMin));
  };

  D.gerarReposicao = function (solicitanteId) {
    const baixos = D.abaixoMinimo();
    if (!baixos.length) return null;
    const sol = D.novaSolicitacao();
    sol.destino = 'estoque';
    sol.origemEntrada = 'reposicao';
    sol.solicitanteId = solicitanteId || '';
    sol.aplicacao = 'Reposição de estoque mínimo';
    sol.itens = baixos.map(p => ({
      id: U.uid(), produtoId: p.id, descricao: p.descricao, unidade: p.unidade,
      qtd: Math.max(1, (Number(p.estoqueMax) || Number(p.estoqueMin) * 2) - D.saldo(p.id)), marca: (p.marcas || [])[0] || '', obs: ''
    }));
    return D.salvarSolicitacao(sol);
  };

  /* Onde um cadastro é usado — impede exclusões que quebrariam o histórico */
  D.usos = function (col, id) {
    const u = [];
    if (col === 'fornecedores') {
      S.all('cotacoes').forEach(c => { if (c.propostas.some(p => p.fornecedorId === id) || c.fornecedorIds.indexOf(id) > -1) u.push(c.numero); });
      S.all('pedidos').forEach(p => { if (p.fornecedorId === id) u.push(p.numero); });
    } else if (col === 'produtos') {
      S.all('solicitacoes').forEach(s => { if (s.itens.some(i => i.produtoId === id)) u.push(s.numero); });
      S.all('pedidos').forEach(p => { if (p.itens.some(i => i.produtoId === id)) u.push(p.numero); });
      if (S.all('movimentos').some(m => m.produtoId === id)) u.push('movimentos de estoque');
    } else if (col === 'solicitantes') {
      S.all('solicitacoes').forEach(s => { if (s.solicitanteId === id) u.push(s.numero); });
    } else if (col === 'compradores') {
      S.all('solicitacoes').forEach(s => { if (s.compradorId === id) u.push(s.numero); });
      S.all('cotacoes').forEach(c => { if (c.compradorId === id) u.push(c.numero); });
    } else if (col === 'centrosCusto') {
      S.all('solicitacoes').forEach(s => { if (s.centroCustoId === id) u.push(s.numero); });
    }
    return u;
  };

  root.D = D;
})(window);
