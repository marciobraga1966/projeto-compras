/* Administração: usuários e categorias de acesso, alçadas de aprovação e registros (auditoria) */
(function (root) {
  'use strict';
  const { U, S, D, UI, R, Auth, C } = root;
  const V = root.V = root.V || {};

  const SIM = '<span class="pill ok">Sim</span>', NAO = '<span class="muted">—</span>';

  function negar(msg) {
    UI.setHeader('Acesso restrito', 'Administração');
    UI.render('<div class="card">' + UI.empty('Acesso restrito', msg) + '</div>');
  }

  /* ---------- Usuários ---------- */
  V.usuarios = async function () {
    if (!Auth.perm.gerenciarUsuarios) return negar('Somente administradores acessam o cadastro de usuários.');
    UI.setHeader('Usuários e acessos', 'Administração', '<button class="btn pri" id="novo">' + UI.icon('plus') + 'Novo usuário</button>');
    const v = UI.render('<div class="card"><div class="bd flush"><div class="tbl-wrap" id="tb"><div class="empty">Carregando…</div></div></div></div>' +
      '<div class="card"><div class="hd"><h2>Categorias de acesso</h2></div><div class="bd"><dl class="kv">' +
      '<dt>Básico</dt><dd>Cria e altera as próprias solicitações enquanto o processo de compra não começou; vê as solicitações dos centros de custo em que foi incluído; consulta produtos.</dd>' +
      '<dt>Comprador</dt><dd>Vê todas as solicitações, faz cotações, mapas, pedidos e recebimentos. Cadastra produtos e fornecedores somente se autorizado. Aprova pedidos conforme a alçada do cadastro de compradores.</dd>' +
      '<dt>Administrador</dt><dd>Acesso total: usuários, alçadas, cadastros base, exclusão de itens de solicitações e consulta dos registros.</dd>' +
      '<dt>Totalizadores</dt><dd>Valores de compras e economia do painel são dados sensíveis: aparecem só para quem recebeu a permissão.</dd>' +
      '</dl></div></div>');
    let lista;
    try { lista = await Auth.listarUsuarios(); }
    catch (err) { UI.$('#tb', v).innerHTML = '<div class="note bad">' + U.esc(err.message) + '</div>'; return; }
    UI.$('#tb', v).innerHTML = lista.length ? '<table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Categoria</th><th>Centros de custo</th><th>Totalizadores</th><th>Registros</th><th>Cadastra produtos/fornec.</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map(u => '<tr class="click" data-id="' + u.id + '"><td><b>' + U.esc(u.nome) + '</b>' + (u.id === Auth.user.id ? ' <span class="small muted">(você)</span>' : '') + '</td><td>' + U.esc(u.email) + '</td>' +
        '<td><span class="tag ' + (u.categoria === 'administrador' ? 'urg' : u.categoria === 'comprador' ? 'est' : '') + '">' + R.CATEGORIAS[u.categoria] + '</span></td>' +
        '<td class="small">' + ((u.centros || []).map(id => U.esc((S.find('centrosCusto', id) || {}).codigo || '?')).join(', ') || (u.categoria === 'basico' ? '<span class="tag urg">nenhum</span>' : 'todos')) + '</td>' +
        '<td>' + (u.categoria === 'administrador' || u.ver_totalizadores ? SIM : NAO) + '</td><td>' + (u.categoria === 'administrador' || u.ver_registros ? SIM : NAO) + '</td>' +
        '<td>' + (u.categoria === 'administrador' || (u.categoria === 'comprador' && u.pode_cadastros) ? SIM : NAO) + '</td>' +
        '<td>' + (u.ativo !== false ? '<span class="pill ok">Ativo</span>' : '<span class="pill bad">Inativo</span>') + '</td>' +
        '<td class="act"><button class="btn icon ghost" title="Editar" aria-label="Editar">' + UI.icon('edit') + '</button></td></tr>').join('') + '</tbody></table>'
      : UI.empty('Nenhum usuário', 'Cadastre os usuários do portal.');
    UI.$('#novo').onclick = () => usuarioForm(null);
    UI.$('#tb', v).addEventListener('click', e => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) usuarioForm(lista.find(u => u.id === tr.dataset.id));
    });
  };

  function usuarioForm(u) {
    const x = u ? JSON.parse(JSON.stringify(u)) : { nome: '', email: '', categoria: 'basico', centros: [], ativo: true, ver_totalizadores: false, ver_registros: false, pode_cadastros: false, solicitante_id: '', comprador_id: '' };
    const chk = (id, label, val, help) => '<label class="row small chk"><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> <span><b>' + label + '</b>' + (help ? '<br><span class="muted">' + help + '</span>' : '') + '</span></label>';
    UI.modal({
      title: u ? 'Editar usuário' : 'Novo usuário', size: 'wide',
      body: '<div class="form">' +
        '<div class="f s6"><label for="u-nome">Nome *</label><input id="u-nome" value="' + U.esc(x.nome) + '"></div>' +
        '<div class="f s6"><label for="u-email">E-mail (login) *</label><input id="u-email" type="email" value="' + U.esc(x.email) + '"' + (u && Auth.modo === 'nuvem' ? ' disabled' : '') + '></div>' +
        '<div class="f s4"><label for="u-cat">Categoria *</label><select id="u-cat">' + Object.keys(R.CATEGORIAS).map(k => '<option value="' + k + '"' + (x.categoria === k ? ' selected' : '') + '>' + R.CATEGORIAS[k] + '</option>').join('') + '</select></div>' +
        '<div class="f s4"><label for="u-senha">' + (u ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial *') + '</label><input id="u-senha" type="password" autocomplete="new-password" minlength="6"></div>' +
        '<div class="f s4"><label for="u-ativo">Situação</label><select id="u-ativo"><option value="1"' + (x.ativo !== false ? ' selected' : '') + '>Ativo</option><option value="0"' + (x.ativo === false ? ' selected' : '') + '>Inativo (sem acesso)</option></select></div>' +
        '<div class="f s6"><label for="u-sol">Vínculo com o cadastro de solicitantes</label><select id="u-sol">' + UI.options(S.all('solicitantes'), x.solicitante_id, s => s.codigo + ' · ' + s.nome, '— nenhum —') + '</select></div>' +
        '<div class="f s6"><label for="u-comp">Vínculo com o cadastro de compradores (alçada)</label><select id="u-comp">' + UI.options(S.all('compradores'), x.comprador_id, s => s.codigo + ' · ' + s.nome + (s.niveis && s.niveis.length ? ' — níveis ' + s.niveis.join(', ') : ''), '— nenhum —') + '</select></div>' +
        '<div class="f s12"><label>Centros de custo do usuário (o básico vê as solicitações destes centros)</label><div class="chips-sel" id="u-cc">' +
        S.all('centrosCusto').map(c => '<label class="row small"><input type="checkbox" value="' + c.id + '"' + ((x.centros || []).indexOf(c.id) > -1 ? ' checked' : '') + '> ' + U.esc(c.codigo + ' · ' + c.descricao) + '</label>').join('') + '</div></div>' +
        '</div>' +
        '<div class="grid g3">' +
        chk('u-tot', 'Ver totalizadores', x.ver_totalizadores, 'Valores comprados, economia e gastos no painel (dados sensíveis).') +
        chk('u-reg', 'Consultar registros', x.ver_registros, 'Aba de registros: quem fez o quê e quando.') +
        chk('u-cad', 'Cadastrar produtos e fornecedores', x.pode_cadastros, 'Somente para compradores.') +
        '</div><p class="small muted" style="margin:0">Administradores têm todas as permissões. Toda alteração neste cadastro fica registrada.</p>',
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar usuário', cls: 'pri', icon: 'check', action: async m => {
        const p = Object.assign({}, x, {
          nome: UI.$('#u-nome', m.el).value.trim(), email: UI.$('#u-email', m.el).value.trim(), categoria: UI.$('#u-cat', m.el).value,
          ativo: UI.$('#u-ativo', m.el).value === '1', solicitante_id: UI.$('#u-sol', m.el).value, comprador_id: UI.$('#u-comp', m.el).value,
          centros: UI.$$('#u-cc input:checked', m.el).map(i => i.value),
          ver_totalizadores: UI.$('#u-tot', m.el).checked, ver_registros: UI.$('#u-reg', m.el).checked,
          pode_cadastros: UI.$('#u-cad', m.el).checked && UI.$('#u-cat', m.el).value === 'comprador'
        });
        if (u && u.id === Auth.user.id && (p.categoria !== 'administrador' || !p.ativo)) { UI.toast('Você não pode remover o seu próprio acesso de administrador.', 'bad'); return false; }
        try {
          await Auth.salvarUsuario(p, UI.$('#u-senha', m.el).value);
          UI.toast('Usuário ' + p.email + ' salvo', 'ok');
          V.usuarios();
        } catch (err) { UI.toast(err.message, 'bad'); return false; }
      } }]
    });
  }

  /* ---------- Alçadas ---------- */
  V.alcadas = function () {
    if (!Auth.perm.gerenciarUsuarios) return negar('Somente administradores alteram as alçadas de compra.');
    UI.setHeader('Alçadas de aprovação', 'Administração', '<button class="btn pri" id="salvar">' + UI.icon('check') + 'Salvar alçadas</button>');
    let lista = R.ordenarAlcadas(S.db.alcadas).map(a => Object.assign({}, a));
    if (!lista.length) lista = [{ nivel: 1, limite: 500 }, { nivel: 2, limite: 1000 }, { nivel: 3, limite: null }];
    const v = UI.render('<div class="card"><div class="hd"><h2>Níveis e valores</h2><span class="muted small">O valor considerado é o total do pedido de compra (com frete)</span></div><div class="bd stack"><div class="tbl-wrap" id="al"></div>' +
      '<div class="row"><button class="btn" id="mais">' + UI.icon('plus') + 'Adicionar nível</button><button class="btn ghost danger" id="menos">Remover último nível</button></div>' +
      '<div class="note small">Regra: para aprovar um pedido do nível N, o autorizador precisa ter todos os níveis de 1 até N. Ex.: pedido de R$ 800 com limites 500/1000 → nível 2 → autorizador com níveis 1 e 2. Os níveis de cada autorizador são definidos em Cadastros → Compradores.</div>' +
      '</div></div><div class="card"><div class="hd"><h2>Autorizadores</h2></div><div class="bd flush"><div class="tbl-wrap">' +
      (S.all('compradores').length ? '<table class="tbl"><thead><tr><th>Comprador</th><th>Níveis</th></tr></thead><tbody>' + S.all('compradores').map(c => '<tr><td>' + U.esc(c.nome) + '</td><td>' + ((c.niveis || []).map(n => '<span class="tag">Nível ' + n + '</span>').join(' ') || '<span class="muted small">não aprova</span>') + '</td></tr>').join('') + '</tbody></table>' : UI.empty('Nenhum comprador cadastrado', '')) +
      '</div></div></div>');
    function draw() {
      UI.$('#al', v).innerHTML = '<table class="tbl"><thead><tr><th>Nível</th><th style="width:220px">Limite (R$)</th><th>Faixa</th><th>Quem aprova</th></tr></thead><tbody>' +
        lista.map((a, i) => {
          const ult = i === lista.length - 1;
          return '<tr><td><b>Nível ' + a.nivel + '</b></td><td>' + (ult ? '<label class="row small"><input type="checkbox" data-acima' + (a.limite === null ? ' checked' : '') + '> sem limite (acima)</label>' : '') +
            (a.limite === null && ult ? '' : '<input class="n" data-lim="' + i + '" inputmode="decimal" value="' + (a.limite === null ? '' : U.num(a.limite, 2)) + '" aria-label="Limite do nível ' + a.nivel + '">') + '</td>' +
            '<td>' + U.esc((R.descreverAlcada(lista)[i] || {}).faixa || '') + '</td><td>Autorizador com níveis ' + Array.from({ length: a.nivel }, (_, k) => k + 1).join(', ') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    draw();
    UI.$('#al', v).addEventListener('change', e => {
      if (e.target.dataset.lim !== undefined) lista[Number(e.target.dataset.lim)].limite = U.parseNum(e.target.value);
      if (e.target.hasAttribute('data-acima')) lista[lista.length - 1].limite = e.target.checked ? null : 0;
      draw();
    });
    UI.$('#mais').onclick = () => {
      const ult = lista[lista.length - 1];
      if (ult && ult.limite === null) ult.limite = (lista.length > 1 ? (lista[lista.length - 2].limite || 0) * 2 : 1000) || 1000;
      lista.push({ nivel: lista.length + 1, limite: null });
      draw();
    };
    UI.$('#menos').onclick = () => { if (lista.length > 1) { lista.pop(); lista[lista.length - 1].limite = null; draw(); } };
    UI.$('#salvar').onclick = async () => {
      if (!(await UI.confirm('Salvar as novas alçadas? Os próximos pedidos seguirão estes valores. A alteração fica registrada.', 'Salvar', false))) return;
      try { await Auth.salvarAlcadas(lista); UI.toast('Alçadas salvas', 'ok'); V.alcadas(); }
      catch (err) { UI.toast(err.message, 'bad'); }
    };
  };

  /* ---------- Registros (auditoria) ---------- */
  const ACAO = { criou: 'Criou', alterou: 'Alterou', excluiu: 'Excluiu', acesso: 'Acesso' };
  const filtro = { de: U.addDays(U.today(), -30), ate: U.today(), usuario: '', colecao: '' };

  V.registros = async function () {
    if (!Auth.perm.verRegistros) return negar('A consulta de registros depende de permissão dada pelo administrador.');
    UI.setHeader('Registros de atividades', 'Administração', '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>');
    const cols = ['solicitacoes', 'cotacoes', 'pedidos', 'fornecedores', 'produtos', 'solicitantes', 'compradores', 'centrosCusto', 'movimentos', 'usuarios', 'alcadas', '_sistema'];
    let usuarios = [];
    try { usuarios = await Auth.listarUsuarios(); } catch (e) { usuarios = []; }
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar">' +
      '<label class="small" for="r-de">De</label><input type="date" id="r-de" value="' + filtro.de + '" style="width:auto">' +
      '<label class="small" for="r-ate">até</label><input type="date" id="r-ate" value="' + filtro.ate + '" style="width:auto">' +
      '<select id="r-u" style="width:auto"><option value="">Todos os usuários</option>' + usuarios.map(u => '<option value="' + U.esc(u.email) + '"' + (u.email === filtro.usuario ? ' selected' : '') + '>' + U.esc(u.nome) + '</option>').join('') + '</select>' +
      '<select id="r-c" style="width:auto"><option value="">Tudo</option>' + cols.map(c => '<option value="' + c + '"' + (c === filtro.colecao ? ' selected' : '') + '>' + U.esc(S.rotulo(c)) + '</option>').join('') + '</select>' +
      '</div><div class="acts small muted" id="cnt"></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>');
    let dados = [];
    async function carregar() {
      UI.$('#tb', v).innerHTML = '<div class="empty">Carregando…</div>';
      try { dados = await Auth.listarAuditoria(filtro); }
      catch (err) { UI.$('#tb', v).innerHTML = '<div class="note bad">' + U.esc(err.message) + '</div>'; return; }
      UI.$('#cnt', v).textContent = dados.length + ' registro(s)' + (dados.length >= 500 ? ' (mostrando os 500 mais recentes)' : '');
      UI.$('#tb', v).innerHTML = dados.length ? '<table class="tbl"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>O quê</th><th>Detalhes</th></tr></thead><tbody>' +
        dados.map((a, i) => '<tr><td class="small" style="white-space:nowrap">' + U.dateTime(a.quando) + '</td><td>' + U.esc(a.nome || a.email || '—') + '<br><span class="small muted">' + U.esc(a.email || '') + '</span></td>' +
          '<td><span class="tag ' + (a.acao === 'excluiu' ? 'urg' : a.acao === 'criou' ? 'est' : '') + '">' + U.esc(ACAO[a.acao] || a.acao) + '</span></td><td>' + U.esc(a.resumo || '') + '</td>' +
          '<td class="small">' + (a.detalhe && Object.keys(a.detalhe).length ? '<button class="btn sm ghost" data-det="' + i + '">' + Object.keys(a.detalhe).slice(0, 4).map(k => U.esc(k)).join(', ') + (Object.keys(a.detalhe).length > 4 ? '…' : '') + '</button>' : '') + '</td></tr>').join('') +
        '</tbody></table>' : UI.empty('Nenhum registro no período', 'Ajuste os filtros.');
    }
    await carregar();
    ['#r-de', '#r-ate', '#r-u', '#r-c'].forEach(id => UI.$(id, v).onchange = () => {
      filtro.de = UI.$('#r-de', v).value; filtro.ate = UI.$('#r-ate', v).value; filtro.usuario = UI.$('#r-u', v).value; filtro.colecao = UI.$('#r-c', v).value;
      carregar();
    });
    UI.$('#tb', v).addEventListener('click', e => {
      const b = e.target.closest('[data-det]');
      if (!b) return;
      const a = dados[Number(b.dataset.det)];
      const fmt = x => { const t = typeof x === 'string' ? x : JSON.stringify(x); return U.esc(t && t.length > 300 ? t.slice(0, 300) + '…' : t); };
      UI.modal({
        title: (ACAO[a.acao] || a.acao) + ' — ' + (a.resumo || ''), size: 'wide',
        body: '<p class="small muted" style="margin:0">' + U.esc(a.nome || a.email) + ' em ' + U.dateTime(a.quando) + '</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>' +
          Object.keys(a.detalhe).map(k => '<tr><td><b>' + U.esc(k) + '</b></td><td class="small">' + fmt(a.detalhe[k].de) + '</td><td class="small">' + fmt(a.detalhe[k].para) + '</td></tr>').join('') + '</tbody></table></div>'
      });
    });
    UI.$('#exp').onclick = () => {
      const rows = [['Data e hora', 'Usuário', 'E-mail', 'Ação', 'O quê', 'Campos alterados']];
      dados.forEach(a => rows.push([U.dateTime(a.quando), a.nome || '', a.email || '', ACAO[a.acao] || a.acao, a.resumo || '', a.detalhe ? Object.keys(a.detalhe).join(', ') : '']));
      C.writeXlsx('registros.xlsx', { Registros: rows }).catch(err => UI.toast(err.message, 'bad'));
    };
  };
})(window);
