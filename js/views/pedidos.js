/* Pedidos de compra: lista, envio ao fornecedor, recebimento e cancelamento */
(function (root) {
  'use strict';
  const { U, S, D, UI, C, Docs } = root;
  const V = root.V = root.V || {};
  let filtroStatus = 'abertos';

  V.pedList = function () {
    UI.setHeader('Pedidos de compra', 'Processo', '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>');
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar"><select id="f-st"><option value="abertos">A receber</option><option value="">Todos</option>' +
      Object.keys(D.STATUS_PED).map(k => '<option value="' + k + '">' + D.STATUS_PED[k].t + '</option>').join('') + '</select><input type="search" id="f-q" placeholder="Buscar número ou fornecedor"></div><div class="acts muted small" id="tot"></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>');
    UI.$('#f-st', v).value = filtroStatus;
    let q = '';
    function draw() {
      const list = S.all('pedidos').filter(p => {
        if (filtroStatus === 'abertos' && ['emitido', 'enviado', 'recebido_parcial'].indexOf(p.status) < 0) return false;
        if (filtroStatus && filtroStatus !== 'abertos' && p.status !== filtroStatus) return false;
        if (q && U.norm(p.numero + ' ' + D.fornecedorNome(p.fornecedorId)).indexOf(U.norm(q)) < 0) return false;
        return true;
      }).sort((a, b) => (b.numero > a.numero ? 1 : -1));
      UI.$('#tot').textContent = list.length + ' pedido(s) · ' + U.money(U.sum(list, p => p.total));
      UI.$('#tb').innerHTML = list.length ? '<table class="tbl"><thead><tr><th>Número</th><th>Data</th><th>Fornecedor</th><th>Cotação</th><th class="n">Itens</th><th class="n">Total</th><th>Previsão</th><th>Status</th></tr></thead><tbody>' +
        list.map(p => {
          const atras = ['emitido', 'enviado', 'recebido_parcial'].indexOf(p.status) > -1 && p.previsaoEntrega < U.today();
          return '<tr class="click" data-go="#/pedidos/' + p.id + '"><td class="strong">' + p.numero + '</td><td>' + U.date(p.data) + '</td><td>' + U.esc(D.fornecedorNome(p.fornecedorId)) + '</td>' +
            '<td>' + U.esc((S.find('cotacoes', p.cotacaoId) || {}).numero || '') + '</td><td class="n">' + p.itens.length + '</td><td class="n">' + U.money(p.total) + '</td>' +
            '<td>' + U.date(p.previsaoEntrega) + (atras ? ' <span class="tag urg">Atrasado</span>' : '') + '</td><td>' + UI.pill(D.STATUS_PED, p.status) + '</td></tr>';
        }).join('') + '</tbody></table>' : UI.empty('Nenhum pedido', 'Os pedidos são gerados a partir do mapa comparativo da cotação.');
    }
    draw();
    UI.$('#f-st').onchange = e => { filtroStatus = e.target.value; draw(); };
    UI.$('#f-q').oninput = U.debounce(e => { q = e.target.value; draw(); }, 200);
    UI.$('#exp').onclick = () => {
      const rows = [['Pedido', 'Data', 'Fornecedor', 'CNPJ', 'Status', 'Item', 'Código', 'Descrição', 'Marca', 'Qtd', 'Unid', 'Preço unit.', 'Total', 'Destino', 'Centro de custo', 'Solicitação', 'Recebido']];
      S.all('pedidos').forEach(p => {
        const f = S.find('fornecedores', p.fornecedorId) || {};
        p.itens.forEach((i, n) => {
          const pr = S.find('produtos', i.produtoId);
          rows.push([p.numero, U.date(p.data), f.razao || '', f.cnpj || '', D.STATUS_PED[p.status].t, n + 1, pr ? pr.codigo : '', i.descricao, i.marca, i.qtd, i.unidade, U.round(i.unitLiquido, 4), U.round(i.total, 2), D.DESTINO[i.destino], D.centro(i.centroCustoId), (S.find('solicitacoes', i.solicitacaoId) || {}).numero || '', i.recebido || 0]);
        });
      });
      C.writeXlsx('pedidos.xlsx', { 'Pedidos': rows }).catch(err => UI.toast(err.message, 'bad'));
    };
  };

  V.pedView = function (id) {
    const ped = S.find('pedidos', id);
    if (!ped) { location.hash = '#/pedidos'; return; }
    const f = S.find('fornecedores', ped.fornecedorId) || {};
    const aberto = ['emitido', 'enviado', 'recebido_parcial'].indexOf(ped.status) > -1;
    UI.setHeader('Pedido ' + ped.numero, 'Pedidos de compra',
      '<button class="btn" data-go="#/pedidos">' + UI.icon('back') + 'Voltar</button>' +
      '<button class="btn" id="prt">' + UI.icon('print') + 'Imprimir / PDF</button>' +
      (aberto ? '<button class="btn pri" id="rec">' + UI.icon('box') + 'Registrar recebimento</button>' : ''));

    const idx = { emitido: 0, enviado: 1, recebido_parcial: 2, recebido: 3 }[ped.status];
    let h = '<div class="card"><div class="bd"><div class="row" style="justify-content:space-between"><div class="steps">' +
      ['Emitido', 'Enviado ao fornecedor', 'Recebimento parcial', 'Recebido'].map((t, i) => '<span class="' + (idx === undefined ? '' : i < idx ? 'done' : i === idx ? 'now' : '') + '">' + t + '</span>').join('') +
      '</div>' + UI.pill(D.STATUS_PED, ped.status) + '</div></div></div>';
    h += '<div class="grid g2"><div class="card"><div class="hd"><h2>Fornecedor</h2></div><div class="bd"><dl class="kv">' +
      '<dt>Razão social</dt><dd>' + U.esc(f.razao || '—') + '</dd><dt>CNPJ</dt><dd>' + U.esc(f.cnpj || '—') + '</dd>' +
      '<dt>Contato</dt><dd>' + U.esc([f.contato, f.telefone, f.email].filter(Boolean).join(' · ') || '—') + '</dd></dl>' +
      '<div class="row" style="margin-top:12px"><button class="btn sm" id="mail">' + UI.icon('mail') + 'Enviar por e-mail</button><button class="btn sm" id="wa">' + UI.icon('whats') + 'WhatsApp</button><button class="btn sm" id="cp">' + UI.icon('copy') + 'Copiar texto</button>' +
      (ped.status === 'emitido' ? '<button class="btn sm sun" id="sent">' + UI.icon('check') + 'Marcar como enviado</button>' : '') + '</div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Condições</h2></div><div class="bd"><div class="form">' +
      '<div class="f s6"><label for="pd-pag">Pagamento</label><input id="pd-pag" value="' + U.esc(ped.condPagamento) + '"' + (aberto ? '' : ' disabled') + '></div>' +
      '<div class="f s6"><label for="pd-prev">Previsão de entrega</label><input type="date" id="pd-prev" value="' + U.esc(ped.previsaoEntrega) + '"' + (aberto ? '' : ' disabled') + '></div>' +
      '<div class="f s6"><label for="pd-loc">Local de entrega</label><input id="pd-loc" value="' + U.esc(ped.localEntrega) + '"' + (aberto ? '' : ' disabled') + '></div>' +
      '<div class="f s6"><label>Comprador(a) · Cotação</label><div style="padding-top:8px">' + U.esc(D.pessoa('compradores', ped.compradorId)) + ' · ' + ((S.find('cotacoes', ped.cotacaoId) || {}).numero ? '<a href="#/cotacoes/' + ped.cotacaoId + '/mapa">' + S.find('cotacoes', ped.cotacaoId).numero + '</a>' : '—') + '</div></div>' +
      '<div class="f s12"><label for="pd-obs">Observações do pedido</label><textarea id="pd-obs" rows="2"' + (aberto ? '' : ' disabled') + '>' + U.esc(ped.obs) + '</textarea></div>' +
      '</div></div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Itens</h2></div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Marca</th><th class="n">Qtd</th><th>Unid</th><th class="n">Preço unit.</th><th class="n">Total</th><th>Destino</th><th>Solicitação</th><th class="n">Recebido</th></tr></thead><tbody>' +
      ped.itens.map((i, n) => {
        const p = S.find('produtos', i.produtoId);
        const s = S.find('solicitacoes', i.solicitacaoId);
        return '<tr><td>' + (n + 1) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(i.descricao) + '</td><td>' + U.esc(i.marca) + '</td><td class="n">' + U.num(i.qtd) + '</td><td>' + U.esc(i.unidade) + '</td>' +
          '<td class="n">' + U.money(i.unitLiquido) + '</td><td class="n">' + U.money(i.total) + '</td><td>' + UI.destinoTag(i.destino) + '</td><td>' + (s ? '<a href="#/solicitacoes/' + s.id + '">' + s.numero + '</a>' : '') + '</td>' +
          '<td class="n">' + U.num(i.recebido || 0) + ((i.recebido || 0) >= i.qtd ? ' ✔' : '') + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="7" class="n">Subtotal' + (ped.frete ? ' + frete ' + U.money(ped.frete) : '') + '</td><td class="n">' + U.money(ped.total) + '</td><td colspan="3"></td></tr></tfoot></table></div></div></div>';
    if (ped.recebimentos.length) {
      h += '<div class="card"><div class="hd"><h2>Recebimentos</h2></div><div class="bd"><ul class="timeline">' +
        ped.recebimentos.map(r => '<li><span>' + U.date(r.data) + '</span><div>' + (r.nf ? 'NF ' + U.esc(r.nf) + ' — ' : '') + Object.keys(r.itens).map(k => { const it = ped.itens.find(x => x.id === k); return it ? U.num(r.itens[k]) + ' ' + it.unidade + ' ' + U.esc(it.descricao) : ''; }).join('; ') + '</div></li>').join('') + '</ul></div></div>';
    }
    if (aberto && !ped.recebimentos.length) h += '<div class="row"><button class="btn danger" id="cancel">' + UI.icon('x') + 'Cancelar pedido</button></div>';
    UI.render(h);

    const saveField = (sel, k) => { const e = UI.$(sel); if (e) e.onchange = () => { ped[k] = e.value; S.save(); }; };
    saveField('#pd-pag', 'condPagamento'); saveField('#pd-prev', 'previsaoEntrega'); saveField('#pd-loc', 'localEntrega'); saveField('#pd-obs', 'obs');
    UI.$('#prt').onclick = () => UI.print(Docs.pedidoHtml(ped));
    const enviado = meio => {
      if (ped.status === 'emitido') { ped.status = 'enviado'; ped.enviadoEm = U.nowIso(); ped.enviadoPor = meio; S.log('Pedido ' + ped.numero + ' enviado (' + meio + ')'); S.save(); V.pedView(id); }
    };
    UI.$('#mail').onclick = () => {
      location.href = Docs.mailto(f.email, 'Pedido de compra ' + ped.numero + ' — ' + S.config().empresa.nome, Docs.pedidoTexto(ped) + '\n\n(Anexe o PDF gerado em "Imprimir / PDF".)');
      enviado('e-mail');
    };
    UI.$('#wa').onclick = () => { window.open(Docs.whatsapp(f.whatsapp || f.telefone, Docs.pedidoTexto(ped)), '_blank'); enviado('WhatsApp'); };
    UI.$('#cp').onclick = () => UI.copy(Docs.pedidoTexto(ped));
    if (UI.$('#sent')) UI.$('#sent').onclick = () => enviado('manual');
    if (UI.$('#cancel')) UI.$('#cancel').onclick = async () => {
      if (!(await UI.confirm('Cancelar o pedido ' + ped.numero + '? As solicitações ligadas voltam para "Aberta" para nova cotação.', 'Cancelar pedido'))) return;
      ped.status = 'cancelado';
      new Set(ped.itens.map(i => i.solicitacaoId)).forEach(sid => {
        const s = S.find('solicitacoes', sid);
        if (s && s.status === 'pedido') { s.status = 'aberta'; s.historico.push({ data: U.nowIso(), evento: 'Pedido ' + ped.numero + ' cancelado' }); }
      });
      S.log('Pedido ' + ped.numero + ' cancelado');
      S.save();
      V.pedView(id);
    };
    if (UI.$('#rec')) UI.$('#rec').onclick = () => V.receber(ped);
  };

  V.receber = function (ped) {
    const pend = ped.itens.filter(i => (Number(i.recebido) || 0) < i.qtd);
    UI.modal({
      title: 'Recebimento — ' + ped.numero, size: 'wide',
      body: '<div class="form"><div class="f s4"><label for="r-data">Data</label><input type="date" id="r-data" value="' + U.today() + '"></div><div class="f s4"><label for="r-nf">Nota fiscal</label><input id="r-nf" placeholder="Número da NF"></div></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="n">Pedido</th><th class="n">Já recebido</th><th class="n" style="width:130px">Recebendo agora</th><th>Destino</th></tr></thead><tbody>' +
        pend.map(i => '<tr><td>' + U.esc(i.descricao) + '</td><td class="n">' + U.num(i.qtd) + ' ' + U.esc(i.unidade) + '</td><td class="n">' + U.num(i.recebido || 0) + '</td>' +
          '<td><input class="n" data-rid="' + i.id + '" value="' + U.num(i.qtd - (i.recebido || 0)) + '" aria-label="Quantidade recebida"></td><td>' + UI.destinoTag(i.destino) + '</td></tr>').join('') +
        '</tbody></table></div><p class="small muted" style="margin:0">Itens para estoque entram no saldo. Itens de aplicação direta são registrados como entrada e saída imediata para o centro de custo.</p>',
      buttons: [{ label: 'Cancelar' }, { label: 'Confirmar recebimento', cls: 'pri', icon: 'check', action: m => {
        const q = {};
        let any = false;
        UI.$$('[data-rid]', m.el).forEach(inp => { const v = U.parseNum(inp.value); if (v > 0) { q[inp.dataset.rid] = v; any = true; } });
        if (!any) { UI.toast('Informe a quantidade recebida', 'bad'); return false; }
        D.receber(ped, q, UI.$('#r-nf', m.el).value.trim(), UI.$('#r-data', m.el).value);
        UI.toast('Recebimento registrado', 'ok');
        V.pedView(ped.id);
      } }]
    });
  };
})(window);
