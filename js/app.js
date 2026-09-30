/* Inicialização, menu e rotas */
(function (root) {
  'use strict';
  const { U, S, D, UI, V } = root;

  const NAV = [
    { grp: 'Processo' },
    { r: 'painel', t: 'Painel', i: 'home' },
    { r: 'solicitacoes', t: 'Solicitações', i: 'req', cnt: () => S.all('solicitacoes').filter(s => s.status === 'aberta').length },
    { r: 'cotacoes', t: 'Cotações e mapa', i: 'quote', cnt: () => S.all('cotacoes').filter(c => c.status === 'aberta' || c.status === 'em_analise').length },
    { r: 'pedidos', t: 'Pedidos de compra', i: 'order', cnt: () => S.all('pedidos').filter(p => p.status === 'emitido' || p.status === 'enviado' || p.status === 'recebido_parcial').length },
    { r: 'estoque', t: 'Estoque', i: 'box', cnt: () => D.abaixoMinimo().length || '' },
    { grp: 'Cadastros' },
    { r: 'fornecedores', t: 'Fornecedores', i: 'truck' },
    { r: 'produtos', t: 'Produtos e marcas', i: 'tag' },
    { r: 'solicitantes', t: 'Solicitantes', i: 'user' },
    { r: 'compradores', t: 'Compradores', i: 'buyer' },
    { r: 'centros', t: 'Centros de custo', i: 'cc' },
    { grp: 'Sistema' },
    { r: 'config', t: 'Configurações', i: 'gear' }
  ];

  function renderNav(active) {
    UI.$('#nav').innerHTML = NAV.map(n => {
      if (n.grp) return '<div class="grp">' + n.grp + '</div>';
      const c = n.cnt ? n.cnt() : '';
      return '<a href="#/' + n.r + '" class="' + (n.r === active ? 'on' : '') + '">' + UI.icon(n.i) + '<span>' + n.t + '</span>' + (c ? '<span class="cnt">' + c + '</span>' : '') + '</a>';
    }).join('');
  }

  function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'painel';
    const parts = hash.split('/');
    const base = parts[0];
    UI.$('#app').classList.remove('nav-open');
    UI.$('#modals').innerHTML = '';
    renderNav(base);
    window.scrollTo(0, 0);
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
        case 'fornecedores': case 'produtos': case 'solicitantes': case 'compradores': case 'centros':
          return V.cadastro(base);
        case 'config': return V.config();
        default: return V.dashboard();
      }
    } catch (e) {
      console.error(e);
      UI.render('<div class="note bad">Ocorreu um erro ao abrir esta tela: ' + U.esc(e.message) + '</div>');
    }
  }
  root.App = { route: route, refreshNav: () => renderNav((location.hash.replace(/^#\/?/, '') || 'painel').split('/')[0]) };

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); location.hash = go.getAttribute('data-go'); }
  });
  UI.$('#menu-btn').onclick = () => UI.$('#app').classList.toggle('nav-open');
  UI.$('#app').addEventListener('click', e => {
    if (UI.$('#app').classList.contains('nav-open') && !e.target.closest('.side') && !e.target.closest('#menu-btn')) UI.$('#app').classList.remove('nav-open');
  });

  window.addEventListener('hashchange', route);
  S.onChange(() => root.App.refreshNav());

  (async function start() {
    const had = await S.init();
    if (!had) root.Seed.load();
    route();
  })();
})(window);
