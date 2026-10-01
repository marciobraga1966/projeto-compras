/* Recebimentos: o solicitante confirma (aceite) ou recusa os materiais entregues —
   retirados do estoque ou comprados para aplicação direta */
(function (root) {
  'use strict';
  const { U, S, D, UI, Auth } = root;
  const V = root.V = root.V || {};
  let filtro = 'pendentes';

  V.entregasVisiveis = function () {
    const perm = Auth.perm, eu = Auth.user;
    return S.all('entregas').filter(e => perm.comprador || e.solicitanteUserId === eu.id ||
      (eu.solicitante_id && e.solicitanteId === eu.solicitante_id) || (eu.centros || []).indexOf(e.centroCustoId) > -1);
  };
  V.minhasEntregasPendentes = () => S.all('entregas').filter(e => D.podeAceitarEntrega(e));

  V.recebimentos = function () {
    UI.setHeader('Recebimento de materiais', 'Processo');
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar"><select id="f-ent" style="width:auto">' +
      '<option value="pendentes">Aguardando aceite</option><option value="minhas">Aguardando o MEU aceite</option><option value="recusadas">Recusadas</option><option value="">Todas</option></select></div>' +
      '<div class="acts small muted">O solicitante confirma aqui o recebimento do material; o aceite fica registrado.</div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>');
    UI.$('#f-ent', v).value = filtro;
    const verValor = Auth.perm.comprador;
    function draw() {
      const lista = V.entregasVisiveis().filter(e => filtro === 'pendentes' ? e.status === 'aguardando_aceite'
        : filtro === 'minhas' ? e.status === 'aguardando_aceite' && (e.solicitanteUserId === Auth.user.id || (!!Auth.user.solicitante_id && e.solicitanteId === Auth.user.solicitante_id))
        : filtro === 'recusadas' ? e.status === 'recusada' : true).sort((a, b) => (b.numero > a.numero ? 1 : -1));
      UI.$('#tb', v).innerHTML = lista.length ? '<table class="tbl"><thead><tr><th>Entrega</th><th>Data</th><th>Origem</th><th>Solicitação</th><th>Materiais</th><th>Custo apropriado em</th>' + (verValor ? '<th class="n">Valor</th>' : '') + '<th>Situação</th><th></th></tr></thead><tbody>' +
        lista.map(e => '<tr><td class="strong">' + e.numero + '</td><td>' + U.date(e.data) + '</td><td>' + (e.origem === 'estoque' ? '<span class="tag est">Estoque</span>' : '<span class="tag apl">Compra ' + U.esc(e.pedidoNumero || '') + '</span>') + '</td>' +
          '<td><a href="#/solicitacoes/' + e.solicitacaoId + '">' + U.esc(e.solicitacaoNumero || '') + '</a><br><span class="small muted">' + U.esc(D.pessoa('solicitantes', e.solicitanteId)) + '</span></td>' +
          '<td class="small">' + e.itens.map(i => U.num(i.qtd) + ' ' + U.esc(i.unidade) + ' ' + U.esc(i.descricao)).join('<br>') + '</td>' +
          '<td class="small">' + U.esc(D.apropriacao(e)) + '</td>' + (verValor ? '<td class="n">' + U.money(e.total) + '</td>' : '') +
          '<td>' + UI.pill(D.STATUS_ENT, e.status) + (e.aceite ? '<br><span class="small muted">' + U.esc(e.aceite.porNome) + ' · ' + U.dateTime(e.aceite.em) + '</span>' : '') + '</td>' +
          '<td class="act">' + (D.podeAceitarEntrega(e) ? '<button class="btn sm pri" data-ok="' + e.id + '">' + UI.icon('check') + 'Confirmar recebimento</button> <button class="btn sm danger" data-no="' + e.id + '">Recusar</button>' : '') + '</td></tr>').join('') +
        '</tbody></table>' : UI.empty('Nenhuma entrega', filtro === 'pendentes' || filtro === 'minhas' ? 'Não há recebimentos aguardando confirmação.' : '');
    }
    draw();
    UI.$('#f-ent', v).onchange = e => { filtro = e.target.value; draw(); };
    UI.$('#tb', v).addEventListener('click', e => {
      const b = e.target.closest('[data-ok],[data-no]');
      if (!b) return;
      const aceito = !!b.dataset.ok;
      const ent = S.find('entregas', b.dataset.ok || b.dataset.no);
      UI.modal({
        title: (aceito ? 'Confirmar recebimento' : 'Recusar recebimento') + ' — ' + ent.numero, size: 'narrow',
        body: '<p style="margin:0">' + ent.itens.map(i => U.num(i.qtd) + ' ' + U.esc(i.unidade) + ' — ' + U.esc(i.descricao)).join('<br>') + '</p>' +
          '<div class="f"><label for="ac-obs">' + (aceito ? 'Observação (opcional)' : 'Motivo da recusa *') + '</label><textarea id="ac-obs" rows="2"></textarea></div>' +
          '<p class="small muted" style="margin:0">Ficam registrados o seu nome, a data e a hora.</p>',
        buttons: [{ label: 'Voltar' }, { label: aceito ? 'Confirmo que recebi' : 'Recusar', cls: aceito ? 'pri' : 'danger', action: async m => {
          const obs = UI.$('#ac-obs', m.el).value.trim();
          if (!aceito && !obs) { UI.toast('Informe o motivo da recusa', 'bad'); return false; }
          try {
            D.aceitarEntrega(ent, aceito, obs);
            if (root.Cloud.ativo()) await root.Cloud.gravarAgora();
            UI.toast(aceito ? 'Recebimento confirmado' : 'Recebimento recusado — o comprador será avisado no painel', 'ok');
            draw();
          } catch (err) { UI.toast(err.message, 'bad'); return false; }
        } }]
      });
    });
  };
})(window);
