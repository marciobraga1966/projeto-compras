/* Inicialização, login, menu (conforme permissões) e rotas */
(function (root) {
  'use strict';
  const { U, S, D, UI, V, Auth, Cloud, R } = root;

  const P = () => Auth.perm;
  const NAV = [
    { grp: 'Processo' },
    { r: 'painel', t: 'Painel', i: 'home' },
    { r: 'solicitacoes', t: 'Solicitações', i: 'req', cnt: () => S.all('solicitacoes').filter(s => s.status === 'aberta' && R.podeVerSolicitacao(P(), Auth.user, s)).length },
    { r: 'cotacoes', t: 'Cotações e mapa', i: 'quote', ok: () => P().processoCompras, cnt: () => S.all('cotacoes').filter(c => c.status === 'aberta' || c.status === 'em_analise').length },
    { r: 'pedidos', t: 'Pedidos de compra', i: 'order', ok: () => P().processoCompras, cnt: () => S.all('pedidos').filter(p => p.status === 'aguardando_aprovacao' && D.podeAprovar(p)).length || '' },
    { r: 'recebimentos', t: 'Recebimentos', i: 'check', cnt: () => V.minhasEntregasPendentes().length || '' },
    { r: 'estoque', t: 'Estoque', i: 'box', ok: () => P().processoCompras, cnt: () => D.abaixoMinimo().length || '' },
    { grp: 'Relatórios', ok: () => P().verTotalizadores },
    { r: 'custos', t: 'Custos por equipamento', i: 'chart', ok: () => P().verTotalizadores },
    { grp: 'Cadastros' },
    { r: 'fornecedores', t: 'Fornecedores', i: 'truck', ok: () => P().processoCompras },
    { r: 'produtos', t: 'Produtos e marcas', i: 'tag' },
    { r: 'equipamentos', t: 'Equipamentos', i: 'gear', ok: () => P().processoCompras },
    { r: 'categoriasDespesa', t: 'Categorias de despesa', i: 'cc', ok: () => P().processoCompras },
    { r: 'solicitantes', t: 'Solicitantes', i: 'user', ok: () => P().processoCompras },
    { r: 'compradores', t: 'Compradores e alçadas', i: 'buyer', ok: () => P().processoCompras },
    { r: 'centros', t: 'Centros de custo', i: 'cc', ok: () => P().processoCompras },
    { grp: 'Administração', ok: () => P().gerenciarUsuarios || P().verRegistros },
    { r: 'usuarios', t: 'Usuários e acessos', i: 'user', ok: () => P().gerenciarUsuarios },
    { r: 'alcadas', t: 'Alçadas de aprovação', i: 'star', ok: () => P().gerenciarUsuarios },
    { r: 'registros', t: 'Registros', i: 'eye', ok: () => P().verRegistros },
    { r: 'config', t: 'Configurações', i: 'gear', ok: () => P().admin }
  ];

  function permitido(rota) {
    const n = NAV.find(x => x.r === rota);
    return !n || !n.ok || n.ok();
  }

  function renderNav(active) {
    UI.$('#nav').innerHTML = NAV.filter(n => !n.ok || n.ok()).map(n => {
      if (n.grp) return '<div class="grp">' + n.grp + '</div>';
      const c = n.cnt ? n.cnt() : '';
      return '<a href="#/' + n.r + '" class="' + (n.r === active ? 'on' : '') + '">' + UI.icon(n.i) + '<span>' + n.t + '</span>' + (c ? '<span class="cnt">' + c + '</span>' : '') + '</a>';
    }).join('');
    const u = Auth.user;
    UI.$('#user-box').innerHTML = u ? '<div class="who"><b>' + U.esc(u.nome) + '</b><span>' + U.esc(R.CATEGORIAS[u.categoria]) + '</span></div><button class="btn sm" id="sair">Sair</button>' : '';
    if (u) UI.$('#sair').onclick = async () => { if (await UI.confirm('Sair do portal?', 'Sair', false)) Auth.sair(); };
  }

  function route() {
    if (!Auth.user) return;
    const hash = location.hash.replace(/^#\/?/, '') || 'painel';
    const parts = hash.split('/');
    const base = parts[0];
    UI.$('#app').classList.remove('nav-open');
    UI.$('#modals').innerHTML = '';
    renderNav(base);
    window.scrollTo(0, 0);
    if (!permitido(base)) {
      UI.setHeader('Acesso restrito', '');
      UI.render('<div class="card">' + UI.empty('Você não tem acesso a esta área', 'Fale com o administrador do portal se precisar deste acesso.', '<button class="btn" data-go="#/painel">Ir para o painel</button>') + '</div>');
      return;
    }
    try {
      switch (base) {
        case 'painel': return V.dashboard();
        case 'solicitacoes':
          if (parts[1] === 'nova') return V.solForm(null, parts[2]);
          if (parts[1] && parts[2] === 'editar') return V.solForm(parts[1]);
          if (parts[1]) return V.solView(parts[1]);
          return V.solList();
        case 'cotacoes':
          if (parts[1]) return V.cotView(parts[1], parts[2]);
          return V.cotList();
        case 'pedidos':
          if (parts[1]) return V.pedView(parts[1]);
          return V.pedList();
        case 'estoque': return V.estoque();
        case 'recebimentos': return V.recebimentos();
        case 'custos': return V.custos();
        case 'fornecedores': case 'produtos': case 'solicitantes': case 'compradores': case 'centros': case 'equipamentos': case 'categoriasDespesa':
          return V.cadastro(base);
        case 'usuarios': return V.usuarios();
        case 'alcadas': return V.alcadas();
        case 'registros': return V.registros();
        case 'config': return V.config();
        default: return V.dashboard();
      }
    } catch (e) {
      console.error(e);
      UI.render('<div class="note bad">Ocorreu um erro ao abrir esta tela: ' + U.esc(e.message) + '</div>');
    }
  }
  root.App = {
    route: route,
    refreshNav: () => { if (Auth.user) renderNav((location.hash.replace(/^#\/?/, '') || 'painel').split('/')[0]); },
    aposLogin: function () {
      UI.$('#app').hidden = false;
      const base = (location.hash.replace(/^#\/?/, '') || 'painel').split('/')[0];
      if (!permitido(base)) { history.replaceState(null, '', '#/painel'); }
      route();
      if (Cloud.ativo()) verificarLegado();
    }
  };

  /* Dados que ficaram só neste navegador antes do banco central (ex.: planilha importada) */
  async function verificarLegado() {
    if (!(P().admin || P().editarProdutosFornecedores)) return;
    const leg = await S.legado();
    if (!leg) return;
    const cols = Object.keys(leg).filter(c => leg[c] && leg[c].length);
    if (!cols.length) return;
    V.migrarLegado(leg);
  }

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); location.hash = go.getAttribute('data-go'); }
  });
  UI.$('#menu-btn').onclick = () => UI.$('#app').classList.toggle('nav-open');
  UI.$('#app').addEventListener('click', e => {
    if (UI.$('#app').classList.contains('nav-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn')) UI.$('#app').classList.remove('nav-open');
  });
  window.addEventListener('hashchange', route);

  const CLOUD_TXT = {
    desligado: 'Banco central desconectado',
    sincronizando: 'Gravando / atualizando…',
    ok: 'Banco central: em dia',
    erro: 'Banco central: sem conexão',
    login: 'Banco central: entre novamente'
  };
  Cloud.onStatus(st => {
    const el = UI.$('#cloud-status');
    if (!el) return;
    el.dataset.estado = st.estado;
    const hora = st.estado === 'ok' ? ' às ' + st.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    el.querySelector('span').textContent = CLOUD_TXT[st.estado] + hora;
    el.title = st.msg || '';
  });
  S.onChange(() => root.App.refreshNav());

  (async function start() {
    const had = await S.init();
    if (!Cloud.ativo()) {
      UI.$('#cloud-status').querySelector('span').textContent = S.config().exemplo ? 'Prévia: dados de demonstração' : 'Dados neste computador';
      if (!had) root.Seed.load();
    }
    UI.$('#app').hidden = true;
    let ok = false;
    try { ok = await Auth.iniciar(); } catch (e) { ok = false; }
    if (ok) root.App.aposLogin();
    else Auth.telaLogin(Cloud.ativo() ? '' : '');
  })();
})(window);
