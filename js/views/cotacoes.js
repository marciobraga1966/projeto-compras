/* Cotações: itens, fornecedores convidados, propostas (digitadas ou importadas) e mapa comparativo */
(function (root) {
  'use strict';
  const { U, S, D, UI, C, P, Docs, Auth } = root;
  const V = root.V = root.V || {};

  let filtroStatus = 'ativas';

  V.cotList = function () {
    UI.setHeader('Cotações', 'Processo',
      '<button class="btn pri" id="nova">' + UI.icon('plus') + 'Nova cotação</button>');
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar"><select id="f-st"><option value="ativas">Em andamento</option><option value="">Todas</option>' +
      Object.keys(D.STATUS_COT).map(k => '<option value="' + k + '">' + D.STATUS_COT[k].t + '</option>').join('') + '</select></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>');
    UI.$('#f-st', v).value = filtroStatus;
    function draw() {
      const list = S.all('cotacoes').filter(c => filtroStatus === 'ativas' ? (c.status === 'aberta' || c.status === 'em_analise') : (!filtroStatus || c.status === filtroStatus))
        .sort((a, b) => (b.numero > a.numero ? 1 : -1));
      UI.$('#tb').innerHTML = list.length ? '<table class="tbl"><thead><tr><th>Número</th><th>Data</th><th>Comprador(a)</th><th>Solicitações</th><th class="n">Itens</th><th class="n">Propostas</th><th>Responder até</th><th class="n">Melhor total</th><th>Status</th></tr></thead><tbody>' +
        list.map(c => {
          const m = D.mapa(c);
          return '<tr class="click" data-go="#/cotacoes/' + c.id + '"><td class="strong">' + c.numero + '</td><td>' + U.date(c.data) + '</td><td>' + U.esc(D.pessoa('compradores', c.compradorId)) + '</td>' +
            '<td>' + c.solicitacaoIds.map(id => (S.find('solicitacoes', id) || {}).numero).filter(Boolean).join(', ') + '</td><td class="n">' + c.itens.length + '</td>' +
            '<td class="n">' + c.propostas.length + ' / ' + Math.max(c.fornecedorIds.length, c.propostas.length) + '</td><td>' + U.date(c.prazoResposta) + '</td>' +
            '<td class="n">' + (m.totalMelhor ? U.money(m.totalMelhor) : '—') + '</td><td>' + UI.pill(D.STATUS_COT, c.status) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : UI.empty('Nenhuma cotação', 'Selecione solicitações abertas e clique em “Cotar selecionadas”, ou crie uma nova cotação aqui.');
    }
    draw();
    UI.$('#f-st').onchange = e => { filtroStatus = e.target.value; draw(); };
    UI.$('#nova').onclick = () => {
      const abertas = S.all('solicitacoes').filter(s => s.status === 'aberta');
      if (!abertas.length) { UI.toast('Não há solicitações abertas para cotar. Crie uma solicitação primeiro.', 'bad'); return; }
      UI.modal({
        title: 'Nova cotação', body: '<p class="muted small" style="margin:0">Escolha as solicitações abertas que entram nesta cotação. Os itens de todas serão cotados juntos com os mesmos fornecedores.</p>' +
          '<div class="tbl-wrap"><table class="tbl"><tbody>' + abertas.map(s => '<tr><td><input type="checkbox" value="' + s.id + '" id="ns-' + s.id + '"></td><td><label for="ns-' + s.id + '"><b>' + s.numero + '</b> · ' + U.esc(D.pessoa('solicitantes', s.solicitanteId)) + '</label></td><td>' + s.itens.length + ' itens</td><td>' + UI.destinoTag(s.destino) + '</td></tr>').join('') + '</tbody></table></div>' +
          '<div class="f"><label for="ns-comp">Comprador(a)</label><select id="ns-comp">' + UI.options(S.all('compradores'), '', x => x.nome, 'Selecione…') + '</select></div>',
        buttons: [{ label: 'Cancelar' }, { label: 'Criar cotação', cls: 'pri', action: m => {
          const ids = UI.$$('input[type=checkbox]:checked', m.el).map(x => x.value);
          if (!ids.length) { UI.toast('Selecione ao menos uma solicitação', 'bad'); return false; }
          const comp = UI.$('#ns-comp', m.el).value;
          setTimeout(() => V.iniciarCotacao(ids, comp), 0);
        } }]
      });
    };
  };

  /* Envio para cotação com verificação de estoque:
     itens de aplicação direta com saldo podem ser baixados do estoque e entregues ao solicitante;
     o comprador decide, item a item, se mantém a cotação (para repor o estoque) */
  V.iniciarCotacao = function (solIds, compradorId) {
    const comEstoque = D.itensComEstoque(solIds);
    const finalizar = (plano) => {
      const cot = D.criarCotacao(solIds, compradorId, plano);
      if (root.Cloud.ativo()) root.Cloud.gravarAgora().catch(err => UI.toast('Falha ao gravar no banco: ' + err.message, 'bad'));
      if (!cot) { UI.toast('Todos os itens foram atendidos pelo estoque. O solicitante deve confirmar o recebimento.', 'ok'); location.hash = '#/recebimentos'; return; }
      UI.toast('Cotação ' + cot.numero + ' criada', 'ok');
      location.hash = '#/cotacoes/' + cot.id + '/fornecedores';
    };
    if (!comEstoque.length) return finalizar({});
    UI.modal({
      title: 'Há saldo em estoque para itens desta solicitação', size: 'wide',
      body: '<p style="margin:0">Os itens abaixo são de <b>aplicação direta</b> e têm saldo no almoxarifado. Informe quanto retirar do estoque: a quantidade é baixada, lançada no custo do equipamento/despesa e entregue ao solicitante, que confirma o recebimento no portal. O restante segue para cotação.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Solicitação</th><th>Item</th><th class="n">Pendente</th><th class="n">Saldo</th><th class="n" style="width:120px">Retirar do estoque</th><th>Manter na cotação?</th></tr></thead><tbody>' +
        comEstoque.map((x, i) => '<tr data-i="' + i + '"><td>' + U.esc(x.sol.numero) + '<br><span class="small muted">' + U.esc(D.apropriacao(x.sol)) + '</span></td><td>' + U.esc(x.item.descricao) + '</td>' +
          '<td class="n">' + U.num(x.pendente) + ' ' + U.esc(x.item.unidade) + '</td><td class="n">' + U.num(x.saldo) + '</td>' +
          '<td><input class="n" data-ret value="' + U.num(x.sugerido) + '" aria-label="Quantidade a retirar"></td>' +
          '<td><label class="row small"><input type="checkbox" data-manter> Sim, cotar a reposição do estoque</label></td></tr>').join('') +
        '</tbody></table></div>' +
        '<p class="small muted" style="margin:0">"Manter na cotação" inclui na cotação a mesma quantidade retirada, com destino estoque, para repor o almoxarifado. Sem marcar, o item retirado não é cotado.</p>',
      buttons: [
        { label: 'Cancelar' },
        { label: 'Não usar o estoque — cotar tudo', action: () => finalizar({}) },
        { label: 'Baixar do estoque e continuar', cls: 'pri', icon: 'box', action: m => {
          const retiradas = [], plano = {};
          let erro = '';
          UI.$$('tr[data-i]', m.el).forEach(tr => {
            const x = comEstoque[Number(tr.dataset.i)];
            const q = U.parseNum(tr.querySelector('[data-ret]').value);
            if (q < 0 || q > Math.min(x.saldo, x.pendente) + 1e-9) erro = 'Quantidade a retirar de "' + x.item.descricao + '" deve ser entre 0 e ' + U.num(Math.min(x.saldo, x.pendente)) + '.';
            if (q > 0) retiradas.push({ solId: x.sol.id, itemId: x.item.id, qtd: q });
            plano[x.item.id] = { retirado: q, manter: tr.querySelector('[data-manter]').checked };
          });
          if (erro) { UI.toast(erro, 'bad'); return false; }
          const ents = D.atenderPeloEstoque(retiradas);
          if (ents.length) UI.toast(ents.length + ' entrega(s) pelo estoque registradas: ' + ents.map(e => e.numero).join(', '), 'ok');
          finalizar(plano);
        } }
      ]
    });
  };

  /* ---------- Detalhe ---------- */
  V.cotView = function (id, tab) {
    const cot = S.find('cotacoes', id);
    if (!cot) { location.hash = '#/cotacoes'; return; }
    tab = tab || (cot.propostas.length ? 'mapa' : 'fornecedores');
    const fechada = cot.status === 'finalizada' || cot.status === 'cancelada';
    UI.setHeader('Cotação ' + cot.numero, 'Cotações',
      '<button class="btn" data-go="#/cotacoes">' + UI.icon('back') + 'Voltar</button>' +
      (!fechada ? '<button class="btn" id="imp">' + UI.icon('upload') + 'Importar proposta</button><button class="btn pri" id="nprop">' + UI.icon('plus') + 'Lançar proposta</button>' : ''));

    const idx = { aberta: 1, em_analise: 3, finalizada: 5 }[cot.status] || 0;
    let h = '<div class="card"><div class="bd stack"><div class="row" style="justify-content:space-between"><div class="steps">' +
      ['Itens', 'Enviar aos fornecedores', 'Receber propostas', 'Mapa e escolha', 'Pedidos'].map((t, i) => '<span class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + t + '</span>').join('') +
      '</div>' + UI.pill(D.STATUS_COT, cot.status) + '</div>' +
      '<div class="row small"><span>Solicitações: ' + cot.solicitacaoIds.map(sid => { const s = S.find('solicitacoes', sid); return s ? '<a href="#/solicitacoes/' + s.id + '">' + s.numero + '</a>' : ''; }).join(', ') + '</span>' +
      '<span class="muted">·</span><label for="c-comp">Comprador(a)</label><select id="c-comp" style="width:auto"' + (fechada ? ' disabled' : '') + '>' + UI.options(S.all('compradores'), cot.compradorId, x => x.nome, '—') + '</select>' +
      '<label for="c-prazo">Responder até</label><input type="date" id="c-prazo" style="width:auto" value="' + U.esc(cot.prazoResposta) + '"' + (fechada ? ' disabled' : '') + '>' +
      (cot.pedidoIds && cot.pedidoIds.length ? '<span class="muted">·</span><span>Pedidos: ' + cot.pedidoIds.map(pid => { const p = S.find('pedidos', pid); return p ? '<a href="#/pedidos/' + p.id + '">' + p.numero + '</a>' : ''; }).join(', ') + '</span>' : '') +
      '</div></div></div>';
    h += '<div class="tabs" role="tablist">' + [['itens', 'Itens (' + cot.itens.length + ')'], ['fornecedores', 'Fornecedores e envio (' + cot.fornecedorIds.length + ')'], ['propostas', 'Propostas (' + cot.propostas.length + ')'], ['mapa', 'Mapa comparativo']]
      .map(t => '<button role="tab" class="' + (t[0] === tab ? 'on' : '') + '" data-go="#/cotacoes/' + cot.id + '/' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    h += '<div id="tab"></div>';
    UI.render(h);

    UI.$('#c-comp').onchange = e => { cot.compradorId = e.target.value; S.save(); };
    UI.$('#c-prazo').onchange = e => { cot.prazoResposta = e.target.value; S.save(); };
    if (UI.$('#nprop')) UI.$('#nprop').onclick = () => V.propostaForm(cot, null);
    if (UI.$('#imp')) UI.$('#imp').onclick = () => V.importarProposta(cot);

    const T = { itens: tabItens, fornecedores: tabFornecedores, propostas: tabPropostas, mapa: tabMapa }[tab] || tabMapa;
    T(cot, fechada);
  };

  function rerender(cot, tab) { V.cotView(cot.id, tab); }

  /* ---- Itens ---- */
  function tabItens(cot, fechada) {
    const el = UI.$('#tab');
    el.innerHTML = '<div class="card"><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th>Unid</th><th>Marca ref.</th><th>Destino</th><th>Solicitação</th><th class="n">Últ. preço</th><th class="n">Melhor preço já pago</th><th></th></tr></thead><tbody>' +
      cot.itens.map((it, i) => {
        const p = S.find('produtos', it.produtoId);
        const mh = p && D.melhorPrecoHistorico(p);
        const s = S.find('solicitacoes', it.solicitacaoId);
        return '<tr data-i="' + i + '"><td>' + (i + 1) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(it.descricao) + '</td>' +
          '<td class="n" style="width:110px">' + (fechada ? U.num(it.qtd) : '<input class="n" data-f="qtd" value="' + U.num(it.qtd) + '" aria-label="Quantidade">') + '</td><td>' + U.esc(it.unidade) + '</td>' +
          '<td>' + (fechada ? U.esc(it.marca) : '<input data-f="marca" value="' + U.esc(it.marca) + '" aria-label="Marca">') + '</td><td>' + (fechada ? UI.destinoTag(it.destino) : '<select data-f="destino" aria-label="Destino do item"><option value="estoque"' + (it.destino === 'estoque' ? ' selected' : '') + '>Estoque</option><option value="aplicacao"' + (it.destino === 'aplicacao' ? ' selected' : '') + '>Aplicação direta</option></select>') + '</td><td>' + (s ? s.numero : '') + '</td>' +
          '<td class="n">' + (p && D.ultimoPreco(p) ? U.money(D.ultimoPreco(p)) : '—') + '</td><td class="n">' + (mh ? U.money(mh.preco) + '<br><span class="small muted">' + U.esc(D.fornecedorNome(mh.fornecedorId)) + '</span>' : '—') + '</td>' +
          '<td class="act">' + (fechada ? '' : '<button class="btn icon ghost danger" data-del="' + i + '" title="Retirar item da cotação" aria-label="Retirar item">' + UI.icon('trash') + '</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>' +
      (!fechada ? '<div class="row"><button class="btn danger" id="cancel-cot">' + UI.icon('x') + 'Cancelar cotação</button></div>' : '');
    el.addEventListener('change', e => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      const it = cot.itens[Number(tr.dataset.i)];
      if (e.target.dataset.f === 'destino') {
        const sel = e.target, novo = sel.value;
        UI.confirm('Mudar o destino de "' + it.descricao + '" de "' + D.DESTINO[it.destino] + '" para "' + D.DESTINO[novo] + '"? A solicitação de origem também será atualizada.', 'Mudar destino', false).then(ok => {
          if (!ok) { sel.value = it.destino; return; }
          it.destino = novo;
          const sol = S.find('solicitacoes', it.solicitacaoId);
          const si = sol && sol.itens.find(x => x.id === it.solItemId);
          if (si) {
            si.destino = novo;
            sol.destino = root.R.destinoDosItens(sol.itens) || sol.destino;
            sol.historico.push({ data: U.nowIso(), evento: 'Destino de "' + it.descricao + '" alterado para ' + D.DESTINO[novo] + ' na cotação ' + cot.numero });
          }
          S.save();
        });
        return;
      }
      if (e.target.dataset.f === 'qtd') it.qtd = U.parseNum(e.target.value);
      else it[e.target.dataset.f] = e.target.value;
      S.save();
    });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-del]');
      if (b) {
        const it = cot.itens[Number(b.dataset.del)];
        if (!(await UI.confirm('Retirar "' + it.descricao + '" desta cotação?', 'Retirar'))) return;
        cot.itens.splice(Number(b.dataset.del), 1);
        delete cot.selecao[it.id];
        S.save();
        rerender(cot, 'itens');
      }
      if (e.target.closest('#cancel-cot')) {
        if (!(await UI.confirm('Cancelar a cotação ' + cot.numero + '? As solicitações voltam para "Aberta".', 'Cancelar cotação'))) return;
        cot.status = 'cancelada';
        cot.solicitacaoIds.forEach(sid => { const s = S.find('solicitacoes', sid); if (s && s.status === 'em_cotacao') { s.status = 'aberta'; s.historico.push({ data: U.nowIso(), evento: 'Cotação ' + cot.numero + ' cancelada' }); } });
        S.log('Cancelada cotação ' + cot.numero);
        S.save();
        rerender(cot, 'itens');
      }
    });
  }

  /* ---- Fornecedores e envio ---- */
  function tabFornecedores(cot, fechada) {
    const el = UI.$('#tab');
    const forns = S.all('fornecedores').filter(f => f.ativo !== false);
    const fora = forns.filter(f => cot.fornecedorIds.indexOf(f.id) < 0);
    const cats = U.norm(cot.itens.map(i => { const p = S.find('produtos', i.produtoId); return p ? p.categoria : ''; }).join(' '));
    const sugest = fora.filter(f => f.categorias && U.tokens(f.categorias).some(t => cats.indexOf(t) > -1));
    let h = '';
    if (!fechada) {
      h += '<div class="card"><div class="hd"><h2>Convidar fornecedores</h2></div><div class="bd stack"><div class="row"><select id="add-f" style="max-width:420px">' +
        UI.options(fora, '', f => (f.fantasia || f.razao) + (f.categorias ? ' — ' + f.categorias : ''), 'Escolha um fornecedor…') + '</select><button class="btn" id="add-f-btn">' + UI.icon('plus') + 'Adicionar</button>' +
        (Auth.perm.editarProdutosFornecedores ? '<button class="btn ghost" id="new-f">' + UI.icon('truck') + 'Cadastrar novo</button>' : '') + '</div>' +
        (sugest.length ? '<div class="row small"><span class="muted">Sugeridos pela categoria dos itens:</span>' + sugest.map(f => '<button class="btn sm" data-sug="' + f.id + '">' + UI.icon('plus') + U.esc(f.fantasia || f.razao) + '</button>').join('') + '</div>' : '') +
        '</div></div>';
    }
    h += '<div class="card"><div class="hd"><h2>Envio do pedido de cotação</h2><span class="muted small">Envie por e-mail, WhatsApp, impresso ou planilha para o fornecedor preencher</span></div><div class="bd flush"><div class="tbl-wrap">';
    if (!cot.fornecedorIds.length) h += UI.empty('Nenhum fornecedor convidado', 'Adicione fornecedores acima para enviar o pedido de cotação.');
    else {
      h += '<table class="tbl"><thead><tr><th>Fornecedor</th><th>Contato</th><th>Proposta</th><th class="act">Enviar</th></tr></thead><tbody>' +
        cot.fornecedorIds.map(fid => {
          const f = S.find('fornecedores', fid);
          if (!f) return '';
          const prop = cot.propostas.find(p => p.fornecedorId === fid);
          return '<tr><td><b>' + U.esc(f.fantasia || f.razao) + '</b><br><span class="small muted">' + U.esc(f.cnpj || '') + '</span></td>' +
            '<td class="small">' + U.esc(f.email || '') + '<br>' + U.esc(f.whatsapp || f.telefone || '') + '</td>' +
            '<td>' + (prop ? '<span class="pill ok">Recebida</span>' : '<span class="pill neutral">Aguardando</span>') + '</td>' +
            '<td class="act"><div class="row" style="justify-content:flex-end;flex-wrap:wrap">' +
            '<button class="btn sm" data-a="mail" data-f="' + fid + '" title="Abrir e-mail com o pedido">' + UI.icon('mail') + 'E-mail</button>' +
            '<button class="btn sm" data-a="whats" data-f="' + fid + '" title="Enviar pelo WhatsApp">' + UI.icon('whats') + 'WhatsApp</button>' +
            '<button class="btn sm" data-a="xlsx" data-f="' + fid + '" title="Planilha para o fornecedor preencher">' + UI.icon('download') + 'Planilha</button>' +
            '<button class="btn sm" data-a="print" data-f="' + fid + '" title="Imprimir / salvar PDF">' + UI.icon('print') + 'PDF</button>' +
            '<button class="btn sm" data-a="copy" data-f="' + fid + '" title="Copiar texto">' + UI.icon('copy') + '</button>' +
            (!fechada ? (prop ? '<button class="btn sm" data-a="edit" data-p="' + prop.id + '">' + UI.icon('edit') + 'Proposta</button>' : '<button class="btn sm sun" data-a="prop" data-f="' + fid + '">' + UI.icon('plus') + 'Proposta</button>') +
              (!prop ? '<button class="btn icon sm ghost danger" data-a="rm" data-f="' + fid + '" title="Retirar fornecedor" aria-label="Retirar fornecedor">' + UI.icon('x') + '</button>' : '') : '') +
            '</div></td></tr>';
        }).join('') + '</tbody></table>';
    }
    h += '</div></div></div>';
    h += '<div class="note small">A planilha gerada traz o número da cotação e a identificação de cada item. Quando o fornecedor devolvê-la preenchida, use <b>Importar proposta</b>: os preços, marcas e condições são lançados automaticamente.</div>';
    el.innerHTML = h;

    const add = fid => { if (fid && cot.fornecedorIds.indexOf(fid) < 0) { cot.fornecedorIds.push(fid); S.save(); rerender(cot, 'fornecedores'); } };
    if (UI.$('#add-f-btn')) UI.$('#add-f-btn').onclick = () => add(UI.$('#add-f').value);
    if (UI.$('#new-f')) UI.$('#new-f').onclick = () => V.cadQuickAdd('fornecedores', f => add(f.id));
    el.addEventListener('click', async e => {
      const s = e.target.closest('[data-sug]');
      if (s) return add(s.dataset.sug);
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const fid = b.dataset.f;
      const f = S.find('fornecedores', fid);
      const a = b.dataset.a;
      if (a === 'mail') {
        if (!f.email) UI.toast('Fornecedor sem e-mail cadastrado — o e-mail abrirá sem destinatário', 'bad');
        location.href = Docs.mailto(f.email, 'Pedido de cotação ' + cot.numero + ' — ' + S.config().empresa.nome, Docs.rfqTexto(cot, fid) + '\n\n(Anexe a planilha baixada no botão "Planilha" para agilizar o preenchimento.)');
        marcarEnvio(cot, fid, 'e-mail');
      } else if (a === 'whats') {
        window.open(Docs.whatsapp(f.whatsapp || f.telefone, Docs.rfqTexto(cot, fid)), '_blank');
        marcarEnvio(cot, fid, 'WhatsApp');
      } else if (a === 'xlsx') {
        Docs.baixarPlanilhaRfq(cot, fid).then(() => marcarEnvio(cot, fid, 'planilha')).catch(err => UI.toast(err.message, 'bad'));
      } else if (a === 'print') {
        UI.print(Docs.rfqHtml(cot, fid));
        marcarEnvio(cot, fid, 'impresso/PDF');
      } else if (a === 'copy') {
        UI.copy(Docs.rfqTexto(cot, fid));
      } else if (a === 'prop') {
        V.propostaForm(cot, null, fid);
      } else if (a === 'edit') {
        V.propostaForm(cot, cot.propostas.find(p => p.id === b.dataset.p));
      } else if (a === 'rm') {
        cot.fornecedorIds = cot.fornecedorIds.filter(x => x !== fid);
        S.save();
        rerender(cot, 'fornecedores');
      }
    });
  }

  function marcarEnvio(cot, fid, meio) {
    cot.envios = cot.envios || [];
    cot.envios.push({ data: U.nowIso(), fornecedorId: fid, meio: meio });
    S.log('Pedido de cotação ' + cot.numero + ' enviado a ' + D.fornecedorNome(fid) + ' (' + meio + ')');
    S.save();
  }

  /* ---- Propostas ---- */
  function tabPropostas(cot, fechada) {
    const el = UI.$('#tab');
    const m = D.mapa(cot);
    if (!cot.propostas.length) {
      el.innerHTML = '<div class="card">' + UI.empty('Nenhuma proposta lançada', 'Lance manualmente ou importe a resposta do fornecedor (planilha, PDF, foto ou texto de e-mail/WhatsApp) — os preços são preenchidos automaticamente.',
        fechada ? '' : '<div class="row"><button class="btn" id="e-imp">' + UI.icon('upload') + 'Importar proposta</button><button class="btn pri" id="e-new">' + UI.icon('plus') + 'Lançar proposta</button></div>') + '</div>';
      if (UI.$('#e-imp')) { UI.$('#e-imp').onclick = () => V.importarProposta(cot); UI.$('#e-new').onclick = () => V.propostaForm(cot, null); }
      return;
    }
    el.innerHTML = '<div class="card"><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fornecedor</th><th>Recebida</th><th>Origem</th><th class="n">Itens cotados</th><th>Prazo entrega</th><th>Pagamento</th><th>Frete</th><th class="n">Desconto</th><th class="n">Total</th><th>Validade</th><th></th></tr></thead><tbody>' +
      m.porProposta.map(pp => {
        const p = pp.proposta;
        const vencida = p.validade && p.validade < U.today() && !fechada;
        return '<tr><td><b>' + U.esc(D.fornecedorNome(p.fornecedorId)) + '</b></td><td>' + U.date(p.data) + '</td><td class="small">' + U.esc(p.origem || '') + '</td>' +
          '<td class="n">' + pp.itensCotados + ' / ' + cot.itens.length + '</td><td>' + (p.prazoEntregaDias !== '' && p.prazoEntregaDias !== undefined ? U.esc(p.prazoEntregaDias) + ' dias' : '—') + '</td>' +
          '<td>' + U.esc(p.condPagamento || '—') + '</td><td>' + U.esc(p.freteTipo || '') + (p.frete ? ' ' + U.money(p.frete) : '') + '</td>' +
          '<td class="n">' + (p.descontoPct ? U.pct(p.descontoPct) : '—') + '</td><td class="n strong">' + U.money(pp.total) + '</td>' +
          '<td>' + (vencida ? '<span class="tag urg">Vencida ' + U.date(p.validade) + '</span>' : U.date(p.validade)) + '</td>' +
          '<td class="act">' + (p.anexos && p.anexos.length ? '<button class="btn icon ghost" data-att="' + p.id + '" title="Ver arquivo original" aria-label="Ver arquivo">' + UI.icon('eye') + '</button>' : '') +
          (fechada ? '' : '<button class="btn icon ghost" data-ed="' + p.id + '" title="Editar" aria-label="Editar proposta">' + UI.icon('edit') + '</button><button class="btn icon ghost danger" data-rm="' + p.id + '" title="Excluir" aria-label="Excluir proposta">' + UI.icon('trash') + '</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
    el.addEventListener('click', async e => {
      const ed = e.target.closest('[data-ed]');
      if (ed) return V.propostaForm(cot, cot.propostas.find(p => p.id === ed.dataset.ed));
      const at = e.target.closest('[data-att]');
      if (at) { const p = cot.propostas.find(x => x.id === at.dataset.att); return UI.openAttachment(p.anexos[0]); }
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const p = cot.propostas.find(x => x.id === rm.dataset.rm);
        if (!(await UI.confirm('Excluir a proposta de ' + D.fornecedorNome(p.fornecedorId) + '?', 'Excluir'))) return;
        cot.propostas = cot.propostas.filter(x => x.id !== p.id);
        Object.keys(cot.selecao).forEach(k => { if (cot.selecao[k] === p.id) cot.selecao[k] = null; });
        D.autoSelecionar(cot, true);
        if (!cot.propostas.length) cot.status = 'aberta';
        S.save();
        rerender(cot, 'propostas');
      }
    });
  }

  /* ---- Formulário de proposta (também usado na conferência da importação) ---- */
  V.propostaForm = function (cot, prop, fornecedorId, capturado) {
    const edit = !!prop && cot.propostas.some(x => x.id === prop.id);
    const p = prop ? JSON.parse(JSON.stringify(prop)) : D.novaProposta(fornecedorId);
    const jaTem = new Set(cot.propostas.filter(x => x.id !== p.id).map(x => x.fornecedorId));
    const forns = S.all('fornecedores').filter(f => f.ativo !== false || f.id === p.fornecedorId);
    const novoForn = capturado && capturado.novoFornecedor && Auth.perm.editarProdutosFornecedores ? capturado.novoFornecedor : null;
    if (capturado && capturado.novoFornecedor && !novoForn) capturado.aviso = (capturado.aviso || '') + ' O fornecedor do documento não está cadastrado e você não tem permissão para cadastrar fornecedores: escolha um da lista ou peça a um comprador autorizado.';
    const body = () => {
      let h = '';
      if (capturado && capturado.aviso) h += '<div class="note">' + capturado.aviso + '</div>';
      h += '<div class="form">' +
        '<div class="f s6"><label for="p-forn">Fornecedor</label><select id="p-forn">' + UI.options(forns, p.fornecedorId, f => (f.fantasia || f.razao) + (jaTem.has(f.id) ? ' (já tem proposta)' : ''), 'Selecione…') +
        (novoForn ? '<option value="__novo" selected>+ Cadastrar: ' + U.esc(novoForn.fornecedorNome || novoForn.cnpj || 'novo fornecedor') + '</option>' : '') + '</select></div>' +
        '<div class="f s2"><label for="p-data">Recebida em</label><input type="date" id="p-data" value="' + U.esc(p.data) + '"></div>' +
        '<div class="f s2"><label for="p-val">Válida até</label><input type="date" id="p-val" value="' + U.esc(p.validade) + '"></div>' +
        '<div class="f s2"><label for="p-prazo">Prazo entrega (dias)</label><input id="p-prazo" inputmode="numeric" class="n" value="' + U.esc(p.prazoEntregaDias) + '"></div>' +
        '<div class="f s4"><label for="p-pag">Condição de pagamento</label><input id="p-pag" value="' + U.esc(p.condPagamento) + '" placeholder="Ex.: 28 dias boleto"></div>' +
        '<div class="f s2"><label for="p-ft">Frete</label><select id="p-ft"><option' + (p.freteTipo === 'CIF' ? ' selected' : '') + '>CIF</option><option' + (p.freteTipo === 'FOB' ? ' selected' : '') + '>FOB</option></select></div>' +
        '<div class="f s2"><label for="p-fv">Valor do frete</label><input id="p-fv" class="n" inputmode="decimal" value="' + U.esc(U.num(p.frete, 2)) + '"></div>' +
        '<div class="f s2"><label for="p-desc">Desconto geral %</label><input id="p-desc" class="n" inputmode="decimal" value="' + U.esc(U.num(p.descontoPct, 2)) + '"></div>' +
        '<div class="f s2"><label for="p-obs">Observação</label><input id="p-obs" value="' + U.esc(p.obs) + '"></div>' +
        '</div>';
      h += '<div class="tbl-wrap"><table class="tbl" id="p-itens"><thead><tr><th>#</th><th>Item</th><th class="n">Qtd</th><th class="n" style="width:130px">Preço unit.</th><th style="width:140px">Marca ofertada</th><th>Tem</th><th class="n">Total</th>' + (capturado ? '<th>Leitura</th>' : '') + '</tr></thead><tbody>' +
        cot.itens.map((it, i) => {
          const pr = p.precos[it.id] || {};
          const prod = S.find('produtos', it.produtoId);
          return '<tr data-id="' + it.id + '"' + (capturado && !pr.unit ? ' class="conf-baixa"' : '') + '><td>' + (i + 1) + '</td><td>' + U.esc(it.descricao) + (it.marca ? '<br><span class="small muted">ref. ' + U.esc(it.marca) + '</span>' : '') + '</td>' +
            '<td class="n">' + U.num(it.qtd) + ' ' + U.esc(it.unidade) + '</td>' +
            '<td><input class="n" data-f="unit" inputmode="decimal" value="' + (pr.unit ? U.esc(U.num(pr.unit, 2)) : '') + '" aria-label="Preço unitário item ' + (i + 1) + '"></td>' +
            '<td><input data-f="marca" list="pm-' + i + '" value="' + U.esc(pr.marca || '') + '" aria-label="Marca"><datalist id="pm-' + i + '">' + (prod && prod.marcas || []).map(mk => '<option value="' + U.esc(mk) + '">').join('') + '</datalist></td>' +
            '<td><input type="checkbox" data-f="disp"' + (pr.disponivel === false ? '' : ' checked') + ' aria-label="Fornecedor tem o item"></td>' +
            '<td class="n" data-tot>' + (pr.unit ? U.money(pr.unit * it.qtd) : '—') + '</td>' +
            (capturado ? '<td class="small muted" title="' + U.esc(pr.texto || '') + '">' + (pr.score ? (pr.linha ? 'linha ' + pr.linha + ' · ' : '') + Math.round(pr.score * 100) + '%' : 'não encontrado') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="6" class="n">Total dos itens</td><td class="n" id="p-total"></td>' + (capturado ? '<td></td>' : '') + '</tr></tfoot></table></div>';
      if (capturado && capturado.texto) h += '<details><summary class="small">Texto lido do documento</summary><pre style="white-space:pre-wrap;font-size:.8rem;max-height:240px;overflow:auto">' + U.esc(capturado.texto) + '</pre></details>';
      return h;
    };
    function total(el) {
      let t = 0;
      cot.itens.forEach(it => { const pr = p.precos[it.id]; if (pr && pr.unit && pr.disponivel !== false) t += pr.unit * it.qtd; });
      const d = U.parseNum(UI.$('#p-desc', el).value);
      UI.$('#p-total', el).textContent = U.money(t * (1 - d / 100));
    }
    UI.modal({
      title: (edit ? 'Editar proposta' : capturado ? 'Conferir proposta importada' : 'Lançar proposta') + ' — ' + cot.numero, size: 'wide', body: body(),
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar proposta', cls: 'pri', icon: 'check', action: () => {
        let fid = UI.$('#p-forn').value;
        if (!fid) { UI.toast('Selecione o fornecedor', 'bad'); return false; }
        if (fid === '__novo') {
          const f = D.criarFornecedorCapturado(novoForn);
          fid = f.id;
          UI.toast('Fornecedor ' + f.razao + ' cadastrado a partir da proposta', 'ok');
        }
        const dup = cot.propostas.find(x => x.fornecedorId === fid && x.id !== p.id);
        if (dup) { UI.toast('Este fornecedor já tem proposta nesta cotação. Edite a existente.', 'bad'); return false; }
        p.fornecedorId = fid;
        p.data = UI.$('#p-data').value;
        p.validade = UI.$('#p-val').value;
        p.prazoEntregaDias = UI.$('#p-prazo').value === '' ? '' : U.parseNum(UI.$('#p-prazo').value);
        p.condPagamento = UI.$('#p-pag').value.trim();
        p.freteTipo = UI.$('#p-ft').value;
        p.frete = U.parseNum(UI.$('#p-fv').value);
        p.descontoPct = U.parseNum(UI.$('#p-desc').value);
        p.obs = UI.$('#p-obs').value.trim();
        Object.keys(p.precos).forEach(k => {
          const pr = p.precos[k];
          if (!(pr.unit > 0) && pr.disponivel !== false) delete p.precos[k];
          else { delete pr.texto; delete pr.linha; delete pr.score; delete pr.total; }
        });
        if (!Object.keys(p.precos).length) { UI.toast('Informe o preço de pelo menos um item', 'bad'); return false; }
        // captura dados de contato do fornecedor a partir da proposta
        if (capturado && capturado.dados) {
          const f = S.find('fornecedores', fid);
          ['cnpj', 'email', 'telefone'].forEach(k => { if (capturado.dados[k] && !f[k]) f[k] = capturado.dados[k]; });
        }
        D.salvarProposta(cot, p);
        UI.toast('Proposta de ' + D.fornecedorNome(fid) + ' salva', 'ok');
        rerender(cot, 'mapa');
      } }],
      onMount: el => {
        total(el);
        UI.$('#p-itens', el).addEventListener('input', e => {
          const tr = e.target.closest('tr[data-id]');
          if (!tr) return;
          const it = cot.itens.find(x => x.id === tr.dataset.id);
          const pr = p.precos[it.id] = p.precos[it.id] || { unit: 0, marca: '', disponivel: true };
          const f = e.target.dataset.f;
          if (f === 'unit') { pr.unit = U.parseNum(e.target.value); tr.classList.remove('conf-baixa'); }
          else if (f === 'marca') pr.marca = e.target.value;
          else if (f === 'disp') pr.disponivel = e.target.checked;
          tr.querySelector('[data-tot]').textContent = pr.unit && pr.disponivel !== false ? U.money(pr.unit * it.qtd) : '—';
          total(el);
        });
        UI.$('#p-desc', el).addEventListener('input', () => total(el));
        // Enter avança para o próximo preço
        UI.$('#p-itens', el).addEventListener('keydown', e => {
          if (e.key !== 'Enter' || e.target.dataset.f !== 'unit') return;
          e.preventDefault();
          const ins = UI.$$('#p-itens input[data-f="unit"]', el);
          const i = ins.indexOf(e.target);
          if (ins[i + 1]) ins[i + 1].focus();
        });
      }
    });
  };

  /* ---- Importação automática de propostas ---- */
  V.importarProposta = function (cot) {
    UI.modal({
      title: 'Importar proposta — ' + cot.numero,
      body: '<p class="muted small" style="margin:0">O sistema lê o arquivo, identifica o fornecedor (CNPJ, e-mail ou nome), localiza cada item da cotação e preenche preços, marcas, prazo, pagamento e frete. Você confere antes de salvar.</p>' +
        '<div class="capture" style="grid-template-columns:1fr 1fr"><div class="cap" id="imp-drop"><h3>' + UI.icon('upload') + 'Arquivo</h3><p>Planilha devolvida (.xlsx/.csv), PDF da proposta ou foto/scan.</p><button class="btn" id="imp-file">Escolher arquivo</button><p class="small">Ou arraste aqui.</p></div>' +
        '<div class="cap"><h3>' + UI.icon('copy') + 'Texto</h3><p>Cole o corpo do e-mail ou mensagem do WhatsApp com os preços.</p><textarea id="imp-txt" rows="5" placeholder="Cole aqui o texto da proposta"></textarea><button class="btn sm" id="imp-go">' + UI.icon('wand') + 'Interpretar texto</button></div></div>' +
        '<div class="f"><label for="imp-forn">Fornecedor (opcional — se não for identificado automaticamente)</label><select id="imp-forn">' + UI.options(S.all('fornecedores'), '', f => f.fantasia || f.razao, 'Identificar automaticamente') + '</select></div>',
      onMount: (el, m) => {
        const go = async (files, texto) => {
          const forcado = UI.$('#imp-forn', el).value;
          m.close();
          await processarImportacao(cot, files, texto, forcado);
        };
        UI.$('#imp-file', el).onclick = async () => { const f = await UI.pickFile('.xlsx,.xls,.csv,.ods,application/pdf,image/*,.txt,.eml'); if (f.length) go(f); };
        UI.$('#imp-go', el).onclick = () => { const t = UI.$('#imp-txt', el).value.trim(); if (!t) { UI.toast('Cole o texto da proposta', 'bad'); return; } go(null, t); };
        const drop = UI.$('#imp-drop', el);
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
        drop.addEventListener('drop', e => { e.preventDefault(); go(Array.from(e.dataTransfer.files || [])); });
      }
    });
  };

  async function processarImportacao(cot, files, texto, fornecedorForcado) {
    const file = files && files[0];
    let dados, anexo = null, textoLido = texto || '';
    const pg = file ? UI.progress('Lendo ' + file.name) : null;
    try {
      if (file) anexo = await C.toAttachment(file).catch(() => null);
      if (file && /\.(xlsx|xls|ods|csv)$/i.test(file.name)) {
        const sh = await C.readSheet(file);
        dados = Docs.lerPlanilhaProposta(sh.rows, cot);
        textoLido = sh.rows.map(r => r.join(' | ')).join('\n');
        if (!dados.reconhecidos) {
          const pd = P.parseProposal(textoLido, cot.itens.map(it => ({ id: it.id, descricao: it.descricao, qtd: it.qtd, codigo: (S.find('produtos', it.produtoId) || {}).codigo })));
          dados = Object.assign(pd, dados, { precos: pd.precos });
        }
      } else {
        if (file) textoLido = await C.extractText(file, (pct, msg) => pg.set(pct, msg));
        dados = P.parseProposal(textoLido, cot.itens.map(it => ({ id: it.id, descricao: it.descricao, qtd: it.qtd, codigo: (S.find('produtos', it.produtoId) || {}).codigo })));
      }
    } catch (err) {
      if (pg) pg.close();
      UI.toast(err.message || 'Não foi possível ler a proposta', 'bad');
      return;
    }
    if (pg) pg.close();

    const prop = D.novaProposta('');
    prop.origem = file ? 'importada (' + file.name.split('.').pop().toLowerCase() + ')' : 'importada (texto)';
    if (anexo) prop.anexos = [anexo];
    let f = fornecedorForcado ? S.find('fornecedores', fornecedorForcado) : D.localizarOuCriarFornecedor(dados);
    let aviso = [];
    const n = Object.keys(dados.precos || {}).length;
    aviso.push('<b>' + n + ' de ' + cot.itens.length + '</b> itens com preço identificado.');
    if (dados.cotacaoNumero && dados.cotacaoNumero !== cot.numero) aviso.push('Atenção: o documento cita a cotação <b>' + U.esc(dados.cotacaoNumero) + '</b>.');
    const existente = f && cot.propostas.find(x => x.fornecedorId === f.id);
    if (existente) {
      Object.assign(prop, existente, { precos: Object.assign({}, existente.precos), anexos: (existente.anexos || []).concat(prop.anexos) });
      aviso.push('Este fornecedor já tinha proposta: os valores lidos atualizam a existente.');
    }
    if (f) { prop.fornecedorId = f.id; aviso.push('Fornecedor identificado: <b>' + U.esc(f.fantasia || f.razao) + '</b>.'); }
    else if (dados.fornecedorNome || dados.cnpj) aviso.push('Fornecedor não cadastrado — será cadastrado automaticamente ao salvar.');
    else aviso.push('Fornecedor não identificado — selecione na lista.');
    ['prazoEntregaDias', 'condPagamento', 'freteTipo', 'frete', 'descontoPct'].forEach(k => { if (dados[k] !== undefined && dados[k] !== '') prop[k] = dados[k]; });
    if (dados.validadeDias) prop.validade = U.addDays(prop.data, dados.validadeDias);
    Object.keys(dados.precos || {}).forEach(k => { prop.precos[k] = Object.assign({ disponivel: true }, dados.precos[k]); });
    V.propostaForm(cot, prop, prop.fornecedorId, {
      aviso: aviso.join(' '), texto: textoLido, dados: dados,
      novoFornecedor: !f && (dados.fornecedorNome || dados.cnpj) ? dados : null
    });
  }

  /* ---- Mapa comparativo ---- */
  function tabMapa(cot, fechada) {
    const el = UI.$('#tab');
    const m = D.mapa(cot);
    if (!m.porProposta.length) {
      el.innerHTML = '<div class="card">' + UI.empty('Mapa vazio', 'O mapa comparativo aparece assim que houver propostas lançadas.', '<button class="btn pri" data-go="#/cotacoes/' + cot.id + '/propostas">Ir para propostas</button>') + '</div>';
      return;
    }
    let h = '<div class="card"><div class="totalizer">' +
      '<div class="main-total"><span>Total selecionado</span><b>' + U.money(m.totalSel) + '</b><small>' + m.itensSelecionados + ' de ' + m.linhas.length + ' itens' + (m.fretesSel ? ' · fretes ' + U.money(m.fretesSel) : '') + '</small></div>' +
      '<div><span>Total com melhores preços</span><b>' + U.money(m.totalMelhor) + '</b><small>menor preço de cada item</small></div>' +
      '<div class="good"><span>Economia sobre a média</span><b>' + U.money(m.economiaMedia) + '</b><small>' + (m.totalMedia ? U.pct(m.economiaMedia / m.totalMedia * 100) : '') + ' · média ' + U.money(m.totalMedia) + '</small></div>' +
      '<div class="good"><span>Economia sobre o maior</span><b>' + U.money(m.economiaPior) + '</b><small>maior ' + U.money(m.totalPior) + '</small></div>' +
      '<div><span>Melhor fornecedor único</span><b style="font-size:1.05rem">' + (m.melhorUnico ? U.esc(D.fornecedorNome(m.melhorUnico.fornecedorId)) : '—') + '</b><small>' + (m.melhorUnico ? U.money(m.melhorUnico.total) + ' (todos os itens)' : 'nenhum cotou todos os itens') + '</small></div>' +
      '</div></div>';
    if (m.itensSemPreco) h += '<div class="note warn">' + m.itensSemPreco + ' item(ns) ainda sem nenhum preço.</div>';

    h += '<div class="card"><div class="hd"><h2>Mapa comparativo de preços</h2><div class="acts">' +
      (!fechada ? '<button class="btn" id="auto">' + UI.icon('wand') + 'Selecionar melhores preços</button>' : '') +
      '<button class="btn" id="xls">' + UI.icon('download') + 'Excel</button><button class="btn" id="prt">' + UI.icon('print') + 'Imprimir</button></div></div>' +
      '<div class="bd" style="padding-bottom:0"><div class="legend"><span><i style="background:var(--best)"></i>Menor preço do item</span><span><i style="box-shadow:inset 0 0 0 2px var(--brand)"></i>Selecionado para compra' + (fechada ? '' : ' (clique na célula para trocar)') + '</span><span>Preço exibido já com desconto geral da proposta</span></div></div>' +
      '<div class="bd flush"><div class="tbl-wrap"><table class="tbl mapa"><thead><tr><th>#</th><th style="min-width:220px">Item</th><th class="n">Qtd</th>' +
      m.porProposta.map(pp => '<th class="forn">' + U.esc(D.fornecedorNome(pp.fornecedorId)) + '<br><span class="small muted" style="text-transform:none;letter-spacing:0">' + (pp.proposta.prazoEntregaDias !== '' ? pp.proposta.prazoEntregaDias + ' dias · ' : '') + U.esc(pp.proposta.condPagamento || '') + '</span></th>').join('') +
      '<th class="n">Economia no item</th></tr></thead><tbody>';
    m.linhas.forEach((l, i) => {
      h += '<tr><td>' + (i + 1) + '</td><td>' + U.esc(l.item.descricao) + '<br><span class="small muted">' + UI.destinoTag(l.item.destino) + (l.item.marca ? ' ref. ' + U.esc(l.item.marca) : '') + '</span></td><td class="n">' + U.num(l.item.qtd) + ' ' + U.esc(l.item.unidade) + '</td>';
      l.ofertas.forEach(o => {
        if (o.efetivo === null) { h += '<td class="cell none">—</td>'; return; }
        const best = l.melhor && l.melhor.propostaId === o.propostaId;
        const sel = l.sel && l.sel.propostaId === o.propostaId;
        h += '<td class="cell' + (best ? ' best' : '') + (sel ? ' sel' : '') + '" data-item="' + l.item.id + '" data-prop="' + o.propostaId + '" tabindex="0" title="' + (fechada ? '' : 'Selecionar este fornecedor para o item') + '">' +
          '<span class="u">' + U.money(o.efetivo) + '</span><span class="t">' + U.money(o.total) + '</span>' + (o.marca ? '<span class="m">' + U.esc(o.marca) + '</span>' : '') + '</td>';
      });
      const eco = l.sel && l.pior ? (l.pior.efetivo - l.sel.efetivo) * l.item.qtd : 0;
      h += '<td class="n">' + (eco > 0.005 ? U.money(eco) : '—') + '</td></tr>';
    });
    h += '</tbody><tfoot>' +
      '<tr class="fsum"><td colspan="3">Total da proposta (itens cotados)</td>' + m.porProposta.map(pp => '<td class="n">' + U.money(pp.total - pp.frete) + '<br><span class="small muted">' + pp.itensCotados + '/' + m.linhas.length + ' itens' + (pp.desconto ? ' · desc. ' + U.money(pp.desconto) : '') + '</span></td>').join('') + '<td></td></tr>' +
      '<tr class="fsum"><td colspan="3">Frete</td>' + m.porProposta.map(pp => '<td class="n">' + U.esc(pp.proposta.freteTipo || '') + ' ' + (pp.frete ? U.money(pp.frete) : '—') + '</td>').join('') + '<td></td></tr>' +
      '<tr class="fsum"><td colspan="3">Itens com menor preço</td>' + m.porProposta.map(pp => '<td class="n">' + pp.melhores + '</td>').join('') + '<td></td></tr>' +
      '<tr><td colspan="3">Selecionado para compra</td>' + m.porProposta.map(pp => '<td class="n">' + (pp.vencidos ? U.money(pp.totalVencido) + '<br><span class="small muted">' + pp.vencidos + ' item(ns)</span>' : '—') + '</td>').join('') + '<td class="n">' + U.money(m.economiaPior) + '</td></tr>' +
      (!fechada ? '<tr><td colspan="3" class="small muted">Comprar tudo de um só fornecedor</td>' + m.porProposta.map(pp => '<td class="n">' + (pp.itensCotados ? '<button class="btn sm" data-unico="' + pp.proposta.id + '">Escolher</button>' : '') + '</td>').join('') + '<td></td></tr>' : '') +
      '</tfoot></table></div></div></div>';

    if (!fechada) {
      h += '<div class="card"><div class="hd"><h2>Emitir pedidos de compra</h2></div><div class="bd stack">';
      const grupos = m.porProposta.filter(pp => pp.vencidos);
      h += grupos.length ? '<p style="margin:0">Serão gerados <b>' + grupos.length + ' pedido(s)</b>: ' + grupos.map(pp => U.esc(D.fornecedorNome(pp.fornecedorId)) + ' (' + pp.vencidos + ' itens, ' + U.money(pp.totalVencido) + ')').join('; ') + '.</p>' : '<p class="muted" style="margin:0">Selecione os fornecedores no mapa.</p>';
      if (m.itensSelecionados < m.linhas.length) h += '<div class="note warn">' + (m.linhas.length - m.itensSelecionados) + ' item(ns) sem fornecedor selecionado ficarão fora dos pedidos.</div>';
      h += '<div class="row"><button class="btn sun" id="gerar"' + (grupos.length ? '' : ' disabled') + '>' + UI.icon('order') + 'Gerar pedidos de compra</button></div></div></div>';
    }
    el.innerHTML = h;

    UI.$('#xls').onclick = () => C.writeXlsx('mapa-' + cot.numero + '.xlsx', { 'Mapa': Docs.mapaPlanilha(cot) }).catch(err => UI.toast(err.message, 'bad'));
    UI.$('#prt').onclick = () => UI.print(Docs.mapaHtml(cot));
    if (fechada) return;
    UI.$('#auto').onclick = () => { D.autoSelecionar(cot, false); S.save(); UI.toast('Menor preço selecionado em cada item', 'ok'); rerender(cot, 'mapa'); };
    const pick = cell => {
      cot.selecao[cell.dataset.item] = cell.dataset.prop;
      cot.selecaoManual = cot.selecaoManual || {};
      cot.selecaoManual[cell.dataset.item] = true;
      S.save();
      rerender(cot, 'mapa');
    };
    el.addEventListener('click', e => {
      const cell = e.target.closest('td.cell[data-prop]');
      if (cell) return pick(cell);
      const u = e.target.closest('[data-unico]');
      if (u) { D.selecionarFornecedorUnico(cot, u.dataset.unico); S.save(); rerender(cot, 'mapa'); }
    });
    el.addEventListener('keydown', e => {
      const cell = e.target.closest('td.cell[data-prop]');
      if (cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(cell); }
    });
    UI.$('#gerar').onclick = async () => {
      const vencidas = cot.propostas.filter(p => p.validade && p.validade < U.today() && Object.values(cot.selecao).indexOf(p.id) > -1);
      const msg = 'Gerar os pedidos de compra e finalizar a cotação ' + cot.numero + '?' + (vencidas.length ? ' Atenção: ' + vencidas.length + ' proposta(s) selecionada(s) com validade vencida.' : '');
      if (!(await UI.confirm(msg, 'Gerar pedidos', false))) return;
      const peds = D.gerarPedidos(cot);
      UI.toast(peds.length + ' pedido(s) gerado(s): ' + peds.map(p => p.numero).join(', '), 'ok');
      location.hash = peds.length === 1 ? '#/pedidos/' + peds[0].id : '#/pedidos';
    };
  }
})(window);
