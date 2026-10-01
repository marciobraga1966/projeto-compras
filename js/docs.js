/* Documentos: pedido de cotação, pedido de compra, mapa comparativo e solicitação
   (impressão/PDF), planilha de cotação para o fornecedor e textos para e-mail/WhatsApp */
(function (root) {
  'use strict';
  const { U, S, D } = root;
  const Docs = {};

  function head(titulo, numero, data) {
    const e = S.config().empresa;
    return '<div class="dh"><img src="assets/logo-brasmic.svg" alt="Brasmic">' +
      '<div class="small">' + U.esc(e.nome) + (e.cnpj ? '<br>CNPJ ' + U.esc(e.cnpj) : '') + (e.endereco ? '<br>' + U.esc(e.endereco) : '') +
      (e.cidade ? ' — ' + U.esc(e.cidade) : '') + (e.telefone ? '<br>' + U.esc(e.telefone) : '') + (e.email ? ' · ' + U.esc(e.email) : '') + '</div>' +
      '<div class="dt"><h1>' + U.esc(titulo) + '</h1><div class="nr">' + U.esc(numero) + '</div><div>' + U.date(data) + '</div></div></div><div class="band"></div>';
  }

  function fornBox(f, titulo) {
    if (!f) return '<div class="box"><h3>' + (titulo || 'Fornecedor') + '</h3>—</div>';
    return '<div class="box"><h3>' + (titulo || 'Fornecedor') + '</h3><b>' + U.esc(f.razao) + '</b>' +
      (f.cnpj ? '<br>CNPJ ' + U.esc(f.cnpj) : '') + (f.contato ? '<br>Contato: ' + U.esc(f.contato) : '') +
      (f.telefone ? '<br>' + U.esc(f.telefone) : '') + (f.email ? ' · ' + U.esc(f.email) : '') +
      (f.cidade ? '<br>' + U.esc(f.cidade) + (f.uf ? '/' + U.esc(f.uf) : '') : '') + '</div>';
  }

  /* ---------- Pedido de cotação ---------- */
  Docs.rfqHtml = function (cot, fornecedorId) {
    const f = S.find('fornecedores', fornecedorId);
    const comp = S.find('compradores', cot.compradorId);
    let h = '<div class="doc">' + head('Pedido de Cotação', cot.numero, cot.data);
    h += '<div class="blk">' + fornBox(f) + '<div class="box"><h3>Condições</h3>Responder até: <b>' + U.date(cot.prazoResposta) + '</b>' +
      '<br>Comprador(a): ' + U.esc(comp ? comp.nome : '—') + (comp && comp.email ? ' · ' + U.esc(comp.email) : '') +
      '<br>Local de entrega: ' + U.esc(S.config().localEntrega || '—') + '</div></div>';
    h += '<table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th>Unid</th><th>Marca ref.</th><th class="n">Preço unit.</th><th>Marca ofertada</th><th class="n">Total</th></tr></thead><tbody>';
    cot.itens.forEach((it, i) => {
      const p = S.find('produtos', it.produtoId);
      h += '<tr><td>' + (i + 1) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(it.descricao) + '</td><td class="n">' + U.num(it.qtd) + '</td><td>' + U.esc(it.unidade) + '</td><td>' + U.esc(it.marca) + '</td><td></td><td></td><td></td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="blk" style="margin-top:14px"><div class="box"><h3>Preencher pelo fornecedor</h3>Prazo de entrega (dias): ________<br>Condição de pagamento: ______________<br>Frete: ( ) CIF ( ) FOB  Valor: R$ ________<br>Validade da proposta: ____ dias</div>' +
      '<div class="box"><h3>Observações</h3>' + U.esc(cot.obs || 'Favor informar marca, prazo de entrega e condição de pagamento. Citar o número ' + cot.numero + ' na resposta.') + '</div></div>';
    h += '<div class="foot">Documento gerado pelo sistema de compras Brasmic em ' + U.dateTime(U.nowIso()) + '.</div></div>';
    return h;
  };

  Docs.rfqTexto = function (cot, fornecedorId) {
    const f = S.find('fornecedores', fornecedorId);
    const e = S.config().empresa;
    const comp = S.find('compradores', cot.compradorId);
    let t = 'Prezados' + (f ? ' ' + (f.contato || f.fantasia || f.razao) : '') + ',\n\n';
    t += 'Solicitamos cotação dos itens abaixo (ref. ' + cot.numero + '), com resposta até ' + U.date(cot.prazoResposta) + ':\n\n';
    cot.itens.forEach((it, i) => {
      t += (i + 1) + ') ' + it.descricao + ' — ' + U.num(it.qtd) + ' ' + it.unidade + (it.marca ? ' (ref. marca ' + it.marca + ')' : '') + '\n';
    });
    t += '\nFavor informar: preço unitário, marca, prazo de entrega, condição de pagamento, frete (CIF/FOB) e validade da proposta.\n';
    t += 'Local de entrega: ' + (S.config().localEntrega || '') + '\n\nAtenciosamente,\n' + (comp ? comp.nome + '\n' : '') + e.nome + (e.telefone ? '\n' + e.telefone : '');
    return t;
  };

  const RFQ_LABELS = {
    prazoEntregaDias: 'Prazo de entrega (dias)',
    condPagamento: 'Condição de pagamento',
    freteTipo: 'Frete (CIF ou FOB)',
    frete: 'Valor do frete (R$)',
    descontoPct: 'Desconto geral (%)',
    validadeDias: 'Validade da proposta (dias)'
  };
  const RFQ_HEADER = ['Item', 'Código', 'Descrição', 'Qtd', 'Unid', 'Marca solicitada', 'Preço unitário (R$)', 'Marca ofertada', 'Total (R$)', 'Observação', 'ID (não alterar)'];

  Docs.rfqPlanilha = function (cot, fornecedorId) {
    const f = S.find('fornecedores', fornecedorId);
    const rows = [
      ['PEDIDO DE COTAÇÃO', cot.numero],
      ['Empresa', S.config().empresa.nome],
      ['Fornecedor', f ? f.razao : ''],
      ['CNPJ do fornecedor', f ? f.cnpj : ''],
      ['E-mail do fornecedor', f ? f.email : ''],
      ['Responder até', U.date(cot.prazoResposta)]
    ];
    Object.keys(RFQ_LABELS).forEach(k => rows.push([RFQ_LABELS[k], '']));
    rows.push([]);
    rows.push(RFQ_HEADER);
    cot.itens.forEach((it, i) => {
      const p = S.find('produtos', it.produtoId);
      const r = 14 + i + 1; // linha do Excel
      rows.push([i + 1, p ? p.codigo : '', it.descricao, it.qtd, it.unidade, it.marca || '', '', '', { f: 'IF(G' + r + '="","",D' + r + '*G' + r + ')' }, '', it.id]);
    });
    return rows;
  };

  Docs.baixarPlanilhaRfq = async function (cot, fornecedorId) {
    const f = S.find('fornecedores', fornecedorId);
    const nome = cot.numero + (f ? '-' + (f.fantasia || f.razao).replace(/[^\w]+/g, '_').slice(0, 30) : '') + '.xlsx';
    await root.C.writeXlsx(nome, { 'Cotação': Docs.rfqPlanilha(cot, fornecedorId) }, { 'Cotação': [26, 16, 46, 8, 7, 18, 18, 18, 14, 24, 14] });
  };

  /* Lê planilha devolvida pelo fornecedor (modelo gerado acima ou planilha parecida) */
  Docs.lerPlanilhaProposta = function (rows, cot) {
    const out = { precos: {}, reconhecidos: 0 };
    const label = s => U.norm(s);
    rows.forEach(r => {
      const k = label(r[0]);
      if (!k) return;
      if (k.indexOf('pedido de cotacao') === 0 && r[1]) out.cotacaoNumero = String(r[1]).trim();
      if (k === 'fornecedor' && r[1]) out.fornecedorNome = String(r[1]).trim();
      if (k.indexOf('cnpj') === 0 && r[1]) out.cnpj = U.fmtCnpj(r[1]);
      if (k.indexOf('e mail') === 0 && r[1]) out.email = String(r[1]).trim();
      Object.keys(RFQ_LABELS).forEach(f => {
        if (k === label(RFQ_LABELS[f]) && r[1] !== '' && r[1] !== undefined) {
          const v = String(r[1]).trim();
          if (f === 'freteTipo') out[f] = /fob/i.test(v) ? 'FOB' : 'CIF';
          else if (f === 'condPagamento') out[f] = v;
          else out[f] = U.parseNum(v);
        }
      });
    });
    // localiza cabeçalho de itens
    let hi = rows.findIndex(r => r.some(c => /pre[cç]o/i.test(String(c))) && r.some(c => /descri/i.test(String(c))));
    if (hi < 0) return out;
    const hdr = rows[hi].map(c => U.norm(c));
    const col = (re) => hdr.findIndex(h => re.test(h));
    const cDesc = col(/descri/), cPreco = col(/preco|unit/), cMarca = col(/marca ofert|^marca$/), cId = col(/^id/), cQtd = col(/^qt/), cObs = col(/obs/), cItem = col(/^item/);
    const cTotal = col(/^total/);
    rows.slice(hi + 1).forEach(r => {
      if (!r || !r.length) return;
      let unit = cPreco > -1 ? U.parseNum(r[cPreco]) : 0;
      if (!unit && cTotal > -1 && cQtd > -1 && U.parseNum(r[cQtd])) unit = U.parseNum(r[cTotal]) / U.parseNum(r[cQtd]);
      if (!unit) return;
      let it = cId > -1 ? cot.itens.find(x => x.id === String(r[cId]).trim()) : null;
      if (!it && cItem > -1 && Number(r[cItem]) >= 1) {
        const cand = cot.itens[Number(r[cItem]) - 1];
        if (cand && (cDesc < 0 || U.similarity(r[cDesc], cand.descricao) >= 0.3)) it = cand;
      }
      if (!it && cDesc > -1) { const bm = U.bestMatch(r[cDesc], cot.itens, x => x.descricao, 0.45); if (bm) it = bm.item; }
      if (!it) return;
      out.precos[it.id] = { unit: U.round(unit, 4), marca: cMarca > -1 ? String(r[cMarca] || '').trim() : '', obs: cObs > -1 ? String(r[cObs] || '').trim() : '', disponivel: true, score: 1 };
      out.reconhecidos++;
    });
    return out;
  };

  /* ---------- Pedido de compra ---------- */
  Docs.pedidoHtml = function (ped) {
    const f = S.find('fornecedores', ped.fornecedorId);
    const comp = S.find('compradores', ped.compradorId);
    const cot = S.find('cotacoes', ped.cotacaoId);
    let h = '<div class="doc">' + head('Pedido de Compra', ped.numero, ped.data);
    if (ped.status === 'aguardando_aprovacao' || ped.status === 'reprovado') h += '<div class="stamp">' + (ped.status === 'reprovado' ? 'REPROVADO — NÃO ENVIAR' : 'AGUARDANDO APROVAÇÃO — NÃO ENVIAR') + '</div>';
    h += '<div class="blk">' + fornBox(f) + '<div class="box"><h3>Entrega e pagamento</h3>Local: ' + U.esc(ped.localEntrega || '—') +
      '<br>Prazo: ' + (ped.prazoEntregaDias !== '' && ped.prazoEntregaDias !== undefined ? U.esc(ped.prazoEntregaDias) + ' dias (previsão ' + U.date(ped.previsaoEntrega) + ')' : '—') +
      '<br>Pagamento: ' + U.esc(ped.condPagamento || '—') + '<br>Frete: ' + U.esc(ped.freteTipo || '—') +
      (cot ? '<br>Referência: cotação ' + U.esc(cot.numero) : '') + '</div></div>';
    h += '<table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th>Destino</th><th>Marca</th><th class="n">Qtd</th><th>Unid</th><th class="n">Preço unit.</th><th class="n">Total</th></tr></thead><tbody>';
    ped.itens.forEach((it, i) => {
      const p = S.find('produtos', it.produtoId);
      h += '<tr><td>' + (i + 1) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(it.descricao) + '</td><td>' + (it.destino === 'estoque' ? 'Estoque' : 'Aplicação direta<br><small>' + U.esc(D.apropriacao(it)) + '</small>') + '</td><td>' + U.esc(it.marca) + '</td><td class="n">' + U.num(it.qtd) + '</td><td>' + U.esc(it.unidade) + '</td><td class="n">' + U.money(it.unitLiquido) + '</td><td class="n">' + U.money(it.total) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="8" class="n">Subtotal</td><td class="n">' + U.money(ped.subtotal) + '</td></tr>' +
      (ped.frete ? '<tr><td colspan="8" class="n">Frete</td><td class="n">' + U.money(ped.frete) + '</td></tr>' : '') +
      '<tr><td colspan="8" class="n">Total do pedido</td><td class="n">' + U.money(ped.total) + '</td></tr></tfoot></table>';
    if (ped.obs) h += '<div class="box" style="margin-top:12px"><h3>Observações</h3>' + U.esc(ped.obs) + '</div>';
    h += '<div class="box" style="margin-top:12px"><h3>Instruções</h3>Citar o número ' + U.esc(ped.numero) + ' na nota fiscal. Entregas somente em dias úteis. Materiais fora da especificação serão devolvidos.</div>';
    h += '<div class="sign"><div>' + U.esc(comp ? comp.nome : 'Comprador(a)') + '<br>Compras</div><div>' + (ped.aprovacao && ped.aprovacao.resultado === 'aprovado' ? 'Aprovado por ' + U.esc(ped.aprovacao.porNome) + '<br>' + U.dateTime(ped.aprovacao.em) + ' · alçada nível ' + ped.aprovacao.nivel : 'Aprovação') + '</div></div>';
    h += '<div class="foot">Documento gerado pelo sistema de compras Brasmic em ' + U.dateTime(U.nowIso()) + '.</div></div>';
    return h;
  };

  Docs.pedidoTexto = function (ped) {
    const f = S.find('fornecedores', ped.fornecedorId);
    let t = 'Prezados' + (f ? ' ' + (f.contato || f.fantasia || f.razao) : '') + ',\n\nSegue nosso pedido de compra ' + ped.numero + ':\n\n';
    ped.itens.forEach((it, i) => {
      t += (i + 1) + ') ' + it.descricao + (it.marca ? ' — marca ' + it.marca : '') + ' — ' + U.num(it.qtd) + ' ' + it.unidade + ' x ' + U.money(it.unitLiquido) + ' = ' + U.money(it.total) + '\n';
    });
    t += '\nTotal: ' + U.money(ped.total) + (ped.frete ? ' (frete ' + U.money(ped.frete) + ')' : '') + '\n';
    t += 'Pagamento: ' + (ped.condPagamento || '—') + '\nEntrega: ' + (ped.localEntrega || '—') + ' até ' + U.date(ped.previsaoEntrega) + '\n\nFavor citar ' + ped.numero + ' na nota fiscal.\n\nAtenciosamente,\n' + S.config().empresa.nome;
    return t;
  };

  /* ---------- Mapa comparativo ---------- */
  Docs.mapaHtml = function (cot) {
    const m = D.mapa(cot);
    let h = '<div class="doc">' + head('Mapa Comparativo', cot.numero, U.today());
    h += '<table><thead><tr><th>Item</th><th>Descrição</th><th class="n">Qtd</th>';
    m.porProposta.forEach(pp => { h += '<th class="n">' + U.esc(D.fornecedorNome(pp.fornecedorId)) + '</th>'; });
    h += '<th>Escolhido</th></tr></thead><tbody>';
    m.linhas.forEach((l, i) => {
      h += '<tr><td>' + (i + 1) + '</td><td>' + U.esc(l.item.descricao) + '</td><td class="n">' + U.num(l.item.qtd) + ' ' + U.esc(l.item.unidade) + '</td>';
      l.ofertas.forEach(o => {
        const best = l.melhor && l.melhor.propostaId === o.propostaId;
        h += '<td class="n' + (best ? ' best' : '') + '">' + (o.efetivo !== null ? U.money(o.efetivo) + '<br><small>' + U.money(o.total) + (o.marca ? ' · ' + U.esc(o.marca) : '') + '</small>' : '—') + '</td>';
      });
      h += '<td>' + (l.sel ? U.esc(D.fornecedorNome(l.sel.fornecedorId)) : '—') + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="3">Total por fornecedor (itens cotados + frete)</td>';
    m.porProposta.forEach(pp => { h += '<td class="n">' + U.money(pp.total) + '<br><small>' + pp.itensCotados + '/' + m.linhas.length + ' itens · ' + (pp.proposta.prazoEntregaDias !== '' ? pp.proposta.prazoEntregaDias + ' d' : '') + '</small></td>'; });
    h += '<td></td></tr></tfoot></table>';
    h += '<div class="blk" style="margin-top:14px"><div class="box"><h3>Totalizador</h3>Total com os melhores preços: <b>' + U.money(m.totalMelhor) + '</b><br>Total selecionado (com fretes): <b>' + U.money(m.totalSel) + '</b><br>Economia sobre a média: <b>' + U.money(m.economiaMedia) + '</b><br>Economia sobre o maior preço: <b>' + U.money(m.economiaPior) + '</b></div>' +
      '<div class="box"><h3>Condições</h3>' + m.porProposta.map(pp => U.esc(D.fornecedorNome(pp.fornecedorId)) + ': ' + U.esc(pp.proposta.condPagamento || '—') + ', frete ' + U.esc(pp.proposta.freteTipo || '') + ' ' + (pp.frete ? U.money(pp.frete) : '') + ', prazo ' + (pp.proposta.prazoEntregaDias !== '' ? U.esc(pp.proposta.prazoEntregaDias) + ' dias' : '—')).join('<br>') + '</div></div>';
    h += '<div class="sign"><div>Comprador(a)</div><div>Aprovação</div></div></div>';
    return h;
  };

  Docs.mapaPlanilha = function (cot) {
    const m = D.mapa(cot);
    const forn = m.porProposta.map(pp => D.fornecedorNome(pp.fornecedorId));
    const hdr = ['Item', 'Descrição', 'Qtd', 'Unid'];
    forn.forEach(n => { hdr.push(n + ' — unit.', n + ' — total', n + ' — marca'); });
    hdr.push('Melhor preço unit.', 'Fornecedor melhor preço', 'Selecionado', 'Total selecionado');
    const rows = [['Mapa comparativo ' + cot.numero], [], hdr];
    m.linhas.forEach((l, i) => {
      const r = [i + 1, l.item.descricao, l.item.qtd, l.item.unidade];
      l.ofertas.forEach(o => { r.push(o.efetivo !== null ? U.round(o.efetivo, 4) : '', o.total !== null ? U.round(o.total, 2) : '', o.marca); });
      r.push(l.melhor ? U.round(l.melhor.efetivo, 4) : '', l.melhor ? D.fornecedorNome(l.melhor.fornecedorId) : '', l.sel ? D.fornecedorNome(l.sel.fornecedorId) : '', l.sel ? U.round(l.sel.total, 2) : '');
      rows.push(r);
    });
    rows.push([]);
    const tot = ['', 'Total por fornecedor', '', ''];
    m.porProposta.forEach(pp => { tot.push('', U.round(pp.total, 2), pp.itensCotados + '/' + m.linhas.length + ' itens'); });
    rows.push(tot);
    rows.push([]);
    rows.push(['', 'Total com melhores preços', U.round(m.totalMelhor, 2)]);
    rows.push(['', 'Total selecionado (com fretes)', U.round(m.totalSel, 2)]);
    rows.push(['', 'Economia sobre a média', U.round(m.economiaMedia, 2)]);
    rows.push(['', 'Economia sobre o maior preço', U.round(m.economiaPior, 2)]);
    return rows;
  };

  /* ---------- Solicitação ---------- */
  Docs.solicitacaoHtml = function (sol) {
    let h = '<div class="doc">' + head('Solicitação de Compra', sol.numero, sol.data);
    h += '<div class="blk"><div class="box"><h3>Solicitante</h3>' + U.esc(D.solicitanteNome(sol)) + '<br>Centro de custo: ' + U.esc(D.centro(sol.centroCustoId)) + '<br>Comprador(a): ' + U.esc(D.pessoa('compradores', sol.compradorId)) + '</div>' +
      '<div class="box"><h3>Destino</h3>' + U.esc(D.DESTINO[sol.destino]) + (sol.aplicacao ? '<br>' + U.esc(sol.aplicacao) : '') + '<br>Prioridade: ' + U.esc(D.PRIORIDADE[sol.prioridade] || '') + '<br>Necessário até: ' + U.date(sol.necessidade) + '</div></div>';
    h += '<table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th>Unid</th><th>Marca</th><th>Obs.</th></tr></thead><tbody>';
    sol.itens.forEach((it, i) => {
      const p = S.find('produtos', it.produtoId);
      h += '<tr><td>' + (i + 1) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(it.descricao) + '</td><td class="n">' + U.num(it.qtd) + '</td><td>' + U.esc(it.unidade) + '</td><td>' + U.esc(it.marca) + '</td><td>' + U.esc(it.obs) + '</td></tr>';
    });
    h += '</tbody></table>' + (sol.obs ? '<div class="box" style="margin-top:12px"><h3>Observações</h3>' + U.esc(sol.obs) + '</div>' : '');
    h += '<div class="sign"><div>Solicitante</div><div>Aprovação</div></div></div>';
    return h;
  };

  Docs.mailto = function (email, assunto, corpo) {
    return 'mailto:' + encodeURIComponent(email || '') + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo);
  };

  Docs.whatsapp = function (fone, texto) {
    let d = U.onlyDigits(fone);
    if (d && d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(texto);
  };

  root.Docs = Docs;
})(window);
