/* Painel: visão geral do processo de compras.
   Valores (comprado, economia, gastos por centro de custo e por fornecedor) são dados sensíveis:
   aparecem somente para usuários com a permissão "ver totalizadores". */
(function (root) {
  'use strict';
  const { U, S, D, UI, R, Auth } = root;
  const V = root.V = root.V || {};

  V.dashboard = function () {
    const perm = Auth.perm, eu = Auth.user;
    UI.setHeader('Painel de compras', 'Olá, ' + eu.nome.split(' ')[0],
      '<button class="btn pri" data-go="#/solicitacoes/nova">' + UI.icon('plus') + 'Nova solicitação</button>');
    const sols = S.all('solicitacoes').filter(s => R.podeVerSolicitacao(perm, eu, s));
    if (perm.basico) return painelBasico(sols);

    const cots = S.all('cotacoes');
    const peds = S.all('pedidos');
    const mes = U.today().slice(0, 7);
    const pedsMes = peds.filter(p => p.data.slice(0, 7) === mes && ['cancelado', 'reprovado', 'aguardando_aprovacao'].indexOf(p.status) < 0);
    const economia = U.sum(cots.filter(c => c.economia), c => c.economia.media);
    const abertas = sols.filter(s => s.status === 'aberta');
    const urg = sols.filter(s => s.prioridade === 'urgente' && ['aberta', 'em_cotacao'].indexOf(s.status) > -1);
    const cotAnd = cots.filter(c => c.status === 'aberta' || c.status === 'em_analise');
    const pedAb = peds.filter(p => ['emitido', 'enviado', 'recebido_parcial'].indexOf(p.status) > -1);
    const atrasados = pedAb.filter(p => p.previsaoEntrega && p.previsaoEntrega < U.today());
    const aAprovar = peds.filter(p => p.status === 'aguardando_aprovacao');
    const meusAprovar = aAprovar.filter(D.podeAprovar);
    const baixos = D.abaixoMinimo();
    const entPend = S.all('entregas').filter(e => e.status === 'aguardando_aceite');
    const entRec = S.all('entregas').filter(e => e.status === 'recusada');

    let h = '<div class="kpis">' +
      '<a class="kpi" href="#/solicitacoes"><span>Solicitações abertas</span><b>' + abertas.length + '</b><small>' + urg.length + ' urgente(s) aguardando</small></a>' +
      '<a class="kpi" href="#/cotacoes"><span>Cotações em andamento</span><b>' + cotAnd.length + '</b><small>' + U.sum(cotAnd, c => c.propostas.length) + ' proposta(s) recebida(s)</small></a>' +
      '<a class="kpi' + (meusAprovar.length ? ' hl' : '') + '" href="#/pedidos"><span>Pedidos aguardando aprovação</span><b>' + aAprovar.length + '</b><small>' + (meusAprovar.length ? meusAprovar.length + ' dentro da sua alçada' : 'nenhum na sua alçada') + '</small></a>' +
      '<a class="kpi" href="#/pedidos"><span>Pedidos a receber</span><b>' + pedAb.length + '</b><small>' + (atrasados.length ? atrasados.length + ' com entrega atrasada' : 'nenhum atrasado') + '</small></a>' +
      (perm.verTotalizadores ? '<div class="kpi"><span>Comprado no mês</span><b>' + U.money(U.sum(pedsMes, p => p.total)) + '</b><small>' + pedsMes.length + ' pedido(s)</small></div>' +
        '<div class="kpi hl"><span>Economia obtida</span><b>' + U.money(economia) + '</b><small>sobre a média das propostas</small></div>' : '') +
      '<a class="kpi' + (entRec.length ? ' hl' : '') + '" href="#/recebimentos"><span>Entregas aguardando aceite</span><b>' + entPend.length + '</b><small>' + (entRec.length ? entRec.length + ' recusada(s) pelo solicitante' : 'nenhuma recusada') + '</small></a>' +
      '<a class="kpi" href="#/estoque"><span>Abaixo do mínimo</span><b>' + baixos.length + '</b><small>produto(s) em estoque</small></a>' +
      '</div>';
    if (!perm.verTotalizadores) h += '<div class="note small">Os totalizadores de valores (compras, economia e gastos) são restritos. Peça acesso ao administrador se precisar deles.</div>';

    h += '<div class="grid g2">';
    h += '<div class="card"><div class="hd"><h2>Aguardando ação</h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><tbody>';
    const pend = [];
    meusAprovar.forEach(p => pend.push({ o: 0, h: '<tr class="click" data-go="#/pedidos/' + p.id + '"><td><b>' + p.numero + '</b><br><span class="muted small">' + U.esc(D.fornecedorNome(p.fornecedorId)) + '</span></td><td>Aprovar pedido (nível ' + D.nivelPedido(p) + ')</td><td><span class="tag urg">Alçada</span></td><td class="n">' + U.money(p.total) + '</td></tr>' }));
    abertas.forEach(s => pend.push({ o: s.prioridade === 'urgente' ? 1 : 2, h: '<tr class="click" data-go="#/solicitacoes/' + s.id + '"><td><b>' + s.numero + '</b><br><span class="muted small">' + U.esc(D.solicitanteNome(s)) + '</span></td><td>Enviar para cotação</td><td>' + (s.prioridade === 'urgente' ? '<span class="tag urg">Urgente</span>' : '') + '</td><td class="n">' + U.date(s.necessidade) + '</td></tr>' }));
    cotAnd.forEach(c => pend.push({ o: 3, h: '<tr class="click" data-go="#/cotacoes/' + c.id + '"><td><b>' + c.numero + '</b><br><span class="muted small">' + c.propostas.length + ' de ' + Math.max(c.fornecedorIds.length, c.propostas.length) + ' propostas</span></td><td>' + (c.propostas.length ? 'Analisar mapa e emitir pedido' : 'Lançar propostas') + '</td><td>' + UI.pill(D.STATUS_COT, c.status) + '</td><td class="n">' + U.date(c.prazoResposta) + '</td></tr>' }));
    atrasados.forEach(p => pend.push({ o: 1, h: '<tr class="click" data-go="#/pedidos/' + p.id + '"><td><b>' + p.numero + '</b><br><span class="muted small">' + U.esc(D.fornecedorNome(p.fornecedorId)) + '</span></td><td>Cobrar entrega</td><td><span class="tag urg">Atrasado</span></td><td class="n">' + U.date(p.previsaoEntrega) + '</td></tr>' }));
    entRec.forEach(e => pend.push({ o: 0, h: '<tr class="click" data-go="#/recebimentos"><td><b>' + e.numero + '</b><br><span class="muted small">' + U.esc(e.solicitacaoNumero || '') + '</span></td><td>Entrega recusada: ' + U.esc((e.aceite && e.aceite.obs) || '') + '</td><td><span class="tag urg">Recusada</span></td><td class="n">' + U.date(e.data) + '</td></tr>' }));
    pend.sort((a, b) => a.o - b.o);
    h += pend.length ? pend.slice(0, 10).map(x => x.h).join('') : '<tr><td>' + UI.empty('Nada pendente', 'Todas as solicitações e cotações estão em dia.') + '</td></tr>';
    h += '</tbody></table></div></div></div>';

    if (perm.verTotalizadores) {
      const porCC = {};
      peds.filter(p => ['cancelado', 'reprovado'].indexOf(p.status) < 0).forEach(p => p.itens.forEach(i => { porCC[i.centroCustoId || ''] = (porCC[i.centroCustoId || ''] || 0) + i.total; }));
      const ccs = Object.keys(porCC).map(k => ({ k: k, v: porCC[k] })).sort((a, b) => b.v - a.v);
      const max = ccs.length ? ccs[0].v : 1;
      h += '<div class="card"><div class="hd"><h2>Compras por centro de custo</h2></div><div class="bd">' +
        (ccs.length ? '<div class="bars">' + ccs.map(x => '<div class="bar"><span class="lbl" title="' + U.esc(D.centro(x.k)) + '">' + U.esc(x.k ? D.centro(x.k) : 'Sem centro') + '</span><span class="track"><i style="width:' + Math.max(2, x.v / max * 100) + '%"></i></span><b class="num">' + U.money(x.v) + '</b></div>').join('') + '</div>'
          : UI.empty('Sem pedidos ainda', 'Os valores aparecem aqui quando houver pedidos emitidos.')) + '</div></div>';
    } else {
      h += '<div class="card"><div class="hd"><h2>Situação das solicitações</h2></div><div class="bd">' + resumoStatus(sols) + '</div></div>';
    }
    h += '</div>';

    h += '<div class="grid g2">';
    if (perm.verTotalizadores) {
      const rank = {};
      peds.filter(p => ['cancelado', 'reprovado'].indexOf(p.status) < 0).forEach(p => { rank[p.fornecedorId] = (rank[p.fornecedorId] || 0) + p.total; });
      const rk = Object.keys(rank).map(k => ({ k: k, v: rank[k] })).sort((a, b) => b.v - a.v).slice(0, 6);
      h += '<div class="card"><div class="hd"><h2>Principais fornecedores</h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><tbody>' +
        (rk.length ? rk.map(x => '<tr><td>' + U.esc(D.fornecedorNome(x.k)) + '</td><td class="n">' + U.money(x.v) + '</td></tr>').join('') : '<tr><td>' + UI.empty('Sem pedidos ainda', '') + '</td></tr>') +
        '</tbody></table></div></div></div>';
    } else {
      h += '<div class="card"><div class="hd"><h2>Fluxo de compras</h2></div><div class="bd"><div class="steps">' + ['Solicitação', 'Cotação', 'Mapa', 'Aprovação', 'Pedido', 'Recebimento'].map(s => '<span class="done">' + s + '</span>').join('') + '</div></div></div>';
    }
    h += '<div class="card"><div class="hd"><h2>Atividade recente</h2></div><div class="bd"><ul class="timeline">' +
      (S.db.log.slice(0, 8).map(l => '<li><span>' + U.dateTime(l.data) + '</span><div>' + U.esc(l.texto) + '</div></li>').join('') || '<li><span></span><div class="muted">Nenhuma atividade</div></li>') +
      '</ul></div></div></div>';
    UI.render(h);
  };

  function resumoStatus(sols) {
    const cont = {};
    sols.forEach(s => { cont[s.status] = (cont[s.status] || 0) + 1; });
    const ks = Object.keys(D.STATUS_SOL).filter(k => cont[k]);
    return ks.length ? '<div class="chips">' + ks.map(k => UI.pill(D.STATUS_SOL, k) + ' <b>' + cont[k] + '</b>').join('&nbsp;&nbsp;') + '</div>' : '<p class="muted" style="margin:0">Nenhuma solicitação.</p>';
  }

  /* Painel do usuário básico: só as solicitações dele e dos seus centros de custo, sem valores */
  function painelBasico(sols) {
    const eu = Auth.user;
    const minhas = sols.filter(s => s.criadoPor === eu.id);
    const centros = (eu.centros || []).map(id => (S.find('centrosCusto', id) || {}).descricao).filter(Boolean);
    const aceitar = V.minhasEntregasPendentes();
    let h = (aceitar.length ? '<div class="note warn row">Você tem ' + aceitar.length + ' recebimento(s) de material para confirmar. <button class="btn sm pri" data-go="#/recebimentos">Confirmar recebimento</button></div>' : '') +
      '<div class="kpis">' +
      '<a class="kpi" href="#/solicitacoes"><span>Minhas solicitações abertas</span><b>' + minhas.filter(s => s.status === 'aberta').length + '</b><small>ainda podem ser alteradas por você</small></a>' +
      '<a class="kpi" href="#/solicitacoes"><span>Em cotação / pedido</span><b>' + minhas.filter(s => s.status === 'em_cotacao' || s.status === 'pedido').length + '</b><small>com o setor de compras</small></a>' +
      '<a class="kpi" href="#/solicitacoes"><span>Atendidas</span><b>' + minhas.filter(s => s.status === 'atendida').length + '</b><small>material recebido</small></a>' +
      '<a class="kpi" href="#/solicitacoes"><span>Do(s) meu(s) centro(s) de custo</span><b>' + sols.length + '</b><small>' + U.esc(centros.join(', ') || '—') + '</small></a>' +
      '</div>';
    h += '<div class="card"><div class="hd"><h2>Minhas solicitações recentes</h2></div><div class="bd flush"><div class="tbl-wrap">' +
      (minhas.length ? '<table class="tbl"><thead><tr><th>Número</th><th>Data</th><th>Itens</th><th>Destino</th><th>Status</th></tr></thead><tbody>' +
        minhas.slice().sort((a, b) => (b.numero > a.numero ? 1 : -1)).slice(0, 10).map(s => '<tr class="click" data-go="#/solicitacoes/' + s.id + '"><td class="strong">' + s.numero + '</td><td>' + U.date(s.data) + '</td><td>' + s.itens.length + '</td><td>' + UI.destinoTag(s.destino) + '</td><td>' + UI.pill(D.STATUS_SOL, s.status) + '</td></tr>').join('') + '</tbody></table>'
        : UI.empty('Você ainda não fez solicitações', '', '<button class="btn pri" data-go="#/solicitacoes/nova">' + UI.icon('plus') + 'Nova solicitação</button>')) +
      '</div></div></div>';
    h += '<div class="note small">Você pode alterar uma solicitação enquanto ela estiver "Aberta". Depois que entra em cotação, somente compradores e administradores podem alterá-la.</div>';
    UI.render(h);
  }
})(window);
