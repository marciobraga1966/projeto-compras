/* Painel: visão geral do processo de compras */
(function (root) {
  'use strict';
  const { U, S, D, UI } = root;
  const V = root.V = root.V || {};

  V.dashboard = function () {
    UI.setHeader('Painel de compras', 'Visão geral',
      '<button class="btn pri" data-go="#/solicitacoes/nova">' + UI.icon('plus') + 'Nova solicitação</button>');
    const sols = S.all('solicitacoes');
    const cots = S.all('cotacoes');
    const peds = S.all('pedidos');
    const mes = U.today().slice(0, 7);
    const pedsMes = peds.filter(p => p.data.slice(0, 7) === mes && p.status !== 'cancelado');
    const economia = U.sum(cots.filter(c => c.economia), c => c.economia.media);
    const abertas = sols.filter(s => s.status === 'aberta');
    const urg = sols.filter(s => s.prioridade === 'urgente' && ['aberta', 'em_cotacao'].indexOf(s.status) > -1);
    const cotAnd = cots.filter(c => c.status === 'aberta' || c.status === 'em_analise');
    const pedAb = peds.filter(p => ['emitido', 'enviado', 'recebido_parcial'].indexOf(p.status) > -1);
    const atrasados = pedAb.filter(p => p.previsaoEntrega && p.previsaoEntrega < U.today());
    const baixos = D.abaixoMinimo();

    let h = '<div class="kpis">' +
      '<a class="kpi" href="#/solicitacoes"><span>Solicitações abertas</span><b>' + abertas.length + '</b><small>' + urg.length + ' urgente(s) aguardando</small></a>' +
      '<a class="kpi" href="#/cotacoes"><span>Cotações em andamento</span><b>' + cotAnd.length + '</b><small>' + U.sum(cotAnd, c => c.propostas.length) + ' proposta(s) recebida(s)</small></a>' +
      '<a class="kpi" href="#/pedidos"><span>Pedidos a receber</span><b>' + pedAb.length + '</b><small>' + (atrasados.length ? atrasados.length + ' com entrega atrasada' : 'nenhum atrasado') + '</small></a>' +
      '<div class="kpi"><span>Comprado no mês</span><b>' + U.money(U.sum(pedsMes, p => p.total)) + '</b><small>' + pedsMes.length + ' pedido(s)</small></div>' +
      '<div class="kpi hl"><span>Economia obtida</span><b>' + U.money(economia) + '</b><small>sobre a média das propostas</small></div>' +
      '<a class="kpi" href="#/estoque"><span>Abaixo do mínimo</span><b>' + baixos.length + '</b><small>produto(s) em estoque</small></a>' +
      '</div>';

    h += '<div class="card"><div class="hd"><h2>Fluxo de compras</h2></div><div class="bd"><div class="steps">' +
      ['Solicitação', 'Cotação', 'Propostas', 'Mapa comparativo', 'Pedido de compra', 'Recebimento'].map(s => '<span class="done">' + s + '</span>').join('') +
      '</div><p class="muted small" style="margin:10px 0 0">A solicitação entra digitada, por foto/PDF da requisição ou por voz. O comprador agrupa solicitações numa cotação, envia aos fornecedores, lança as propostas (digitando ou importando planilha, PDF, foto ou texto), escolhe os melhores preços no mapa e gera os pedidos.</p></div></div>';

    h += '<div class="grid g2">';
    // pendências
    h += '<div class="card"><div class="hd"><h2>Aguardando ação</h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><tbody>';
    const pend = [];
    abertas.forEach(s => pend.push({ o: s.prioridade === 'urgente' ? 0 : 1, h: '<tr class="click" data-go="#/solicitacoes/' + s.id + '"><td><b>' + s.numero + '</b><br><span class="muted small">' + U.esc(D.pessoa('solicitantes', s.solicitanteId)) + '</span></td><td>Enviar para cotação</td><td>' + (s.prioridade === 'urgente' ? '<span class="tag urg">Urgente</span>' : '') + '</td><td class="n">' + U.date(s.necessidade) + '</td></tr>' }));
    cotAnd.forEach(c => pend.push({ o: 2, h: '<tr class="click" data-go="#/cotacoes/' + c.id + '"><td><b>' + c.numero + '</b><br><span class="muted small">' + c.propostas.length + ' de ' + Math.max(c.fornecedorIds.length, c.propostas.length) + ' propostas</span></td><td>' + (c.propostas.length ? 'Analisar mapa e emitir pedido' : 'Lançar propostas') + '</td><td>' + UI.pill(D.STATUS_COT, c.status) + '</td><td class="n">' + U.date(c.prazoResposta) + '</td></tr>' }));
    atrasados.forEach(p => pend.push({ o: 0, h: '<tr class="click" data-go="#/pedidos/' + p.id + '"><td><b>' + p.numero + '</b><br><span class="muted small">' + U.esc(D.fornecedorNome(p.fornecedorId)) + '</span></td><td>Cobrar entrega</td><td><span class="tag urg">Atrasado</span></td><td class="n">' + U.date(p.previsaoEntrega) + '</td></tr>' }));
    pend.sort((a, b) => a.o - b.o);
    h += pend.length ? pend.slice(0, 10).map(x => x.h).join('') : '<tr><td>' + UI.empty('Nada pendente', 'Todas as solicitações e cotações estão em dia.') + '</td></tr>';
    h += '</tbody></table></div></div></div>';

    // gastos por centro de custo
    const porCC = {};
    peds.filter(p => p.status !== 'cancelado').forEach(p => p.itens.forEach(i => { porCC[i.centroCustoId || ''] = (porCC[i.centroCustoId || ''] || 0) + i.total; }));
    const ccs = Object.keys(porCC).map(k => ({ k: k, v: porCC[k] })).sort((a, b) => b.v - a.v);
    const max = ccs.length ? ccs[0].v : 1;
    h += '<div class="card"><div class="hd"><h2>Compras por centro de custo</h2></div><div class="bd">' +
      (ccs.length ? '<div class="bars">' + ccs.map(x => '<div class="bar"><span class="lbl" title="' + U.esc(D.centro(x.k)) + '">' + U.esc(x.k ? D.centro(x.k) : 'Sem centro') + '</span><span class="track"><i style="width:' + Math.max(2, x.v / max * 100) + '%"></i></span><b class="num">' + U.money(x.v) + '</b></div>').join('') + '</div>'
        : UI.empty('Sem pedidos ainda', 'Os valores aparecem aqui quando houver pedidos emitidos.')) + '</div></div>';
    h += '</div>';

    h += '<div class="grid g2">';
    const rank = {};
    peds.filter(p => p.status !== 'cancelado').forEach(p => { rank[p.fornecedorId] = (rank[p.fornecedorId] || 0) + p.total; });
    const rk = Object.keys(rank).map(k => ({ k: k, v: rank[k] })).sort((a, b) => b.v - a.v).slice(0, 6);
    h += '<div class="card"><div class="hd"><h2>Principais fornecedores</h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><tbody>' +
      (rk.length ? rk.map(x => '<tr><td>' + U.esc(D.fornecedorNome(x.k)) + '</td><td class="n">' + U.money(x.v) + '</td></tr>').join('') : '<tr><td>' + UI.empty('Sem pedidos ainda', '') + '</td></tr>') +
      '</tbody></table></div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Atividade recente</h2></div><div class="bd"><ul class="timeline">' +
      (S.db.log.slice(0, 8).map(l => '<li><span>' + U.dateTime(l.data) + '</span><div>' + U.esc(l.texto) + '</div></li>').join('') || '<li><span></span><div class="muted">Nenhuma atividade</div></li>') +
      '</ul></div></div></div>';

    UI.render(h);
  };
})(window);
