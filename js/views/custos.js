/* Custos por equipamento e por despesa de uso coletivo.
   Fonte: consumos (saídas) apropriados — retiradas do estoque e compras de aplicação direta.
   Dado sensível: só para usuários com permissão de ver totalizadores. */
(function (root) {
  'use strict';
  const { U, S, D, UI, C, Auth } = root;
  const V = root.V = root.V || {};

  const AGRUPAR = {
    apropriacao: 'Equipamento / despesa',
    centro: 'Centro de custo',
    tipo: 'Tipo de equipamento / grupo de despesa',
    categoria: 'Categoria do produto',
    produto: 'Produto',
    fornecedor: 'Fornecedor',
    origem: 'Origem (estoque × compra)',
    mes: 'Mês'
  };

  function linhas() {
    return S.all('movimentos').filter(m => m.tipo === 'saida').map(m => {
      const p = S.find('produtos', m.produtoId) || {};
      const eq = m.equipamentoId ? S.find('equipamentos', m.equipamentoId) : null;
      const cat = m.categoriaDespesaId ? S.find('categoriasDespesa', m.categoriaDespesaId) : null;
      const qtd = Number(m.qtd) || 0, unit = Number(m.custoUnit) || 0;
      return {
        m: m, data: m.data, mes: String(m.data || '').slice(0, 7), qtd: qtd, unit: unit, total: qtd * unit,
        produtoId: m.produtoId, produto: (p.codigo ? p.codigo + ' · ' : '') + (p.descricao || m.descricao || '—'), unidade: p.unidade || '',
        categoria: m.categoria || p.categoria || 'Sem categoria',
        centroId: m.centroCustoId || (eq && eq.centroCustoId) || '',
        tipoAprop: eq ? 'equipamento' : cat ? 'despesa' : 'nenhuma',
        apropId: eq ? 'eq:' + eq.id : cat ? 'cat:' + cat.id : 'nenhuma',
        aprop: eq ? (eq.codigo ? eq.codigo + ' · ' : '') + eq.descricao : cat ? 'Despesa: ' + cat.descricao : 'Não apropriado (só centro de custo)',
        tipo: eq ? (eq.tipo || 'Equipamento sem tipo') : cat ? 'Despesas — ' + (cat.grupo || 'sem grupo') : 'Não apropriado',
        fornecedorId: m.fornecedorId || '', fornecedor: m.fornecedorId ? D.fornecedorNome(m.fornecedorId) : (/estoque/i.test(m.origem || '') ? 'Estoque (custo médio)' : '—'),
        origem: /compra|Aplicação direta/i.test(m.origem || '') ? 'Compra para aplicação direta' : /estoque/i.test(m.origem || '') ? 'Retirada do estoque' : (m.origem || 'Outros'),
        doc: m.doc || ''
      };
    });
  }

  V.custos = function () {
    if (!Auth.perm.verTotalizadores) {
      UI.setHeader('Custos por equipamento', 'Relatórios');
      UI.render('<div class="card">' + UI.empty('Acesso restrito', 'Os custos são dados sensíveis. Peça ao administrador a permissão "Ver totalizadores".') + '</div>');
      return;
    }
    const pre = V.custosFiltro || {};
    V.custosFiltro = null;
    const f = Object.assign({ de: U.addDays(U.today(), -90), ate: U.today(), centro: '', tipoAprop: '', alvo: '', categoria: '', fornecedor: '', origem: '', agrupar: 'apropriacao' }, V._custosUlt || {}, pre.equipamentoId ? { alvo: 'eq:' + pre.equipamentoId, de: '2000-01-01' } : {});
    UI.setHeader('Custos por equipamento e despesa', 'Relatórios',
      '<button class="btn" id="xls">' + UI.icon('download') + 'Excel</button><button class="btn" id="prt">' + UI.icon('print') + 'Imprimir</button>');
    const todas = linhas();
    const cats = Array.from(new Set(todas.map(l => l.categoria))).sort();
    const forns = Array.from(new Set(todas.filter(l => l.fornecedorId).map(l => l.fornecedorId)));
    const alvos = S.all('equipamentos').map(e => ['eq:' + e.id, 'Equip. ' + (e.codigo ? e.codigo + ' · ' : '') + e.descricao])
      .concat(S.all('categoriasDespesa').map(c => ['cat:' + c.id, 'Despesa: ' + c.descricao]));
    const v = UI.render('<div class="card"><div class="bd"><div class="form">' +
      '<div class="f s2"><label for="c-de">De</label><input type="date" id="c-de" value="' + f.de + '"></div>' +
      '<div class="f s2"><label for="c-ate">Até</label><input type="date" id="c-ate" value="' + f.ate + '"></div>' +
      '<div class="f s4"><label for="c-cc">Centro de custo</label><select id="c-cc">' + UI.options(S.all('centrosCusto'), f.centro, c => c.codigo + ' · ' + c.descricao, 'Todos') + '</select></div>' +
      '<div class="f s4"><label for="c-ta">Apropriação</label><select id="c-ta"><option value="">Equipamentos e despesas</option><option value="equipamento">Somente equipamentos</option><option value="despesa">Somente despesas de uso coletivo</option><option value="nenhuma">Não apropriados</option></select></div>' +
      '<div class="f s4"><label for="c-alvo">Equipamento / categoria de despesa</label><select id="c-alvo"><option value="">Todos</option>' + alvos.map(a => '<option value="' + a[0] + '"' + (a[0] === f.alvo ? ' selected' : '') + '>' + U.esc(a[1]) + '</option>').join('') + '</select></div>' +
      '<div class="f s3"><label for="c-cat">Categoria do produto</label><select id="c-cat"><option value="">Todas</option>' + cats.map(c => '<option' + (c === f.categoria ? ' selected' : '') + '>' + U.esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="f s3"><label for="c-forn">Fornecedor</label><select id="c-forn"><option value="">Todos</option>' + forns.map(id => '<option value="' + id + '"' + (id === f.fornecedor ? ' selected' : '') + '>' + U.esc(D.fornecedorNome(id)) + '</option>').join('') + '</select></div>' +
      '<div class="f s2"><label for="c-or">Origem</label><select id="c-or"><option value="">Todas</option><option>Retirada do estoque</option><option>Compra para aplicação direta</option></select></div>' +
      '<div class="f s4"><label for="c-ag">Agrupar por</label><select id="c-ag">' + Object.keys(AGRUPAR).map(k => '<option value="' + k + '"' + (k === f.agrupar ? ' selected' : '') + '>' + AGRUPAR[k] + '</option>').join('') + '</select></div>' +
      '</div></div></div><div id="res"></div>');
    UI.$('#c-ta', v).value = f.tipoAprop;
    UI.$('#c-or', v).value = f.origem;

    let atual = [], grupos = [];
    function calcular() {
      Object.assign(f, { de: UI.$('#c-de').value, ate: UI.$('#c-ate').value, centro: UI.$('#c-cc').value, tipoAprop: UI.$('#c-ta').value, alvo: UI.$('#c-alvo').value, categoria: UI.$('#c-cat').value, fornecedor: UI.$('#c-forn').value, origem: UI.$('#c-or').value, agrupar: UI.$('#c-ag').value });
      V._custosUlt = Object.assign({}, f);
      atual = todas.filter(l => (!f.de || l.data >= f.de) && (!f.ate || l.data <= f.ate) && (!f.centro || l.centroId === f.centro) &&
        (!f.tipoAprop || l.tipoAprop === f.tipoAprop) && (!f.alvo || l.apropId === f.alvo) && (!f.categoria || l.categoria === f.categoria) &&
        (!f.fornecedor || l.fornecedorId === f.fornecedor) && (!f.origem || l.origem === f.origem));
      const chave = {
        apropriacao: l => [l.apropId, l.aprop], centro: l => [l.centroId, l.centroId ? D.centro(l.centroId) : 'Sem centro'], tipo: l => [l.tipo, l.tipo],
        categoria: l => [l.categoria, l.categoria], produto: l => [l.produtoId, l.produto], fornecedor: l => [l.fornecedor, l.fornecedor],
        origem: l => [l.origem, l.origem], mes: l => [l.mes, l.mes ? l.mes.slice(5) + '/' + l.mes.slice(0, 4) : '—']
      }[f.agrupar];
      const mapa = {};
      atual.forEach(l => {
        const [k, nome] = chave(l);
        const g = mapa[k] = mapa[k] || { k: k, nome: nome, total: 0, n: 0, qtd: 0, estoque: 0, compra: 0, linhas: [] };
        g.total += l.total; g.n++; g.qtd += l.qtd; g.linhas.push(l);
        if (l.origem === 'Retirada do estoque') g.estoque += l.total; else g.compra += l.total;
      });
      grupos = Object.values(mapa).sort((a, b) => (f.agrupar === 'mes' ? (a.k > b.k ? 1 : -1) : b.total - a.total));
      const total = U.sum(atual, l => l.total);
      const nEq = new Set(atual.filter(l => l.tipoAprop === 'equipamento').map(l => l.apropId)).size;
      const totEq = U.sum(atual.filter(l => l.tipoAprop === 'equipamento'), l => l.total);
      const totDesp = U.sum(atual.filter(l => l.tipoAprop === 'despesa'), l => l.total);
      const max = grupos.length ? Math.max.apply(null, grupos.map(g => g.total)) : 1;
      let h = '<div class="kpis">' +
        '<div class="kpi hl"><span>Custo no período</span><b>' + U.money(total) + '</b><small>' + atual.length + ' lançamento(s) · ' + U.date(f.de) + ' a ' + U.date(f.ate) + '</small></div>' +
        '<div class="kpi"><span>Em equipamentos</span><b>' + U.money(totEq) + '</b><small>' + nEq + ' equipamento(s) · média ' + U.money(nEq ? totEq / nEq : 0) + '</small></div>' +
        '<div class="kpi"><span>Despesas de uso coletivo</span><b>' + U.money(totDesp) + '</b><small>' + (total ? U.pct(totDesp / total * 100) : '0%') + ' do total</small></div>' +
        '<div class="kpi"><span>Retirado do estoque × comprado</span><b>' + U.pct(total ? U.sum(atual.filter(l => l.origem === 'Retirada do estoque'), l => l.total) / total * 100 : 0) + '</b><small>do custo veio do estoque</small></div>' +
        '</div>';
      h += '<div class="card"><div class="hd"><h2>Total por ' + U.esc(AGRUPAR[f.agrupar].toLowerCase()) + '</h2></div><div class="bd flush"><div class="tbl-wrap">' +
        (grupos.length ? '<table class="tbl"><thead><tr><th>' + U.esc(AGRUPAR[f.agrupar]) + '</th><th style="width:30%"></th><th class="n">Lançamentos</th><th class="n">Do estoque</th><th class="n">Compra direta</th><th class="n">Total</th><th class="n">%</th></tr></thead><tbody>' +
          grupos.map((g, i) => '<tr class="click" data-g="' + i + '"><td><b>' + U.esc(g.nome) + '</b></td><td><span class="track" style="display:block;height:10px;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;overflow:hidden"><i style="display:block;height:100%;background:var(--brand);width:' + Math.max(1, g.total / max * 100) + '%"></i></span></td>' +
            '<td class="n">' + g.n + '</td><td class="n">' + U.money(g.estoque) + '</td><td class="n">' + U.money(g.compra) + '</td><td class="n strong">' + U.money(g.total) + '</td><td class="n">' + U.pct(total ? g.total / total * 100 : 0) + '</td></tr>').join('') +
          '</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">' + U.money(U.sum(grupos, g => g.estoque)) + '</td><td class="n">' + U.money(U.sum(grupos, g => g.compra)) + '</td><td class="n">' + U.money(total) + '</td><td class="n">100%</td></tr></tfoot></table>'
          : UI.empty('Nenhum custo no período', 'Os custos aparecem quando materiais de aplicação direta são retirados do estoque ou recebidos de compras.')) +
        '</div></div></div>';
      h += '<div class="card"><div class="hd"><h2>Detalhamento</h2><span class="small muted">Clique numa linha do total para filtrar</span></div><div class="bd flush"><div class="tbl-wrap" id="det"></div></div></div>';
      UI.$('#res').innerHTML = h;
      detalhe(atual);
    }
    function detalhe(ls) {
      UI.$('#det').innerHTML = ls.length ? '<table class="tbl"><thead><tr><th>Data</th><th>Documento</th><th>Equipamento / despesa</th><th>Centro de custo</th><th>Produto</th><th>Categoria</th><th class="n">Qtd</th><th class="n">Unit.</th><th class="n">Total</th><th>Origem / fornecedor</th></tr></thead><tbody>' +
        ls.slice().sort((a, b) => (b.data > a.data ? 1 : -1)).slice(0, 500).map(l => '<tr><td>' + U.date(l.data) + '</td><td class="small">' + U.esc(l.doc) + '</td><td>' + U.esc(l.aprop) + '</td><td class="small">' + U.esc(l.centroId ? D.centro(l.centroId) : '—') + '</td>' +
          '<td>' + U.esc(l.produto) + '</td><td class="small">' + U.esc(l.categoria) + '</td><td class="n">' + U.num(l.qtd) + ' ' + U.esc(l.unidade) + '</td><td class="n">' + U.money(l.unit) + '</td><td class="n">' + U.money(l.total) + '</td><td class="small">' + U.esc(l.origem) + '<br>' + U.esc(l.fornecedor) + '</td></tr>').join('') +
        '</tbody></table>' : '';
    }
    calcular();
    UI.$$('select, input', v).forEach(el => el.addEventListener('change', calcular));
    UI.$('#res').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-g]');
      if (!tr) return;
      UI.$$('#res tr[data-g]').forEach(x => x.classList.toggle('sel-row', x === tr));
      detalhe(grupos[Number(tr.dataset.g)].linhas);
    });
    UI.$('#xls').onclick = () => {
      const resumo = [['Custos — ' + AGRUPAR[f.agrupar], 'de ' + U.date(f.de) + ' a ' + U.date(f.ate)], [], [AGRUPAR[f.agrupar], 'Lançamentos', 'Do estoque', 'Compra direta', 'Total']];
      grupos.forEach(g => resumo.push([g.nome, g.n, U.round(g.estoque), U.round(g.compra), U.round(g.total)]));
      const det = [['Data', 'Documento', 'Equipamento / despesa', 'Tipo', 'Centro de custo', 'Produto', 'Categoria', 'Qtd', 'Unid', 'Unitário', 'Total', 'Origem', 'Fornecedor']];
      atual.forEach(l => det.push([U.date(l.data), l.doc, l.aprop, l.tipo, l.centroId ? D.centro(l.centroId) : '', l.produto, l.categoria, l.qtd, l.unidade, U.round(l.unit, 4), U.round(l.total), l.origem, l.fornecedor]));
      C.writeXlsx('custos-' + f.de + '-a-' + f.ate + '.xlsx', { Resumo: resumo, Detalhe: det }).catch(err => UI.toast(err.message, 'bad'));
    };
    UI.$('#prt').onclick = () => {
      const total = U.sum(atual, l => l.total);
      UI.print('<div class="doc"><div class="dh"><img src="assets/logo-brasmic.svg" alt="Brasmic"><div class="dt"><h1>Custos por ' + U.esc(AGRUPAR[f.agrupar].toLowerCase()) + '</h1><div>' + U.date(f.de) + ' a ' + U.date(f.ate) + '</div></div></div><div class="band"></div>' +
        '<table><thead><tr><th>' + U.esc(AGRUPAR[f.agrupar]) + '</th><th class="n">Lançamentos</th><th class="n">Do estoque</th><th class="n">Compra direta</th><th class="n">Total</th></tr></thead><tbody>' +
        grupos.map(g => '<tr><td>' + U.esc(g.nome) + '</td><td class="n">' + g.n + '</td><td class="n">' + U.money(g.estoque) + '</td><td class="n">' + U.money(g.compra) + '</td><td class="n">' + U.money(g.total) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">' + U.money(total) + '</td></tr></tfoot></table></div>');
    };
  };
})(window);
