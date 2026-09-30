/* Estoque: saldos, entradas, saídas e reposição automática pelo estoque mínimo */
(function (root) {
  'use strict';
  const { U, S, D, UI, C } = root;
  const V = root.V = root.V || {};
  let aba = 'saldo', q = '';

  V.estoque = function () {
    UI.setHeader('Estoque', 'Processo',
      '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>' +
      '<button class="btn" id="ent">' + UI.icon('plus') + 'Entrada</button>' +
      '<button class="btn" id="sai">' + UI.icon('upload') + 'Saída</button>' +
      '<button class="btn sun" id="rep">' + UI.icon('req') + 'Gerar reposição</button>');
    const baixos = D.abaixoMinimo();
    const v = UI.render((baixos.length ? '<div class="note warn">' + baixos.length + ' produto(s) abaixo do estoque mínimo: ' + baixos.slice(0, 6).map(p => U.esc(p.descricao)).join(', ') + (baixos.length > 6 ? '…' : '') + '. Use “Gerar reposição” para criar a solicitação de compra automaticamente.</div>' : '') +
      '<div class="tabs"><button data-t="saldo" class="' + (aba === 'saldo' ? 'on' : '') + '">Saldos</button><button data-t="mov" class="' + (aba === 'mov' ? 'on' : '') + '">Movimentações</button></div>' +
      '<div class="card"><div class="hd"><div class="toolbar"><input type="search" id="q" placeholder="Buscar produto" value="' + U.esc(q) + '"></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>');

    function draw() {
      const nq = U.norm(q);
      if (aba === 'saldo') {
        const movs = S.all('movimentos');
        const prods = S.all('produtos').filter(p => movs.some(m => m.produtoId === p.id) || Number(p.estoqueMin) > 0)
          .filter(p => !nq || U.norm(p.codigo + ' ' + p.descricao).indexOf(nq) > -1)
          .map(p => ({ p: p, s: D.saldo(p.id), c: D.custoMedio(p.id) }))
          .sort((a, b) => (a.s < Number(a.p.estoqueMin)) === (b.s < Number(b.p.estoqueMin)) ? a.p.descricao.localeCompare(b.p.descricao) : (a.s < Number(a.p.estoqueMin) ? -1 : 1));
        UI.$('#tb').innerHTML = prods.length ? '<table class="tbl"><thead><tr><th>Código</th><th>Produto</th><th>Unid</th><th class="n">Saldo</th><th class="n">Mínimo</th><th class="n">Custo médio</th><th class="n">Valor em estoque</th><th>Situação</th></tr></thead><tbody>' +
          prods.map(x => '<tr><td>' + U.esc(x.p.codigo) + '</td><td>' + U.esc(x.p.descricao) + '</td><td>' + U.esc(x.p.unidade) + '</td><td class="n strong">' + U.num(x.s) + '</td><td class="n">' + U.num(x.p.estoqueMin || 0) + '</td>' +
            '<td class="n">' + (x.c ? U.money(x.c) : '—') + '</td><td class="n">' + U.money(Math.max(0, x.s) * x.c) + '</td><td>' + (Number(x.p.estoqueMin) && x.s < Number(x.p.estoqueMin) ? '<span class="pill bad">Abaixo do mínimo</span>' : '<span class="pill ok">Normal</span>') + '</td></tr>').join('') +
          '</tbody><tfoot><tr><td colspan="6">Valor total em estoque</td><td class="n">' + U.money(U.sum(prods, x => Math.max(0, x.s) * x.c)) + '</td><td></td></tr></tfoot></table>'
          : UI.empty('Sem itens em estoque', 'Os saldos aparecem ao receber pedidos com destino estoque ou ao lançar entradas.');
      } else {
        const movs = S.all('movimentos').filter(m => { const p = S.find('produtos', m.produtoId); return !nq || (p && U.norm(p.codigo + ' ' + p.descricao + ' ' + m.doc).indexOf(nq) > -1); })
          .sort((a, b) => (b.data + (b.criadoEm || '') > a.data + (a.criadoEm || '') ? 1 : -1));
        UI.$('#tb').innerHTML = movs.length ? '<table class="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th class="n">Qtd</th><th>Documento</th><th>Origem / destino</th><th>Centro de custo</th><th></th></tr></thead><tbody>' +
          movs.map(m => { const p = S.find('produtos', m.produtoId) || {}; return '<tr><td>' + U.date(m.data) + '</td><td>' + (m.tipo === 'entrada' ? '<span class="pill ok">Entrada</span>' : '<span class="pill warn">Saída</span>') + '</td>' +
            '<td>' + U.esc((p.codigo || '') + ' ' + (p.descricao || '')) + '</td><td class="n">' + U.num(m.qtd) + ' ' + U.esc(p.unidade || '') + '</td><td>' + U.esc(m.doc) + '</td><td>' + U.esc(m.origem) + (m.obs ? ' · ' + U.esc(m.obs) : '') + '</td>' +
            '<td>' + (m.centroCustoId ? U.esc(D.centro(m.centroCustoId)) : '') + '</td><td class="act">' + (m.manual ? '<button class="btn icon ghost danger" data-del="' + m.id + '" title="Excluir movimentação" aria-label="Excluir movimentação">' + UI.icon('trash') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>'
          : UI.empty('Sem movimentações', '');
      }
    }
    draw();
    UI.$$('.tabs button', v).forEach(b => { b.onclick = () => { aba = b.dataset.t; V.estoque(); }; });
    UI.$('#q').oninput = U.debounce(e => { q = e.target.value; draw(); }, 200);
    UI.$('#tb').addEventListener('click', async e => {
      const d = e.target.closest('[data-del]');
      if (!d) return;
      if (!(await UI.confirm('Excluir esta movimentação? O saldo será recalculado.', 'Excluir'))) return;
      S.remove('movimentos', d.dataset.del);
      draw();
    });
    UI.$('#ent').onclick = () => movForm('entrada');
    UI.$('#sai').onclick = () => movForm('saida');
    UI.$('#rep').onclick = () => {
      const s = D.gerarReposicao();
      if (!s) { UI.toast('Nenhum produto abaixo do estoque mínimo', 'ok'); return; }
      UI.toast('Solicitação ' + s.numero + ' criada — informe o solicitante e o centro de custo', 'ok');
      location.hash = '#/solicitacoes/' + s.id + '/editar';
    };
    UI.$('#exp').onclick = () => {
      const rows = [['Código', 'Produto', 'Unid', 'Saldo', 'Mínimo', 'Custo médio', 'Valor']];
      S.all('produtos').forEach(p => { const s = D.saldo(p.id), c = D.custoMedio(p.id); if (s || p.estoqueMin) rows.push([p.codigo, p.descricao, p.unidade, s, p.estoqueMin || 0, U.round(c, 4), U.round(Math.max(0, s) * c, 2)]); });
      const mv = [['Data', 'Tipo', 'Código', 'Produto', 'Qtd', 'Documento', 'Origem', 'Centro de custo']];
      S.all('movimentos').forEach(m => { const p = S.find('produtos', m.produtoId) || {}; mv.push([U.date(m.data), m.tipo, p.codigo, p.descricao, m.qtd, m.doc, m.origem, m.centroCustoId ? D.centro(m.centroCustoId) : '']); });
      C.writeXlsx('estoque.xlsx', { 'Saldos': rows, 'Movimentações': mv }).catch(err => UI.toast(err.message, 'bad'));
    };
  };

  function movForm(tipo) {
    const prods = S.all('produtos');
    UI.modal({
      title: tipo === 'entrada' ? 'Entrada de material' : 'Saída de material (requisição ao almoxarifado)',
      body: '<div class="form"><div class="f s8"><label for="m-p">Produto</label><select id="m-p">' + UI.options(prods, '', p => p.codigo + ' — ' + p.descricao + ' (saldo ' + U.num(D.saldo(p.id)) + ' ' + p.unidade + ')', 'Selecione…') + '</select></div>' +
        '<div class="f s4"><label for="m-q">Quantidade</label><input id="m-q" class="n" inputmode="decimal"></div>' +
        '<div class="f s4"><label for="m-d">Data</label><input type="date" id="m-d" value="' + U.today() + '"></div>' +
        '<div class="f s4"><label for="m-doc">Documento</label><input id="m-doc" placeholder="' + (tipo === 'entrada' ? 'NF / inventário' : 'Nº requisição de material') + '"></div>' +
        (tipo === 'entrada' ? '<div class="f s4"><label for="m-c">Custo unitário</label><input id="m-c" class="n" inputmode="decimal"></div>'
          : '<div class="f s4"><label for="m-cc">Centro de custo</label><select id="m-cc">' + UI.options(S.all('centrosCusto'), '', x => x.codigo + ' · ' + x.descricao, 'Selecione…') + '</select></div>' +
            '<div class="f s6"><label for="m-sol">Retirado por</label><select id="m-sol">' + UI.options(S.all('solicitantes'), '', x => x.nome, '—') + '</select></div>') +
        '<div class="f s12"><label for="m-obs">Observação</label><input id="m-obs"></div></div>',
      buttons: [{ label: 'Cancelar' }, { label: 'Registrar ' + tipo, cls: 'pri', action: m => {
        const pid = UI.$('#m-p', m.el).value;
        const qtd = U.parseNum(UI.$('#m-q', m.el).value);
        if (!pid || !(qtd > 0)) { UI.toast('Informe o produto e a quantidade', 'bad'); return false; }
        if (tipo === 'saida' && qtd > D.saldo(pid)) { UI.toast('Quantidade maior que o saldo disponível (' + U.num(D.saldo(pid)) + ')', 'bad'); return false; }
        if (tipo === 'saida' && !UI.$('#m-cc', m.el).value) { UI.toast('Informe o centro de custo da saída', 'bad'); return false; }
        const sol = tipo === 'saida' ? S.find('solicitantes', UI.$('#m-sol', m.el).value) : null;
        S.upsert('movimentos', {
          data: UI.$('#m-d', m.el).value, produtoId: pid, tipo: tipo, qtd: qtd, manual: true,
          custoUnit: tipo === 'entrada' ? U.parseNum(UI.$('#m-c', m.el).value) : D.custoMedio(pid),
          doc: UI.$('#m-doc', m.el).value.trim(), origem: tipo === 'entrada' ? 'Entrada manual' : 'Requisição de material' + (sol ? ' — ' + sol.nome : ''),
          centroCustoId: tipo === 'saida' ? UI.$('#m-cc', m.el).value : '', obs: UI.$('#m-obs', m.el).value.trim()
        });
        S.log((tipo === 'entrada' ? 'Entrada' : 'Saída') + ' de ' + U.num(qtd) + ' ' + (S.find('produtos', pid) || {}).descricao);
        UI.toast('Movimentação registrada', 'ok');
        V.estoque();
      } }]
    });
  }
})(window);
