/* Configurações: dados da empresa, parâmetros, cópia de segurança e dados de exemplo */
(function (root) {
  'use strict';
  const { U, S, UI, C } = root;
  const V = root.V = root.V || {};

  V.config = function () {
    const cfg = S.config();
    const e = cfg.empresa;
    UI.setHeader('Configurações', 'Sistema', '<button class="btn pri" id="save">' + UI.icon('check') + 'Salvar</button>');
    const kb = Math.round(S.exportJson().length / 1024);
    UI.render('<div class="card"><div class="hd"><h2>Empresa (aparece nos documentos)</h2></div><div class="bd"><div class="form">' +
      '<div class="f s6"><label for="e-nome">Razão social</label><input id="e-nome" value="' + U.esc(e.nome) + '"></div>' +
      '<div class="f s3"><label for="e-cnpj">CNPJ</label><input id="e-cnpj" value="' + U.esc(e.cnpj) + '"></div>' +
      '<div class="f s3"><label for="e-tel">Telefone</label><input id="e-tel" value="' + U.esc(e.telefone) + '"></div>' +
      '<div class="f s6"><label for="e-end">Endereço</label><input id="e-end" value="' + U.esc(e.endereco) + '"></div>' +
      '<div class="f s3"><label for="e-cid">Cidade/UF</label><input id="e-cid" value="' + U.esc(e.cidade) + '"></div>' +
      '<div class="f s3"><label for="e-mail">E-mail de compras</label><input id="e-mail" type="email" value="' + U.esc(e.email) + '"></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="hd"><h2>Parâmetros de compras</h2></div><div class="bd"><div class="form">' +
      '<div class="f s4"><label for="c-loc">Local de entrega padrão</label><input id="c-loc" value="' + U.esc(cfg.localEntrega) + '"></div>' +
      '<div class="f s4"><label for="c-pr">Prazo para resposta da cotação (dias)</label><input id="c-pr" class="n" value="' + U.esc(cfg.prazoRespostaDias) + '"></div>' +
      '<div class="f s4"><label for="c-val">Validade padrão da proposta (dias)</label><input id="c-val" class="n" value="' + U.esc(cfg.validadePadraoDias) + '"></div>' +
      '<div class="f s12"><label class="row" style="text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--ink)"><input type="checkbox" id="c-frete"' + (cfg.considerarFreteNoMapa ? ' checked' : '') + '> Somar o frete FOB no total de cada fornecedor no mapa comparativo</label></div>' +
      '</div></div></div>' +
      '<div class="grid g2"><div class="card"><div class="hd"><h2>Cópia de segurança</h2></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">Os dados ficam guardados neste navegador (' + kb + ' KB). Baixe uma cópia regularmente e restaure em outro computador quando precisar.</p>' +
      '<div class="row"><button class="btn" id="bk">' + UI.icon('download') + 'Baixar cópia (.json)</button><button class="btn" id="rs">' + UI.icon('upload') + 'Restaurar cópia</button></div></div></div>' +
      '<div class="card"><div class="hd"><h2>Dados de exemplo</h2></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">' + (cfg.exemplo ? 'O sistema está com dados de exemplo. Limpe para começar a usar com seus dados reais.' : 'Carregue exemplos para treinar a equipe. Isto substitui todos os dados atuais.') + '</p>' +
      '<div class="row">' + (cfg.exemplo ? '<button class="btn danger" id="clr">' + UI.icon('trash') + 'Limpar exemplos e começar</button>' : '<button class="btn" id="ld">Carregar exemplos</button><button class="btn danger" id="zero">' + UI.icon('trash') + 'Apagar todos os dados</button>') + '</div></div></div></div>');

    UI.$('#save').onclick = () => {
      Object.assign(e, { nome: UI.$('#e-nome').value.trim(), cnpj: UI.$('#e-cnpj').value.trim(), telefone: UI.$('#e-tel').value.trim(), endereco: UI.$('#e-end').value.trim(), cidade: UI.$('#e-cid').value.trim(), email: UI.$('#e-mail').value.trim() });
      cfg.localEntrega = UI.$('#c-loc').value.trim();
      cfg.prazoRespostaDias = U.parseNum(UI.$('#c-pr').value) || 3;
      cfg.validadePadraoDias = U.parseNum(UI.$('#c-val').value) || 15;
      cfg.considerarFreteNoMapa = UI.$('#c-frete').checked;
      S.save();
      UI.toast('Configurações salvas', 'ok');
    };
    UI.$('#bk').onclick = () => C.download('brasmic-compras-' + U.today() + '.json', S.exportJson(), 'application/json');
    UI.$('#rs').onclick = async () => {
      const f = await UI.pickFile('.json,application/json');
      if (!f.length) return;
      try {
        const data = JSON.parse(await C.readAsText(f[0]));
        if (!data || !Array.isArray(data.solicitacoes)) throw new Error('Arquivo não é uma cópia do sistema de compras');
        if (!(await UI.confirm('Restaurar a cópia substitui todos os dados atuais. Continuar?', 'Restaurar'))) return;
        S.replaceAll(data);
        UI.toast('Cópia restaurada', 'ok');
        location.hash = '#/painel';
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
    const clearAll = async (msg) => {
      if (!(await UI.confirm(msg, 'Apagar'))) return;
      const emp = JSON.parse(JSON.stringify(cfg.empresa));
      S.reset();
      S.config().empresa = emp;
      S.config().exemplo = false;
      S.log('Sistema iniciado');
      S.save();
      UI.toast('Pronto para usar', 'ok');
      location.hash = '#/painel';
      root.App.route();
    };
    if (UI.$('#clr')) UI.$('#clr').onclick = () => clearAll('Apagar todos os dados de exemplo? Solicitações, cotações, pedidos e cadastros de exemplo serão removidos.');
    if (UI.$('#zero')) UI.$('#zero').onclick = () => clearAll('Apagar TODOS os dados do sistema? Faça uma cópia de segurança antes. Esta ação não pode ser desfeita.');
    if (UI.$('#ld')) UI.$('#ld').onclick = async () => {
      if (!(await UI.confirm('Carregar exemplos substitui todos os dados atuais. Continuar?', 'Carregar'))) return;
      root.Seed.load();
      location.hash = '#/painel';
      root.App.route();
    };
  };
})(window);
