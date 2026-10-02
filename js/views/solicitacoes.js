/* Solicitações de compra: lista, formulário (digitação, requisição digitalizada, voz) e detalhe */
(function (root) {
  'use strict';
  const { U, S, D, UI, C, P, Docs, R, Auth } = root;
  const SEM_CAT = '__sem';
  const catDe = p => (p && p.categoria ? p.categoria : SEM_CAT);
  const catNome = c => (c === SEM_CAT ? 'Sem categoria' : c);
  D.categorias = function () {
    const set = new Set(S.all('produtos').filter(p => p.ativo !== false).map(catDe));
    return Array.from(set).sort((a, b) => (a === SEM_CAT ? 1 : b === SEM_CAT ? -1 : a.localeCompare(b)));
  };
  const V = root.V = root.V || {};

  const filtro = { q: '', status: 'ativas', destino: '', solicitante: '' };

  /* ---------- Lista ---------- */
  V.solList = function () {
    UI.setHeader('Solicitações de compra', 'Processo',
      '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>' +
      '<button class="btn" data-go="#/solicitacoes/nova/voz">' + UI.icon('mic') + 'Por voz</button>' +
      '<button class="btn" data-go="#/solicitacoes/nova/digitalizada">' + UI.icon('scan') + 'Digitalizada</button>' +
      '<button class="btn pri" data-go="#/solicitacoes/nova">' + UI.icon('plus') + 'Nova solicitação</button>');

    const h = '<div class="card"><div class="hd"><div class="toolbar">' +
      '<input type="search" id="f-q" placeholder="Buscar número, item, aplicação…" value="' + U.esc(filtro.q) + '">' +
      '<select id="f-status"><option value="ativas">Em andamento</option><option value="">Todas</option>' + Object.keys(D.STATUS_SOL).map(k => '<option value="' + k + '">' + D.STATUS_SOL[k].t + '</option>').join('') + '</select>' +
      '<select id="f-dest"><option value="">Todos os destinos</option><option value="aplicacao">Aplicação direta</option><option value="estoque">Estoque</option></select>' +
      '<select id="f-sol">' + UI.options(S.all('solicitantes'), filtro.solicitante, x => x.nome, 'Todos os solicitantes') + '</select>' +
      '</div><div class="acts">' + (Auth.perm.processoCompras ? '<button class="btn sun" id="to-cot" disabled>' + UI.icon('quote') + 'Cotar selecionadas</button>' : '<span class="small muted">' + (Auth.perm.basico ? 'Solicitações dos seus centros de custo' : '') + '</span>') + '</div></div>' +
      '<div class="bd flush"><div class="tbl-wrap" id="sol-tbl"></div></div></div>';
    const v = UI.render(h);
    UI.$('#f-status', v).value = filtro.status;
    UI.$('#f-dest', v).value = filtro.destino;

    const sel = new Set();
    function draw() {
      const q = U.norm(filtro.q);
      const list = S.all('solicitacoes').filter(s => {
        if (!R.podeVerSolicitacao(Auth.perm, Auth.user, s)) return false;
        if (filtro.status === 'ativas' && ['atendida', 'cancelada'].indexOf(s.status) > -1) return false;
        if (filtro.status && filtro.status !== 'ativas' && s.status !== filtro.status) return false;
        if (filtro.destino && s.destino !== filtro.destino) return false;
        if (filtro.solicitante && s.solicitanteId !== filtro.solicitante) return false;
        if (q && U.norm(s.numero + ' ' + s.aplicacao + ' ' + s.itens.map(i => i.descricao).join(' ') + ' ' + D.solicitanteNome(s)).indexOf(q) < 0) return false;
        return true;
      }).sort((a, b) => (b.numero > a.numero ? 1 : -1));
      if (!list.length) {
        UI.$('#sol-tbl').innerHTML = UI.empty('Nenhuma solicitação encontrada', 'Crie uma solicitação digitando, anexando a requisição digitalizada ou ditando por voz.', '<button class="btn pri" data-go="#/solicitacoes/nova">' + UI.icon('plus') + 'Nova solicitação</button>');
        return;
      }
      UI.$('#sol-tbl').innerHTML = '<table class="tbl"><thead><tr><th></th><th>Número</th><th>Data</th><th>Solicitante</th><th>Centro de custo</th><th>Destino</th><th>Prioridade</th><th class="n">Itens</th><th>Necessidade</th><th>Status</th></tr></thead><tbody>' +
        list.map(s => '<tr class="click" data-id="' + s.id + '">' +
          '<td>' + (s.status === 'aberta' && Auth.perm.processoCompras ? '<input type="checkbox" data-sel="' + s.id + '"' + (sel.has(s.id) ? ' checked' : '') + ' aria-label="Selecionar ' + s.numero + '">' : '') + '</td>' +
          '<td class="strong">' + s.numero + '</td><td>' + U.date(s.data) + '</td><td>' + U.esc(D.solicitanteNome(s)) + '</td>' +
          '<td>' + U.esc(D.centro(s.centroCustoId)) + '</td><td>' + UI.destinoTag(s.destino) + '</td>' +
          '<td>' + (s.prioridade === 'urgente' ? '<span class="tag urg">Urgente</span>' : U.esc(D.PRIORIDADE[s.prioridade] || '')) + '</td>' +
          '<td class="n">' + s.itens.length + '</td><td>' + U.date(s.necessidade) + '</td><td>' + UI.pill(D.STATUS_SOL, s.status) + '</td></tr>').join('') +
        '</tbody></table>';
    }
    draw();
    const refreshBtn = () => {
      if (!UI.$('#to-cot')) return; UI.$('#to-cot').disabled = !sel.size; UI.$('#to-cot').lastChild.textContent = sel.size ? 'Cotar ' + sel.size + ' selecionada(s)' : 'Cotar selecionadas'; };
    UI.$('#f-q').oninput = U.debounce(e => { filtro.q = e.target.value; draw(); }, 200);
    UI.$('#f-status').onchange = e => { filtro.status = e.target.value; draw(); };
    UI.$('#f-dest').onchange = e => { filtro.destino = e.target.value; draw(); };
    UI.$('#f-sol').onchange = e => { filtro.solicitante = e.target.value; draw(); };
    UI.$('#sol-tbl').addEventListener('click', e => {
      const cb = e.target.closest('[data-sel]');
      if (cb) { e.stopPropagation(); if (cb.checked) sel.add(cb.dataset.sel); else sel.delete(cb.dataset.sel); refreshBtn(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/solicitacoes/' + tr.dataset.id;
    });
    if (UI.$('#to-cot')) UI.$('#to-cot').onclick = () => {
      V.iniciarCotacao(Array.from(sel));
    };
    UI.$('#exp').onclick = () => {
      const rows = [['Número', 'Data', 'Solicitante', 'Comprador', 'Centro de custo', 'Destino', 'Aplicação', 'Prioridade', 'Necessidade', 'Status', 'Item', 'Código', 'Descrição', 'Qtd', 'Unid', 'Marca', 'Obs']];
      S.all('solicitacoes').forEach(s => s.itens.forEach((it, i) => {
        const p = S.find('produtos', it.produtoId);
        rows.push([s.numero, U.date(s.data), D.solicitanteNome(s), D.pessoa('compradores', s.compradorId), D.centro(s.centroCustoId), D.DESTINO[s.destino], s.aplicacao, D.PRIORIDADE[s.prioridade], U.date(s.necessidade), D.STATUS_SOL[s.status].t, i + 1, p ? p.codigo : '', it.descricao, it.qtd, it.unidade, it.marca, it.obs]);
      }));
      C.writeXlsx('solicitacoes.xlsx', { 'Solicitações': rows }).catch(err => UI.toast(err.message, 'bad'));
    };
  };

  /* ---------- Formulário ---------- */
  V.solForm = function (id, modo) {
    const orig = id ? S.find('solicitacoes', id) : null;
    if (id && !orig) { location.hash = '#/solicitacoes'; return; }
    const perm = Auth.perm, eu = Auth.user;
    if (orig && !R.podeEditarSolicitacao(perm, eu, orig)) {
      UI.toast(perm.comprador ? 'Esta solicitação não pode mais ser alterada (pedido já emitido).' : 'Após o início do processo, somente compradores e administradores podem alterar a solicitação.', 'bad');
      location.hash = '#/solicitacoes/' + orig.id;
      return;
    }
    const sol = orig ? JSON.parse(JSON.stringify(orig)) : D.novaSolicitacao();
    if (!orig && S.all('compradores').length === 1) sol.compradorId = S.all('compradores')[0].id;
    if (!orig && modo) sol.origemEntrada = modo;
    // usuário básico: solicitante é ele mesmo e só usa os centros de custo dele
    const meusCentros = perm.basico ? S.all('centrosCusto').filter(c => (eu.centros || []).indexOf(c.id) > -1) : S.all('centrosCusto');
    if (!orig && eu.solicitante_id) sol.solicitanteId = eu.solicitante_id;
    if (!orig && meusCentros.length === 1) sol.centroCustoId = meusCentros[0].id;
    sol.itens.forEach(it => { if (!it.categoria) it.categoria = it.produtoId ? catDe(S.find('produtos', it.produtoId)) : ''; });
    const travarSolicitante = perm.basico && !!eu.solicitante_id;

    UI.setHeader(orig ? 'Editar ' + orig.numero : 'Nova solicitação de compra', 'Solicitações',
      '<button class="btn" data-go="' + (orig ? '#/solicitacoes/' + orig.id : '#/solicitacoes') + '">Cancelar</button>' +
      '<button class="btn pri" id="save">' + UI.icon('check') + 'Salvar solicitação</button>');

    const cats = D.categorias();
    const prodAtivos = S.all('produtos').filter(p => p.ativo !== false);
    const dlCat = cats.map((c, ci) => '<datalist id="dl-cat-' + ci + '">' + prodAtivos.filter(p => catDe(p) === c).map(p => '<option value="' + U.esc(p.codigo + ' — ' + p.descricao) + '"></option>').join('') + '</datalist>').join('');
    let h = '<div class="card"><div class="hd"><h2>Dados da solicitação</h2>' + (orig ? '<span class="muted">' + orig.numero + '</span>' : '') + '</div><div class="bd"><div class="form">' +
      '<div class="f s4"><label for="s-sol">Solicitante (código)</label><div class="row" style="flex-wrap:nowrap"><select id="s-sol"' + (travarSolicitante ? ' disabled' : '') + '>' + UI.options(S.all('solicitantes'), sol.solicitanteId, x => x.codigo + ' · ' + x.nome, perm.basico ? eu.nome + ' (você)' : 'Selecione…') + '</select>' + (perm.editarCadastrosBase ? '<button class="btn icon" id="add-sol" title="Cadastrar solicitante" aria-label="Cadastrar solicitante">' + UI.icon('plus') + '</button>' : '') + '</div></div>' +
      '<div class="f s4"><label for="s-comp">Comprador(a) responsável</label><select id="s-comp">' + UI.options(S.all('compradores'), sol.compradorId, x => x.codigo + ' · ' + x.nome, 'Selecione…') + '</select></div>' +
      '<div class="f s4"><label for="s-cc">Centro de custo</label><select id="s-cc">' + UI.options(meusCentros, sol.centroCustoId, x => x.codigo + ' · ' + x.descricao, 'Selecione…') + '</select></div>' +
      '<div class="f s4"><label>Destino do material</label><div class="seg" role="radiogroup" aria-label="Destino">' +
      '<label><input type="radio" name="s-dest" value="aplicacao"' + (sol.destino === 'aplicacao' ? ' checked' : '') + '>Aplicação direta</label>' +
      '<label><input type="radio" name="s-dest" value="estoque"' + (sol.destino === 'estoque' ? ' checked' : '') + '>Estoque</label>' +
      '<label><input type="radio" name="s-dest" value="ambas"' + (sol.destino === 'ambas' ? ' checked' : '') + '>Ambas</label></div>' +
      '<span class="small muted" id="s-dest-help"></span></div>' +
      '<div class="f s12" id="s-aprop-box"><label>Apropriação do custo (itens de aplicação direta)</label><div class="row">' +
      '<div class="seg" role="radiogroup" aria-label="Apropriação do custo"><label><input type="radio" name="s-aprop" value="eq"' + (sol.categoriaDespesaId ? '' : ' checked') + '>Equipamento</label><label><input type="radio" name="s-aprop" value="cat"' + (sol.categoriaDespesaId ? ' checked' : '') + '>Despesa de uso coletivo</label></div>' +
      '<select id="s-eq" style="max-width:420px" aria-label="Equipamento"></select><select id="s-cat" style="max-width:420px" aria-label="Categoria de despesa"></select></div>' +
      '<span class="small muted">O valor dos itens de aplicação direta (comprados ou retirados do estoque) é lançado neste equipamento ou nesta categoria de despesa do centro de custo.</span></div>' +
      '<div class="f s4"><label for="s-apl">Local / observação da aplicação</label><input id="s-apl" value="' + U.esc(sol.aplicacao) + '" placeholder="Ex.: troca dos mancais na parada"></div>' +
      '<div class="f s2"><label for="s-pri">Prioridade</label><select id="s-pri">' + Object.keys(D.PRIORIDADE).map(k => '<option value="' + k + '"' + (sol.prioridade === k ? ' selected' : '') + '>' + D.PRIORIDADE[k] + '</option>').join('') + '</select></div>' +
      '<div class="f s2"><label for="s-nec">Necessário até</label><input type="date" id="s-nec" value="' + U.esc(sol.necessidade) + '"></div>' +
      '<div class="f s12"><label for="s-obs">Observações</label><textarea id="s-obs" rows="2">' + U.esc(sol.obs) + '</textarea></div>' +
      '</div></div></div>';

    h += '<div class="card"><div class="hd"><h2>Entrada dos itens</h2><span class="muted small">Escolha a forma mais prática — dá para combinar as três</span></div><div class="bd"><div class="capture">' +
      '<div class="cap"><h3>' + UI.icon('keyboard') + 'Digitada</h3><p>Digite na tabela abaixo. Ao escolher um produto cadastrado, código, unidade e marca são preenchidos.</p><button class="btn" id="cap-add">' + UI.icon('plus') + 'Adicionar linha</button></div>' +
      '<div class="cap" id="cap-scan"><h3>' + UI.icon('scan') + 'Requisição digitalizada</h3><p>Anexe foto, PDF ou planilha da requisição em papel. O texto é lido e os itens são sugeridos para conferência.</p><div class="row"><button class="btn" id="cap-file">' + UI.icon('upload') + 'Anexar arquivo</button><button class="btn ghost sm" id="cap-cam">Tirar foto</button></div><p class="small">Ou arraste o arquivo para esta área.</p></div>' +
      '<div class="cap"><h3>' + UI.icon('mic') + 'Por voz</h3><p>Fale os itens, por exemplo: <i>“dez unidades de parafuso M12 marca Ciser, próximo item cinco litros de óleo 68, aplicação direta, urgente”</i>.</p><div class="row"><button class="btn" id="cap-mic">' + UI.icon('mic') + 'Começar a ditar</button></div>' +
      '<div class="transcript" id="cap-tr" hidden><textarea id="cap-text" rows="3" placeholder="O texto ditado aparece aqui e pode ser corrigido"></textarea><div class="interim small" id="cap-int"></div><div class="row" style="margin-top:6px"><button class="btn sm sun" id="cap-parse">' + UI.icon('wand') + 'Interpretar itens</button><button class="btn sm ghost" id="cap-clear">Limpar</button></div></div></div>' +
      '</div></div></div>';

    h += '<div class="card"><div class="hd"><h2>Itens solicitados</h2><div class="acts"><span class="muted small" id="it-sum"></span></div></div><div class="bd flush"><div class="tbl-wrap" id="it-tbl"></div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Anexos</h2></div><div class="bd" id="att"></div></div>';
    h += dlCat + '<datalist id="dl-marca"></datalist>';
    const v = UI.render(h);

    const byLabel = {};
    prodAtivos.forEach(p => { byLabel[p.codigo + ' — ' + p.descricao] = p; });

    const destinoAtual = () => (UI.$('input[name="s-dest"]:checked') || {}).value || '';
    function ajudaDestino() {
      const d = destinoAtual();
      UI.$('#s-dest-help').textContent = d === 'ambas' ? 'Informe em cada item se vai para estoque ou aplicação direta.'
        : d ? 'Todos os itens vão para ' + (d === 'estoque' ? 'estoque' : 'aplicação direta') + '.' : '';
    }
    sol.destino = sol.destino || 'aplicacao';
    ajudaDestino();

    // apropriação: equipamentos e categorias de despesa do centro de custo escolhido
    function opcoesApropriacao() {
      const cc = UI.$('#s-cc').value;
      const eqs = S.all('equipamentos').filter(e => e.ativo !== false && (!cc || e.centroCustoId === cc));
      const cats = S.all('categoriasDespesa').filter(c => c.ativo !== false && (!cc || !(c.centros || []).length || c.centros.indexOf(cc) > -1));
      UI.$('#s-eq').innerHTML = UI.options(eqs, sol.equipamentoId, e => (e.codigo ? e.codigo + ' · ' : '') + e.descricao, eqs.length ? 'Escolha o equipamento…' : 'Nenhum equipamento neste centro de custo');
      UI.$('#s-cat').innerHTML = UI.options(cats, sol.categoriaDespesaId, c => c.descricao + (c.grupo ? ' (' + c.grupo + ')' : ''), 'Escolha a categoria de despesa…');
      const porCat = (UI.$('input[name="s-aprop"]:checked') || {}).value === 'cat';
      UI.$('#s-eq').hidden = porCat;
      UI.$('#s-cat').hidden = !porCat;
      UI.$('#s-aprop-box').hidden = !sol.itens.some(i => i.destino === 'aplicacao') && sol.destino === 'estoque';
    }
    UI.$('#s-cc').addEventListener('change', () => { sol.equipamentoId = ''; opcoesApropriacao(); });
    UI.$$('input[name="s-aprop"]').forEach(r => r.addEventListener('change', opcoesApropriacao));
    UI.$('#s-eq').addEventListener('change', e => { sol.equipamentoId = e.target.value; });
    UI.$('#s-cat').addEventListener('change', e => { sol.categoriaDespesaId = e.target.value; });
    opcoesApropriacao();
    // troca do destino da solicitação: com destino único todos os itens acompanham (com confirmação)
    UI.$$('input[name="s-dest"]').forEach(r => r.addEventListener('change', async () => {
      const novo = r.value, anterior = sol.destino;
      if (novo !== 'ambas') {
        const diferentes = sol.itens.filter(it => it.descricao && it.destino && it.destino !== novo).length;
        if (diferentes && !(await UI.confirm(diferentes + ' item(ns) estão com outro destino. Marcar TODOS os itens como "' + D.DESTINO[novo] + '"?', 'Marcar todos', false))) {
          UI.$$('input[name="s-dest"]').forEach(x => { x.checked = x.value === anterior; });
          return;
        }
        sol.itens.forEach(it => { it.destino = novo; });
      }
      sol.destino = novo;
      ajudaDestino();
      drawItems();
    }));

    // redesenho protegido: um campo que perde o foco durante o redesenho dispara "change" de novo
    let desenhando = false, redesenhar = false;
    function drawItems() {
      if (desenhando) { redesenhar = true; return; }
      desenhando = true;
      try { drawItemsAgora(); } finally { desenhando = false; }
      if (redesenhar) { redesenhar = false; setTimeout(drawItems, 0); }
    }
    function drawItemsAgora() {
      if (!sol.itens.length) {
        UI.$('#it-tbl').innerHTML = UI.empty('Nenhum item ainda', 'Adicione itens digitando, anexando a requisição ou ditando.');
        UI.$('#it-sum').textContent = '';
        return;
      }
      const verPreco = perm.comprador;
      UI.$('#it-tbl').innerHTML = '<table class="tbl"><thead><tr><th>#</th><th style="min-width:150px">Categoria</th><th style="min-width:260px">Produto / descrição</th><th>Código</th><th class="n" style="width:100px">Qtd</th><th style="width:95px">Unid</th><th style="min-width:150px">Destino</th><th style="min-width:120px">Marca</th><th style="min-width:140px">Observação</th>' + (verPreco ? '<th class="n">Últ. preço</th>' : '') + '<th></th></tr></thead><tbody>' +
        sol.itens.map((it, i) => {
          const p = S.find('produtos', it.produtoId);
          const up = p ? D.ultimoPreco(p) : 0;
          const ci = cats.indexOf(it.categoria);
          const destTravado = sol.destino !== 'ambas';
          return '<tr data-i="' + i + '" class="' + (it.confianca === 'baixa' || !it.categoria || !it.destino ? 'conf-baixa' : '') + '"><td>' + (i + 1) + '</td>' +
            '<td><select data-f="categoria" aria-label="Categoria do item ' + (i + 1) + '"><option value="">Escolha…</option>' + cats.map(c => '<option value="' + U.esc(c) + '"' + (c === it.categoria ? ' selected' : '') + '>' + U.esc(catNome(c)) + '</option>').join('') + '</select></td>' +
            '<td><input data-f="descricao"' + (ci > -1 ? ' list="dl-cat-' + ci + '"' : '') + ' value="' + U.esc(it.descricao) + '" placeholder="' + (it.categoria ? 'Produtos de ' + U.esc(catNome(it.categoria)) : 'Escolha a categoria primeiro') + '"' + (it.categoria ? '' : ' disabled') + ' aria-label="Descrição do item ' + (i + 1) + '"></td>' +
            '<td class="small">' + (p ? '<b>' + U.esc(p.codigo) + '</b>' : it.descricao ? '<span class="muted" title="Será cadastrado por um comprador autorizado">não cadastrado</span>' : '') + '</td>' +
            '<td><input class="n" data-f="qtd" inputmode="decimal" value="' + U.esc(U.num(it.qtd)) + '" aria-label="Quantidade"></td>' +
            '<td><select data-f="unidade" aria-label="Unidade">' + UI.unitOptions(it.unidade) + '</select></td>' +
            '<td><select data-f="destino" aria-label="Destino do item ' + (i + 1) + '"' + (destTravado ? ' title="Definido pelo destino da solicitação"' : '') + '>' + (it.destino ? '' : '<option value="">Informe…</option>') + '<option value="estoque"' + (it.destino === 'estoque' ? ' selected' : '') + '>Estoque</option><option value="aplicacao"' + (it.destino === 'aplicacao' ? ' selected' : '') + '>Aplicação direta</option></select></td>' +
            '<td><input data-f="marca" list="dl-marca" data-prod="' + (it.produtoId || '') + '" value="' + U.esc(it.marca) + '" aria-label="Marca"></td>' +
            '<td><input data-f="obs" value="' + U.esc(it.obs || '') + '" aria-label="Observação"></td>' +
            (verPreco ? '<td class="n small">' + (up ? U.money(up) : '—') + '</td>' : '') +
            '<td class="act"><button class="btn icon ghost danger" data-del="' + i + '" title="Excluir item" aria-label="Excluir item">' + UI.icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table>';
      if (UI.$('#s-aprop-box')) UI.$('#s-aprop-box').hidden = !sol.itens.some(i => i.destino === 'aplicacao') && sol.destino === 'estoque';
      const est = D.solTotalEstimado(sol);
      UI.$('#it-sum').textContent = sol.itens.length + ' item(ns)' + (est ? ' · estimativa ' + U.money(est) : '');
    }
    function drawAtt() {
      UI.$('#att').innerHTML = UI.attachList(sol.anexos, true);
    }
    drawItems(); drawAtt();

    function addItem(it) {
      const n = Object.assign({ id: '', produtoId: '', descricao: '', qtd: 1, unidade: 'UN', marca: '', obs: '', categoria: '' }, it);
      if (n.produtoId && !n.categoria) n.categoria = catDe(S.find('produtos', n.produtoId));
      // destino único: o item já entra marcado; com "Ambas" fica em branco para ser informado
      n.destino = sol.destino === 'ambas' ? (it && it.destino) || '' : sol.destino;
      sol.itens.push(n);
    }

    UI.$('#it-tbl').addEventListener('change', e => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      const it = sol.itens[Number(tr.dataset.i)];
      const f = e.target.dataset.f;
      if (f === 'categoria') {
        // nova categoria = nova consulta: limpa o produto escolhido em outra categoria
        if (it.produtoId && catDe(S.find('produtos', it.produtoId)) !== e.target.value) { it.produtoId = ''; it.descricao = ''; it.marca = ''; }
        it.categoria = e.target.value;
        drawItems();
        const inp = UI.$('#it-tbl tr[data-i="' + tr.dataset.i + '"] input[data-f="descricao"]');
        if (inp && !inp.disabled) inp.focus();
        return;
      }
      if (f === 'destino') {
        const novo = e.target.value;
        if (sol.destino !== 'ambas' && novo !== sol.destino) {
          const sel = e.target;
          UI.confirm('A solicitação está marcada como "' + D.DESTINO[sol.destino] + '". Mudar este item para "' + D.DESTINO[novo] + '"? A solicitação passará a "Ambas".', 'Mudar destino', false).then(ok => {
            if (!ok) { sel.value = it.destino; return; }
            it.destino = novo;
            sol.destino = 'ambas';
            UI.$$('input[name="s-dest"]').forEach(x => { x.checked = x.value === 'ambas'; });
            ajudaDestino();
            drawItems();
          });
          return;
        }
        it.destino = novo;
        tr.classList.toggle('conf-baixa', !it.categoria || !it.destino);
        return;
      }
      if (f === 'descricao') {
        const p = byLabel[e.target.value];
        if (p && catDe(p) !== it.categoria) {
          UI.toast('Este produto é da categoria "' + catNome(catDe(p)) + '". Troque a categoria do item antes de escolhê-lo.', 'bad');
          e.target.value = it.descricao;
          return;
        }
        if (p) {
          it.produtoId = p.id; it.descricao = p.descricao; it.unidade = p.unidade || it.unidade;
          if (!it.marca && p.marcas && p.marcas.length === 1) it.marca = p.marcas[0];
        } else {
          it.descricao = e.target.value;
          const pr = S.find('produtos', it.produtoId);
          if (!pr || U.norm(pr.descricao) !== U.norm(it.descricao)) it.produtoId = '';
        }
        it.confianca = '';
        drawItems();
      } else if (f === 'qtd') {
        it.qtd = U.parseNum(e.target.value);
        drawItems();
      } else it[f] = e.target.value;
    });
    UI.$('#it-tbl').addEventListener('focusin', e => {
      if (e.target.dataset.f !== 'marca') return;
      const p = S.find('produtos', e.target.dataset.prod);
      UI.$('#dl-marca').innerHTML = (p && p.marcas || []).map(m => '<option value="' + U.esc(m) + '"></option>').join('');
    });
    UI.$('#it-tbl').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (b) { sol.itens.splice(Number(b.dataset.del), 1); drawItems(); }
    });
    UI.$('#att').addEventListener('click', e => {
      const d = e.target.closest('[data-del-att]');
      if (d) { e.preventDefault(); sol.anexos = sol.anexos.filter(a => a.id !== d.dataset.delAtt); drawAtt(); return; }
      const o = e.target.closest('[data-open-att]');
      if (o) { e.preventDefault(); UI.openAttachment(sol.anexos.find(a => a.id === o.dataset.openAtt)); }
    });

    UI.$('#cap-add').onclick = () => {
      addItem({});
      drawItems();
      const sels = UI.$$('#it-tbl select[data-f="categoria"]');
      if (sels.length) sels[sels.length - 1].focus();
    };

    if (UI.$('#add-sol')) UI.$('#add-sol').onclick = () => V.cadQuickAdd('solicitantes', novo => {
      UI.$('#s-sol').innerHTML = UI.options(S.all('solicitantes'), novo.id, x => x.codigo + ' · ' + x.nome, 'Selecione…');
    });

    // aplica cabeçalho interpretado (voz/OCR) sem sobrescrever o que já foi preenchido
    function applyHeader(hd) {
      if (hd.solicitanteId && !UI.$('#s-sol').value) UI.$('#s-sol').value = hd.solicitanteId;
      if (hd.compradorId && !UI.$('#s-comp').value) UI.$('#s-comp').value = hd.compradorId;
      if (hd.centroCustoId && !UI.$('#s-cc').value) UI.$('#s-cc').value = hd.centroCustoId;
      if (hd.destino && hd.destino !== sol.destino) {
        sol.destino = hd.destino;
        UI.$$('input[name="s-dest"]').forEach(r => { r.checked = r.value === hd.destino; });
        sol.itens.forEach(it => { it.destino = hd.destino; });
        ajudaDestino();
      }
      if (hd.prioridade) UI.$('#s-pri').value = hd.prioridade;
      if (hd.aplicacao && !UI.$('#s-apl').value) UI.$('#s-apl').value = hd.aplicacao;
      if (hd.necessidade) UI.$('#s-nec').value = hd.necessidade;
    }

    function review(items, hd, origem, rawText) {
      V.revisarItens(items, hd, rawText, (sel, header) => {
        sel.forEach(it => addItem(it));
        applyHeader(header);
        if (!orig && !sol.itens.some(i => i.id)) sol.origemEntrada = origem;
        drawItems();
        UI.toast(sel.length + ' item(ns) adicionados — confira antes de salvar', 'ok');
      }, origem);
    }

    // ---- digitalizada
    async function handleFiles(files) {
      for (const file of files) {
        const pg = UI.progress('Lendo ' + file.name);
        try {
          const att = await C.toAttachment(file);
          sol.anexos.push(att); drawAtt();
          const txt = await C.extractText(file, (pct, msg) => pg.set(pct, msg));
          pg.close();
          const cad = { solicitantes: S.all('solicitantes'), compradores: S.all('compradores'), centrosCusto: S.all('centrosCusto') };
          let items = P.parseItems(txt, { mode: 'ocr', produtos: S.all('produtos') });
          if (!items.length) items = P.parseItems(txt, { mode: 'ocr', produtos: S.all('produtos'), acceptWithoutQty: true });
          review(items, P.parseHeader(txt, cad), 'digitalizada', txt);
        } catch (err) {
          pg.close();
          UI.toast(err.message || 'Não foi possível ler o arquivo', 'bad');
        }
      }
    }
    UI.$('#cap-file').onclick = async () => handleFiles(await UI.pickFile('image/*,application/pdf,.xlsx,.xls,.csv,.txt', true));
    UI.$('#cap-cam').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
      inp.onchange = () => handleFiles(Array.from(inp.files || []));
      inp.click();
    };
    const drop = UI.$('#cap-scan');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); handleFiles(Array.from(e.dataTransfer.files || [])); });

    // ---- voz
    let listener = null;
    const micBtn = UI.$('#cap-mic');
    function stopMic() {
      if (listener) { listener.stop(); listener = null; }
      micBtn.classList.remove('rec');
      micBtn.innerHTML = UI.icon('mic') + 'Começar a ditar';
      UI.$('#cap-int').textContent = '';
    }
    micBtn.onclick = () => {
      if (listener) { stopMic(); return; }
      UI.$('#cap-tr').hidden = false;
      if (!C.voiceSupported()) {
        UI.toast('Reconhecimento de voz indisponível neste navegador. Use Chrome ou Edge — ou use o microfone do teclado do celular no campo de texto.', 'bad');
        UI.$('#cap-text').focus();
        return;
      }
      try {
        listener = C.listen({
          initial: UI.$('#cap-text').value,
          onText: (fin, interim) => { UI.$('#cap-text').value = fin; UI.$('#cap-int').textContent = interim; },
          onError: msg => { UI.toast(msg, 'bad'); stopMic(); },
          onEnd: () => stopMic()
        });
        micBtn.classList.add('rec');
        micBtn.innerHTML = UI.icon('mic') + 'Parar';
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
    UI.$('#cap-clear').onclick = () => { UI.$('#cap-text').value = ''; };
    UI.$('#cap-parse').onclick = () => {
      stopMic();
      const txt = UI.$('#cap-text').value.trim();
      if (!txt) { UI.toast('Dite ou digite os itens primeiro', 'bad'); return; }
      const cad = { solicitantes: S.all('solicitantes'), compradores: S.all('compradores'), centrosCusto: S.all('centrosCusto') };
      review(P.parseItems(txt, { mode: 'voz', produtos: S.all('produtos') }), P.parseHeader(txt, cad), 'voz', null);
    };

    if (modo === 'voz') { UI.$('#cap-tr').hidden = false; setTimeout(() => micBtn.focus(), 50); }
    if (modo === 'digitalizada') setTimeout(() => UI.$('#cap-file').focus(), 50);
    if (!modo && !orig && !sol.itens.length) { addItem({}); drawItems(); }

    async function save(andNew) {
      stopMic();
      sol.solicitanteId = UI.$('#s-sol').value;
      sol.compradorId = UI.$('#s-comp').value;
      sol.centroCustoId = UI.$('#s-cc').value;
      sol.destino = (UI.$('input[name="s-dest"]:checked') || {}).value || 'aplicacao';
      sol.aplicacao = UI.$('#s-apl').value.trim();
      sol.prioridade = UI.$('#s-pri').value;
      sol.necessidade = UI.$('#s-nec').value;
      sol.obs = UI.$('#s-obs').value.trim();
      sol.itens = sol.itens.filter(i => i.descricao && i.descricao.trim());
      const erros = [];
      if (!sol.solicitanteId && !perm.basico) erros.push('o solicitante');
      if (!sol.centroCustoId) erros.push('o centro de custo');
      if (!sol.itens.length) erros.push('ao menos um item');
      if (sol.itens.some(i => !(Number(i.qtd) > 0))) erros.push('quantidade maior que zero em todos os itens');
      if (sol.itens.some(i => !i.categoria)) erros.push('a categoria de todos os itens');
      if (erros.length) { UI.toast('Informe ' + erros.join(', ') + '.', 'bad'); drawItems(); return; }
      const porCat = (UI.$('input[name="s-aprop"]:checked') || {}).value === 'cat';
      sol.equipamentoId = porCat ? '' : UI.$('#s-eq').value;
      sol.categoriaDespesaId = porCat ? UI.$('#s-cat').value : '';
      if (sol.itens.some(i => i.destino === 'aplicacao') && !sol.equipamentoId && !sol.categoriaDespesaId) {
        UI.toast('Informe o equipamento ou a categoria de despesa que receberá o custo dos itens de aplicação direta.', 'bad');
        return;
      }
      const errosDestino = R.validarDestinos(sol);
      if (errosDestino.length) { UI.toast(errosDestino[0], 'bad'); drawItems(); return; }
      if (perm.basico && (eu.centros || []).indexOf(sol.centroCustoId) < 0) { UI.toast('Escolha um dos seus centros de custo.', 'bad'); return; }
      sol.itens.forEach(i => { delete i.confianca; delete i.codigo; });
      if (sol.status === 'rascunho') sol.status = 'aberta';
      const btn = UI.$('#save');
      btn.disabled = true;
      D.salvarSolicitacao(sol);
      try {
        if (root.Cloud.ativo()) await root.Cloud.gravarAgora();
      } catch (err) {
        btn.disabled = false;
        UI.toast('A solicitação não foi gravada no banco: ' + err.message, 'bad');
        return;
      }
      UI.toast('Solicitação ' + sol.numero + ' salva' + (root.Cloud.ativo() ? ' no banco central' : ''), 'ok');
      location.hash = andNew ? '#/solicitacoes/nova' : '#/solicitacoes/' + sol.id;
      if (andNew) root.App.route();
    }
    UI.$('#save').onclick = () => save(false);
  };

  /* Tela de conferência de itens interpretados (voz / OCR / texto) */
  V.revisarItens = function (items, hd, rawText, onOk, origem) {
    let list = items.map(x => Object.assign({ usar: true }, x));
    const hdTxt = [];
    if (hd.solicitanteId) hdTxt.push('Solicitante: ' + D.pessoa('solicitantes', hd.solicitanteId));
    if (hd.centroCustoId) hdTxt.push('Centro de custo: ' + D.centro(hd.centroCustoId));
    if (hd.destino) hdTxt.push('Destino: ' + D.DESTINO[hd.destino]);
    if (hd.prioridade) hdTxt.push('Prioridade: ' + D.PRIORIDADE[hd.prioridade]);
    if (hd.aplicacao) hdTxt.push('Aplicação: ' + hd.aplicacao);
    if (hd.necessidade) hdTxt.push('Necessário até: ' + U.date(hd.necessidade));

    const body = () => (hdTxt.length ? '<div class="note">Dados reconhecidos — ' + U.esc(hdTxt.join(' · ')) + '</div>' : '') +
      (list.length ? '<p class="small muted" style="margin:0">Confira os itens. Linhas em amarelo não tinham quantidade clara. Desmarque o que não deve entrar.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Descrição</th><th class="n">Qtd</th><th>Unid</th><th>Marca</th><th>Produto cadastrado</th></tr></thead><tbody>' +
        list.map((it, i) => '<tr data-i="' + i + '" class="' + (it.confianca === 'baixa' ? 'conf-baixa' : '') + '"><td><input type="checkbox" data-f="usar"' + (it.usar ? ' checked' : '') + ' aria-label="Usar item"></td>' +
          '<td><input data-f="descricao" value="' + U.esc(it.descricao) + '"></td><td style="width:100px"><input class="n" data-f="qtd" value="' + U.num(it.qtd) + '"></td>' +
          '<td style="width:95px"><select data-f="unidade">' + UI.unitOptions(it.unidade) + '</select></td><td style="width:130px"><input data-f="marca" value="' + U.esc(it.marca) + '"></td>' +
          '<td class="small">' + (it.produtoId ? '<b>' + U.esc((S.find('produtos', it.produtoId) || {}).codigo || '') + '</b>' : '<span class="muted">será cadastrado</span>') + '</td></tr>').join('') +
        '</tbody></table></div>'
        : '<div class="note warn">Nenhum item foi reconhecido automaticamente. Corrija o texto abaixo (um item por linha, ex.: “10 PC Parafuso M12”) e clique em Reinterpretar.</div>') +
      (rawText !== null ? '<details' + (list.length ? '' : ' open') + '><summary class="small">Texto lido do documento</summary><textarea id="rv-raw" rows="8" style="margin-top:8px">' + U.esc(rawText) + '</textarea><button class="btn sm" id="rv-re" style="margin-top:6px">' + UI.icon('wand') + 'Reinterpretar</button></details>' : '');

    const m = UI.modal({
      title: 'Conferir itens reconhecidos', size: 'wide', body: body(),
      buttons: [{ label: 'Descartar' }, { label: 'Adicionar à solicitação', cls: 'pri', icon: 'check', action: () => {
        const sel = list.filter(x => x.usar && x.descricao).map(x => { const c = Object.assign({}, x); delete c.usar; return c; });
        onOk(sel, hd);
      } }],
      onMount: el => bind(el)
    });
    function bind(el) {
      el.querySelector('.bd').addEventListener('change', e => {
        const tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        const it = list[Number(tr.dataset.i)];
        const f = e.target.dataset.f;
        if (f === 'usar') it.usar = e.target.checked;
        else if (f === 'qtd') { it.qtd = U.parseNum(e.target.value); it.confianca = ''; }
        else it[f] = e.target.value;
      });
      const re = el.querySelector('#rv-re');
      if (re) re.onclick = () => {
        const txt = el.querySelector('#rv-raw').value;
        rawText = txt;
        list = P.parseItems(txt, { mode: 'ocr', produtos: S.all('produtos'), acceptWithoutQty: true }).map(x => Object.assign({ usar: true }, x));
        el.querySelector('.bd').innerHTML = body();
        bind(el);
      };
    }
    return m;
  };

  /* ---------- Detalhe ---------- */
  V.solView = function (id) {
    const sol = S.find('solicitacoes', id);
    if (!sol) { location.hash = '#/solicitacoes'; return; }
    const perm = Auth.perm;
    if (!R.podeVerSolicitacao(perm, Auth.user, sol)) { UI.toast('Você não tem acesso a esta solicitação.', 'bad'); location.hash = '#/solicitacoes'; return; }
    const editavel = R.podeEditarSolicitacao(perm, Auth.user, sol);
    const excluirItens = perm.excluirItensSolicitados && ['aberta', 'rascunho', 'em_cotacao'].indexOf(sol.status) > -1 && sol.itens.length > 1;
    UI.setHeader(sol.numero, 'Solicitações',
      '<button class="btn" data-go="#/solicitacoes">' + UI.icon('back') + 'Voltar</button>' +
      '<button class="btn" id="prt">' + UI.icon('print') + 'Imprimir</button>' +
      '<button class="btn" id="dup">' + UI.icon('copy') + 'Duplicar</button>' +
      (editavel ? '<button class="btn" data-go="#/solicitacoes/' + sol.id + '/editar">' + UI.icon('edit') + 'Editar</button>' : '') +
      (sol.status === 'aberta' && perm.processoCompras ? '<button class="btn sun" id="cotar">' + UI.icon('quote') + 'Enviar para cotação</button>' : ''));

    const order = ['aberta', 'em_cotacao', 'pedido', 'atendida'];
    const idx = order.indexOf(sol.status);
    const cots = S.all('cotacoes').filter(c => c.solicitacaoIds.indexOf(sol.id) > -1);
    const peds = S.all('pedidos').filter(p => p.itens.some(i => i.solicitacaoId === sol.id));

    let h = '<div class="card"><div class="bd"><div class="row" style="justify-content:space-between"><div class="steps">' +
      ['Aberta', 'Em cotação', 'Pedido emitido', 'Atendida'].map((t, i) => '<span class="' + (sol.status === 'cancelada' ? '' : i < idx ? 'done' : i === idx ? 'now' : '') + '">' + t + '</span>').join('') +
      '</div>' + UI.pill(D.STATUS_SOL, sol.status) + '</div></div></div>';
    h += '<div class="grid g2"><div class="card"><div class="hd"><h2>Dados</h2></div><div class="bd"><dl class="kv">' +
      '<dt>Solicitante</dt><dd>' + U.esc(D.solicitanteNome(sol)) + '</dd>' +
      '<dt>Comprador(a)</dt><dd>' + U.esc(D.pessoa('compradores', sol.compradorId)) + '</dd>' +
      '<dt>Centro de custo</dt><dd>' + U.esc(D.centro(sol.centroCustoId)) + '</dd>' +
      '<dt>Destino</dt><dd>' + UI.destinoTag(sol.destino) + '</dd>' +
      (sol.itens.some(i => i.destino === 'aplicacao') ? '<dt>Custo apropriado em</dt><dd>' + U.esc(D.apropriacao(sol)) + '</dd>' : '') +
      '<dt>Local / observação</dt><dd>' + U.esc(sol.aplicacao || '—') + '</dd>' +
      '<dt>Prioridade</dt><dd>' + (sol.prioridade === 'urgente' ? '<span class="tag urg">Urgente</span>' : U.esc(D.PRIORIDADE[sol.prioridade])) + '</dd>' +
      '<dt>Data / necessidade</dt><dd>' + U.date(sol.data) + ' → ' + U.date(sol.necessidade) + '</dd>' +
      '<dt>Entrada</dt><dd>' + U.esc(D.ORIGEM[sol.origemEntrada] || '—') + '</dd>' +
      (sol.obs ? '<dt>Observações</dt><dd>' + U.esc(sol.obs) + '</dd>' : '') +
      '</dl></div></div>';
    h += '<div class="card"><div class="hd"><h2>Acompanhamento</h2></div><div class="bd stack">' +
      (cots.length ? '<div>Cotações: ' + cots.map(c => (perm.processoCompras ? '<a href="#/cotacoes/' + c.id + '">' + c.numero + '</a> ' : c.numero + ' ') + UI.pill(D.STATUS_COT, c.status)).join(' ') + '</div>' : '') +
      (peds.length ? '<div>Pedidos: ' + peds.map(p => (perm.processoCompras ? '<a href="#/pedidos/' + p.id + '">' + p.numero + '</a> ' : p.numero + ' ') + UI.pill(D.STATUS_PED, p.status)).join(' ') + '</div>' : '') +
      S.all('entregas').filter(e => e.solicitacaoId === sol.id).map(e => '<div>Entrega <a href="#/recebimentos">' + e.numero + '</a> (' + (e.origem === 'estoque' ? 'do estoque' : 'compra ' + U.esc(e.pedidoNumero || '')) + ') ' + UI.pill(D.STATUS_ENT, e.status) + '</div>').join('') +
      (sol.criadoPorNome ? '<div class="small muted">Registrada por ' + U.esc(sol.criadoPorNome) + ' em ' + U.dateTime(sol.criadoEm) + '</div>' : '') +
      (!editavel && perm.basico && ['aberta', 'rascunho'].indexOf(sol.status) < 0 ? '<div class="note small">O processo de compra já começou: alterações só podem ser feitas por compradores ou administradores.</div>' : '') +
      '<ul class="timeline">' + (sol.historico || []).slice().reverse().map(e => '<li><span>' + U.dateTime(e.data) + '</span><div>' + U.esc(e.evento) + '</div></li>').join('') + '</ul></div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Itens</h2>' + (perm.comprador ? '<span class="muted small">Estimativa pelo último preço: ' + U.money(D.solTotalEstimado(sol)) + '</span>' : '') + '</div><div class="bd flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Categoria</th><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th>Unid</th><th>Destino</th><th>Marca</th><th>Observação</th><th class="n">Saldo estoque</th>' + (excluirItens ? '<th></th>' : '') + '</tr></thead><tbody>' +
      sol.itens.map((it, i) => { const p = S.find('produtos', it.produtoId); return '<tr><td>' + (i + 1) + '</td><td class="small">' + U.esc(catNome(it.categoria || catDe(p))) + '</td><td>' + U.esc(p ? p.codigo : '') + '</td><td>' + U.esc(it.descricao) + '</td><td class="n">' + U.num(it.qtd) + '</td><td>' + U.esc(it.unidade) + '</td><td>' + UI.destinoTag(it.destino) + (it.atendidoEstoque ? '<br><span class="small muted">' + U.num(it.atendidoEstoque) + ' do estoque</span>' : '') + '</td><td>' + U.esc(it.marca) + '</td><td>' + U.esc(it.obs) + '</td><td class="n">' + (p ? U.num(D.saldo(p.id)) : '—') + '</td>' +
        (excluirItens ? '<td class="act"><button class="btn icon ghost danger" data-del-item="' + it.id + '" title="Excluir item (administrador)" aria-label="Excluir item">' + UI.icon('trash') + '</button></td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div></div></div>';
    h += '<div class="card"><div class="hd"><h2>Anexos</h2></div><div class="bd" id="att">' + UI.attachList(sol.anexos) + '</div></div>';
    const podeExcluir = !cots.length && ((perm.admin && ['aberta', 'rascunho', 'cancelada'].indexOf(sol.status) > -1) || (editavel && perm.basico));
    h += '<div class="row">' + (editavel ? '<button class="btn danger" id="cancel">' + UI.icon('x') + 'Cancelar solicitação</button>' : '') +
      (podeExcluir ? '<button class="btn danger" id="del">' + UI.icon('trash') + 'Excluir</button>' : '') + '</div>';
    const v = UI.render(h);

    UI.$('#att', v).addEventListener('click', e => {
      const o = e.target.closest('[data-open-att]');
      if (o) { e.preventDefault(); UI.openAttachment(sol.anexos.find(a => a.id === o.dataset.openAtt)); }
    });
    UI.$('#prt').onclick = () => UI.print(Docs.solicitacaoHtml(sol));
    v.addEventListener('click', async e => {
      const b = e.target.closest('[data-del-item]');
      if (!b) return;
      const it = sol.itens.find(x => x.id === b.dataset.delItem);
      if (!(await UI.confirm('Excluir o item "' + it.descricao + '" da solicitação ' + sol.numero + '? A exclusão fica registrada.', 'Excluir item'))) return;
      sol.itens = sol.itens.filter(x => x.id !== it.id);
      sol.historico.push({ data: U.nowIso(), evento: 'Item "' + it.descricao + '" excluído por ' + Auth.user.nome });
      // retira o item também das cotações em andamento
      S.all('cotacoes').filter(c => c.status !== 'finalizada' && c.status !== 'cancelada').forEach(c => {
        const ci = c.itens.find(x => x.solItemId === it.id);
        if (ci) { c.itens = c.itens.filter(x => x !== ci); delete c.selecao[ci.id]; }
      });
      S.save();
      UI.toast('Item excluído', 'ok');
      V.solView(id);
    });
    UI.$('#dup').onclick = () => {
      const n = D.novaSolicitacao();
      Object.assign(n, { solicitanteId: sol.solicitanteId, compradorId: sol.compradorId, centroCustoId: sol.centroCustoId, destino: sol.destino, aplicacao: sol.aplicacao, prioridade: sol.prioridade, obs: sol.obs });
      n.itens = sol.itens.map(i => Object.assign({}, i, { id: U.uid() }));
      D.salvarSolicitacao(n);
      UI.toast('Criada ' + n.numero + ' a partir de ' + sol.numero, 'ok');
      location.hash = '#/solicitacoes/' + n.id + '/editar';
    };
    const cot = UI.$('#cotar');
    if (cot) cot.onclick = () => V.iniciarCotacao([sol.id]);
    const cancel = UI.$('#cancel');
    if (cancel) cancel.onclick = async () => {
      if (!(await UI.confirm('Cancelar a solicitação ' + sol.numero + '?', 'Cancelar solicitação'))) return;
      sol.status = 'cancelada';
      sol.historico.push({ data: U.nowIso(), evento: 'Solicitação cancelada' });
      S.log('Cancelada ' + sol.numero);
      S.save();
      V.solView(id);
    };
    const del = UI.$('#del');
    if (del) del.onclick = async () => {
      if (!(await UI.confirm('Excluir definitivamente a solicitação ' + sol.numero + '? Esta ação não pode ser desfeita.', 'Excluir'))) return;
      S.log('Excluída ' + sol.numero);
      S.remove('solicitacoes', sol.id);
      UI.toast('Solicitação excluída', 'ok');
      location.hash = '#/solicitacoes';
    };
  };
})(window);
