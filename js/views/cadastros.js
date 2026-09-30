/* Cadastros: fornecedores, produtos (com marcas e histórico de preços), solicitantes, compradores, centros de custo */
(function (root) {
  'use strict';
  const { U, S, D, UI, C } = root;
  const V = root.V = root.V || {};

  const DEF = {
    fornecedores: {
      col: 'fornecedores', titulo: 'Fornecedores', um: 'fornecedor', prefixo: 'FOR',
      campos: [
        ['codigo', 'Código', 's2'], ['razao', 'Razão social', 's6', true], ['fantasia', 'Nome fantasia', 's4'],
        ['cnpj', 'CNPJ / CPF', 's3'], ['contato', 'Contato', 's3'], ['email', 'E-mail', 's3', false, 'email'], ['telefone', 'Telefone', 's3'],
        ['whatsapp', 'WhatsApp', 's3'], ['cidade', 'Cidade', 's3'], ['uf', 'UF', 's2'], ['categorias', 'Categorias fornecidas', 's4', false, 'text', 'Ex.: EPI, rolamentos, lubrificantes'],
        ['obs', 'Observações', 's12', false, 'textarea']
      ],
      colunas: [['codigo', 'Código'], ['razao', 'Razão social', f => '<b>' + U.esc(f.fantasia || f.razao) + '</b>' + (f.fantasia ? '<br><span class="small muted">' + U.esc(f.razao) + '</span>' : '')],
        ['cnpj', 'CNPJ'], ['contato', 'Contato', f => U.esc([f.contato, f.telefone].filter(Boolean).join(' · ')) + (f.email ? '<br><span class="small muted">' + U.esc(f.email) + '</span>' : '')],
        ['categorias', 'Categorias'], ['origem', 'Origem', f => f.origem === 'proposta' ? '<span class="tag est">Capturado de proposta</span>' : ''],
        ['compras', 'Comprado', f => { const t = U.sum(S.all('pedidos').filter(p => p.fornecedorId === f.id && p.status !== 'cancelado'), p => p.total); return t ? U.money(t) : '—'; }, 'n']]
    },
    produtos: {
      col: 'produtos', titulo: 'Produtos e marcas', um: 'produto', prefixo: 'MAT',
      campos: [
        ['codigo', 'Código', 's2'], ['descricao', 'Descrição', 's6', true], ['unidade', 'Unidade', 's2', false, 'unit'], ['categoria', 'Categoria', 's2'],
        ['marcas', 'Marcas aceitas (separe por vírgula)', 's6', false, 'marcas'], ['ncm', 'NCM', 's2'], ['estoqueMin', 'Estoque mínimo', 's2', false, 'num'], ['estoqueMax', 'Estoque máximo', 's2', false, 'num'],
        ['obs', 'Especificação técnica / observações', 's12', false, 'textarea']
      ],
      colunas: [['codigo', 'Código'], ['descricao', 'Descrição', p => '<b>' + U.esc(p.descricao) + '</b>' + (p.origem && p.origem !== 'cadastro' ? '<br><span class="small muted">capturado de ' + U.esc(p.origem) + '</span>' : '')],
        ['unidade', 'Unid'], ['categoria', 'Categoria'], ['marcas', 'Marcas', p => (p.marcas || []).map(m => '<span class="tag">' + U.esc(m) + '</span>').join(' ')],
        ['ultimo', 'Último preço', p => { const v = D.ultimoPreco(p); return v ? U.money(v) : '—'; }, 'n'],
        ['saldo', 'Saldo', p => U.num(D.saldo(p.id)), 'n']]
    },
    solicitantes: {
      col: 'solicitantes', titulo: 'Solicitantes', um: 'solicitante', prefixo: 'SOL',
      campos: [['codigo', 'Código', 's2'], ['nome', 'Nome', 's6', true], ['setor', 'Setor', 's4'], ['email', 'E-mail', 's6', false, 'email'], ['telefone', 'Telefone', 's6']],
      colunas: [['codigo', 'Código'], ['nome', 'Nome'], ['setor', 'Setor'], ['email', 'E-mail'], ['n', 'Solicitações', x => S.all('solicitacoes').filter(s => s.solicitanteId === x.id).length, 'n']]
    },
    compradores: {
      col: 'compradores', titulo: 'Compradores', um: 'comprador', prefixo: 'COMP',
      campos: [['codigo', 'Código', 's2'], ['nome', 'Nome', 's6', true], ['email', 'E-mail', 's4', false, 'email'], ['telefone', 'Telefone', 's4']],
      colunas: [['codigo', 'Código'], ['nome', 'Nome'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['n', 'Cotações', x => S.all('cotacoes').filter(c => c.compradorId === x.id).length, 'n']]
    },
    centros: {
      col: 'centrosCusto', titulo: 'Centros de custo', um: 'centro de custo', prefixo: 'CC',
      campos: [['codigo', 'Código', 's3', true], ['descricao', 'Descrição', 's9', true]],
      colunas: [['codigo', 'Código'], ['descricao', 'Descrição'], ['g', 'Comprado', x => { const t = U.sum(S.all('pedidos').filter(p => p.status !== 'cancelado'), p => U.sum(p.itens.filter(i => i.centroCustoId === x.id), i => i.total)); return t ? U.money(t) : '—'; }, 'n']]
    }
  };
  DEF.centrosCusto = DEF.centros;

  const busca = {};

  V.cadastro = function (key) {
    const d = DEF[key];
    UI.setHeader(d.titulo, 'Cadastros',
      (key === 'fornecedores' || key === 'produtos' ? '<button class="btn" id="imp">' + UI.icon('upload') + 'Importar planilha</button>' : '') +
      '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>' +
      '<button class="btn pri" id="novo">' + UI.icon('plus') + 'Novo ' + d.um + '</button>');
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar"><input type="search" id="q" placeholder="Buscar" value="' + U.esc(busca[key] || '') + '"></div><div class="acts muted small" id="cnt"></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>' +
      (key === 'produtos' ? '<p class="small muted" style="margin:0">Produtos digitados em solicitações ou recebidos em propostas entram aqui automaticamente, com marcas ofertadas e histórico de preços.</p>' : '') +
      (key === 'fornecedores' ? '<p class="small muted" style="margin:0">Fornecedores identificados em propostas importadas (CNPJ, e-mail, telefone) são cadastrados automaticamente.</p>' : ''));
    function draw() {
      const q = U.norm(busca[key] || '');
      const list = S.all(d.col).filter(x => !q || U.norm(Object.values(x).filter(v => typeof v === 'string').join(' ')).indexOf(q) > -1)
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
      UI.$('#cnt').textContent = list.length + ' registro(s)';
      UI.$('#tb').innerHTML = list.length ? '<table class="tbl"><thead><tr>' + d.colunas.map(c => '<th class="' + (c[3] || '') + '">' + c[1] + '</th>').join('') + '<th></th></tr></thead><tbody>' +
        list.map(x => '<tr class="click" data-id="' + x.id + '">' + d.colunas.map(c => '<td class="' + (c[3] || '') + '">' + (c[2] ? c[2](x) : U.esc(x[c[0]] || '')) + '</td>').join('') +
          '<td class="act"><button class="btn icon ghost" data-ed="' + x.id + '" title="Editar" aria-label="Editar">' + UI.icon('edit') + '</button><button class="btn icon ghost danger" data-rm="' + x.id + '" title="Excluir" aria-label="Excluir">' + UI.icon('trash') + '</button></td></tr>').join('') +
        '</tbody></table>' : UI.empty('Nenhum registro', 'Cadastre o primeiro ' + d.um + '.');
    }
    draw();
    UI.$('#q').oninput = U.debounce(e => { busca[key] = e.target.value; draw(); }, 200);
    UI.$('#novo').onclick = () => form(key, null, () => V.cadastro(key));
    UI.$('#tb').addEventListener('click', async e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const x = S.find(d.col, rm.dataset.rm);
        const usos = D.usos(d.col, x.id);
        if (usos.length) {
          if (key === 'fornecedores' || key === 'produtos') {
            if (await UI.confirm('Este ' + d.um + ' está em uso (' + usos.slice(0, 5).join(', ') + (usos.length > 5 ? '…' : '') + ') e não pode ser excluído sem perder o histórico. Deseja inativá-lo?', 'Inativar', false)) {
              x.ativo = false; S.save(); UI.toast('Inativado', 'ok'); draw();
            }
          } else UI.toast('Não é possível excluir: usado em ' + usos.slice(0, 5).join(', '), 'bad');
          return;
        }
        if (!(await UI.confirm('Excluir ' + d.um + ' "' + (x.nome || x.razao || x.descricao) + '"?', 'Excluir'))) return;
        S.remove(d.col, x.id);
        UI.toast('Excluído', 'ok');
        draw();
        return;
      }
      const tr = e.target.closest('[data-id]');
      if (tr) {
        if (key === 'produtos' && !e.target.closest('[data-ed]')) return produtoDetalhe(S.find(d.col, tr.dataset.id), () => V.cadastro(key));
        if (key === 'fornecedores' && !e.target.closest('[data-ed]')) return fornecedorDetalhe(S.find(d.col, tr.dataset.id), () => V.cadastro(key));
        form(key, S.find(d.col, tr.dataset.id), () => V.cadastro(key));
      }
    });
    UI.$('#exp').onclick = () => {
      const rows = [d.campos.map(c => c[1])];
      S.all(d.col).forEach(x => rows.push(d.campos.map(c => Array.isArray(x[c[0]]) ? x[c[0]].join(', ') : (x[c[0]] === undefined ? '' : x[c[0]]))));
      C.writeXlsx(key + '.xlsx', { [d.titulo]: rows }).catch(err => UI.toast(err.message, 'bad'));
    };
    if (UI.$('#imp')) UI.$('#imp').onclick = () => importar(key);
  };

  function form(key, obj, done) {
    const d = DEF[key];
    const x = obj ? JSON.parse(JSON.stringify(obj)) : { ativo: true, origem: 'cadastro' };
    if (!obj) x.codigo = S.nextCode(d.prefixo, d.col);
    const field = c => {
      const [k, label, span, req, type, ph] = c;
      let val = x[k];
      if (type === 'marcas') val = (val || []).join(', ');
      const id = 'cf-' + k;
      let inp;
      if (type === 'textarea') inp = '<textarea id="' + id + '" rows="2">' + U.esc(val || '') + '</textarea>';
      else if (type === 'unit') inp = '<select id="' + id + '">' + UI.unitOptions(val) + '</select>';
      else inp = '<input id="' + id + '" type="' + (type === 'email' ? 'email' : 'text') + '"' + (type === 'num' ? ' class="n" inputmode="decimal"' : '') + ' value="' + U.esc(val === undefined ? '' : (type === 'num' ? U.num(val) : val)) + '"' + (ph ? ' placeholder="' + U.esc(ph) + '"' : '') + '>';
      return '<div class="f ' + span + '"><label for="' + id + '">' + label + (req ? ' *' : '') + '</label>' + inp + '</div>';
    };
    UI.modal({
      title: (obj ? 'Editar ' : 'Novo ') + d.um, size: key === 'fornecedores' || key === 'produtos' ? 'wide' : '',
      body: '<div class="form">' + d.campos.map(field).join('') + '</div>' +
        (obj && (key === 'fornecedores' || key === 'produtos') ? '<label class="row small"><input type="checkbox" id="cf-ativo"' + (x.ativo !== false ? ' checked' : '') + '> Ativo</label>' : ''),
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'pri', icon: 'check', action: m => {
        for (const c of d.campos) {
          const el = UI.$('#cf-' + c[0], m.el);
          let v = el.value.trim();
          if (c[4] === 'num') v = U.parseNum(v);
          if (c[4] === 'marcas') v = v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
          if (c[3] && !v) { UI.toast('Preencha: ' + c[1], 'bad'); el.focus(); return false; }
          x[c[0]] = v;
        }
        if (x.codigo && S.all(d.col).some(o => o.id !== x.id && String(o.codigo).toLowerCase() === String(x.codigo).toLowerCase())) { UI.toast('Já existe um cadastro com o código ' + x.codigo, 'bad'); return false; }
        if (key === 'fornecedores' && x.cnpj) {
          const dig = U.onlyDigits(x.cnpj);
          if (dig.length === 14 && !U.validCnpj(dig)) { UI.toast('CNPJ inválido — confira os dígitos', 'bad'); return false; }
          x.cnpj = U.fmtCnpj(dig);
          if (S.all('fornecedores').some(o => o.id !== x.id && U.onlyDigits(o.cnpj) === dig)) { UI.toast('Já existe fornecedor com este CNPJ', 'bad'); return false; }
        }
        const at = UI.$('#cf-ativo', m.el);
        if (at) x.ativo = at.checked;
        S.upsert(d.col, x);
        UI.toast((obj ? 'Alterado: ' : 'Cadastrado: ') + (x.nome || x.razao || x.descricao), 'ok');
        if (done) done(x);
      } }]
    });
  }

  V.cadQuickAdd = function (key, cb) { form(key, null, cb); };

  function produtoDetalhe(p, done) {
    const hist = (p.historicoPrecos || []).slice().reverse();
    const cots = (p.cotacoesRecebidas || []).slice().reverse();
    const precos = hist.map(h => h.preco);
    UI.modal({
      title: p.codigo + ' — ' + p.descricao, size: 'wide',
      body: '<dl class="kv"><dt>Unidade</dt><dd>' + U.esc(p.unidade) + '</dd><dt>Categoria</dt><dd>' + U.esc(p.categoria || '—') + '</dd><dt>Marcas</dt><dd>' + ((p.marcas || []).map(m => '<span class="tag">' + U.esc(m) + '</span>').join(' ') || '—') + '</dd>' +
        '<dt>Saldo em estoque</dt><dd>' + U.num(D.saldo(p.id)) + ' ' + U.esc(p.unidade) + ' (mínimo ' + U.num(p.estoqueMin || 0) + ')</dd>' +
        (precos.length ? '<dt>Preço pago</dt><dd>último ' + U.money(precos[0]) + ' · menor ' + U.money(Math.min.apply(null, precos)) + ' · maior ' + U.money(Math.max.apply(null, precos)) + '</dd>' : '') + '</dl>' +
        '<h3>Histórico de compras</h3>' + (hist.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Fornecedor</th><th>Marca</th><th class="n">Preço</th><th>Pedido</th></tr></thead><tbody>' +
          hist.map(h => '<tr><td>' + U.date(h.data) + '</td><td>' + U.esc(D.fornecedorNome(h.fornecedorId)) + '</td><td>' + U.esc(h.marca || '') + '</td><td class="n">' + U.money(h.preco) + '</td><td>' + U.esc(h.pedido || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Ainda não comprado.</p>') +
        '<h3>Preços recebidos em cotações</h3>' + (cots.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Fornecedor</th><th>Marca</th><th class="n">Preço</th><th>Cotação</th></tr></thead><tbody>' +
          cots.map(h => '<tr><td>' + U.date(h.data) + '</td><td>' + U.esc(D.fornecedorNome(h.fornecedorId)) + '</td><td>' + U.esc(h.marca || '') + '</td><td class="n">' + U.money(h.preco) + '</td><td>' + U.esc(h.cotacao || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Nenhuma cotação finalizada com este produto.</p>'),
      buttons: [{ label: 'Fechar' }, { label: 'Editar', cls: 'pri', icon: 'edit', action: () => { setTimeout(() => form('produtos', p, done), 0); } }]
    });
  }

  function fornecedorDetalhe(f, done) {
    const peds = S.all('pedidos').filter(p => p.fornecedorId === f.id);
    const cots = S.all('cotacoes').filter(c => c.propostas.some(p => p.fornecedorId === f.id));
    const venc = cots.filter(c => c.status === 'finalizada' && Object.values(c.selecao).some(pid => (c.propostas.find(p => p.id === pid) || {}).fornecedorId === f.id));
    UI.modal({
      title: f.fantasia || f.razao, size: 'wide',
      body: '<dl class="kv"><dt>Razão social</dt><dd>' + U.esc(f.razao) + '</dd><dt>CNPJ</dt><dd>' + U.esc(f.cnpj || '—') + (f.cnpj && U.onlyDigits(f.cnpj).length === 14 && !U.validCnpj(f.cnpj) ? ' <span class="tag urg">inválido</span>' : '') + '</dd>' +
        '<dt>Contato</dt><dd>' + U.esc([f.contato, f.telefone, f.whatsapp, f.email].filter(Boolean).join(' · ') || '—') + '</dd><dt>Local</dt><dd>' + U.esc([f.cidade, f.uf].filter(Boolean).join('/') || '—') + '</dd>' +
        '<dt>Categorias</dt><dd>' + U.esc(f.categorias || '—') + '</dd><dt>Desempenho</dt><dd>' + cots.length + ' proposta(s) enviada(s), ' + venc.length + ' cotação(ões) com itens vencidos, ' + peds.length + ' pedido(s) — ' + U.money(U.sum(peds.filter(p => p.status !== 'cancelado'), p => p.total)) + '</dd></dl>' +
        (peds.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Data</th><th class="n">Total</th><th>Status</th></tr></thead><tbody>' + peds.map(p => '<tr class="click" data-go="#/pedidos/' + p.id + '"><td>' + p.numero + '</td><td>' + U.date(p.data) + '</td><td class="n">' + U.money(p.total) + '</td><td>' + UI.pill(D.STATUS_PED, p.status) + '</td></tr>').join('') + '</tbody></table></div>' : ''),
      buttons: [{ label: 'Fechar' }, { label: 'Editar', cls: 'pri', icon: 'edit', action: () => { setTimeout(() => form('fornecedores', f, done), 0); } }]
    });
  }

  /* Importação em lote de fornecedores/produtos por planilha */
  async function importar(key) {
    const d = DEF[key];
    const files = await UI.pickFile('.xlsx,.xls,.csv,.ods');
    if (!files.length) return;
    try {
      const sh = await C.readSheet(files[0]);
      const rows = sh.rows.filter(r => r.some(c => String(c).trim()));
      if (rows.length < 2) { UI.toast('Planilha vazia', 'bad'); return; }
      const hdr = rows[0].map(h => U.norm(h));
      const map = {};
      d.campos.forEach(c => {
        const i = hdr.findIndex(h => h && (h === U.norm(c[1]) || h.indexOf(U.norm(c[0])) === 0 || U.norm(c[1]).indexOf(h) === 0));
        if (i > -1) map[c[0]] = i;
      });
      const principal = key === 'fornecedores' ? 'razao' : 'descricao';
      if (map[principal] === undefined) { UI.toast('Não encontrei a coluna "' + d.campos.find(c => c[0] === principal)[1] + '" na primeira linha da planilha', 'bad'); return; }
      let novos = 0, atual = 0;
      rows.slice(1).forEach(r => {
        const o = {};
        Object.keys(map).forEach(k => {
          let v = r[map[k]];
          const c = d.campos.find(x => x[0] === k);
          if (c[4] === 'num') v = U.parseNum(v);
          else if (c[4] === 'marcas') v = String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
          else if (c[4] === 'unit') v = root.P.unitCode(v) || String(v || 'UN').toUpperCase();
          else v = String(v === undefined ? '' : v).trim();
          o[k] = v;
        });
        if (!o[principal]) return;
        const ex = key === 'fornecedores'
          ? S.all(d.col).find(x => (o.cnpj && U.onlyDigits(x.cnpj) === U.onlyDigits(o.cnpj)) || U.norm(x.razao) === U.norm(o.razao))
          : S.all(d.col).find(x => (o.codigo && x.codigo === o.codigo) || U.norm(x.descricao) === U.norm(o.descricao));
        if (ex) { Object.keys(o).forEach(k => { if (o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) ex[k] = o[k]; }); atual++; }
        else {
          if (!o.codigo) o.codigo = S.nextCode(d.prefixo, d.col);
          if (o.cnpj) o.cnpj = U.fmtCnpj(o.cnpj);
          S.upsert(d.col, Object.assign({ ativo: true, origem: 'importação', historicoPrecos: key === 'produtos' ? [] : undefined, unidade: key === 'produtos' ? 'UN' : undefined }, o), true);
          novos++;
        }
      });
      S.save();
      UI.toast(novos + ' novo(s), ' + atual + ' atualizado(s)', 'ok');
      V.cadastro(key);
    } catch (err) { UI.toast(err.message, 'bad'); }
  }
})(window);
