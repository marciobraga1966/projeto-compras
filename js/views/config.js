/* Configurações: dados da empresa, parâmetros, cópia de segurança e dados de exemplo */
(function (root) {
  'use strict';
  const { U, S, UI, C } = root;
  const V = root.V = root.V || {};

  function cloudCard() {
    const C2 = root.Cloud;
    const info = C2.info();
    const st = C2.status();
    const env = root.BRASMIC_ENV || {};
    if (C2.configured()) {
      return '<div class="card"><div class="hd"><h2>Banco de dados na nuvem</h2>' + (st.estado === 'ok' ? '<span class="pill ok">Conectado</span>' : st.estado === 'erro' ? '<span class="pill bad">Sem conexão</span>' : '<span class="pill warn">' + U.esc(st.estado) + '</span>') + '</div><div class="bd stack">' +
        '<dl class="kv"><dt>Servidor</dt><dd>' + U.esc(info.url) + '</dd><dt>Usuário</dt><dd>' + U.esc(info.email) + '</dd>' + (st.msg ? '<dt>Situação</dt><dd>' + U.esc(st.msg) + '</dd>' : '') + '</dl>' +
        '<p class="small muted" style="margin:0">Tudo o que é salvo aqui vai para o banco da empresa e aparece para os outros usuários em até 15 segundos. Sem internet, o sistema continua funcionando e envia depois.</p>' +
        '<div class="row"><button class="btn" id="cl-sync">Sincronizar agora</button><button class="btn danger" id="cl-off">Desconectar este computador</button></div></div></div>';
    }
    return '<div class="card"><div class="hd"><h2>Banco de dados na nuvem</h2><span class="pill neutral">Não conectado</span></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">Conecte ao banco da empresa (Supabase) para que requisitantes e compradores trabalhem na mesma base, em qualquer computador ou celular. O passo a passo está no arquivo <b>docs/BANCO-NA-NUVEM.md</b> do projeto.</p>' +
      '<div class="form">' +
      (env.supabaseUrl && env.supabaseAnonKey
        ? '<div class="f s12"><label>Servidor da empresa</label><div class="small" style="padding-top:6px">' + U.esc(env.supabaseUrl) + '</div><input type="hidden" id="cl-url" value="' + U.esc(env.supabaseUrl) + '"><input type="hidden" id="cl-key" value="' + U.esc(env.supabaseAnonKey) + '"></div>'
        : '<div class="f s6"><label for="cl-url">Project URL</label><input id="cl-url" placeholder="https://xxxxxxxx.supabase.co" value="' + U.esc(info ? info.url : '') + '"></div>' +
          '<div class="f s6"><label for="cl-key">Chave pública (anon / publishable key)</label><input id="cl-key" value="' + U.esc(info ? info.anonKey : '') + '"></div>') +
      '<div class="f s6"><label for="cl-email">Seu e-mail de usuário</label><input id="cl-email" type="email" autocomplete="username" value="' + U.esc(info ? info.email : '') + '"></div>' +
      '<div class="f s6"><label for="cl-pass">Senha</label><input id="cl-pass" type="password" autocomplete="current-password"></div>' +
      '</div><div class="row"><button class="btn pri" id="cl-on">Conectar</button></div></div></div>';
  }

  function bindCloud() {
    const C2 = root.Cloud;
    const on = UI.$('#cl-on');
    if (on) on.onclick = async () => {
      const url = UI.$('#cl-url').value.trim(), key = UI.$('#cl-key').value.trim(), email = UI.$('#cl-email').value.trim(), pass = UI.$('#cl-pass').value;
      if (!/^(https:\/\/.+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)/.test(url) || !key || !email || !pass) { UI.toast('Preencha o endereço (https://…), a chave, o e-mail e a senha', 'bad'); return; }
      on.disabled = true; on.textContent = 'Conectando…';
      let t;
      try { t = await C2.testar(url, key, email, pass); }
      catch (err) { on.disabled = false; on.textContent = 'Conectar'; UI.toast(err.message === 'Failed to fetch' ? 'Não foi possível acessar o endereço informado. Confira o Project URL.' : err.message, 'bad'); return; }
      const finish = async modo => {
        const pg = UI.progress(modo === 'baixar' ? 'Baixando dados da nuvem' : 'Enviando dados para a nuvem');
        try { await C2.conectar(t.sessao, modo); pg.close(); UI.toast('Conectado ao banco na nuvem', 'ok'); location.hash = '#/painel'; root.App.route(); }
        catch (err) { pg.close(); UI.toast(err.message, 'bad'); V.config(); }
      };
      if (t.temDados) {
        UI.modal({
          title: 'O banco já tem dados', size: 'narrow',
          body: '<p style="margin:0">O banco da empresa já possui solicitações e cadastros. Este computador passará a usar os dados da nuvem; o que estiver só aqui será substituído.</p><p class="small muted" style="margin:0">Se precisar, baixe antes uma cópia de segurança logo abaixo.</p>',
          buttons: [{ label: 'Cancelar', action: () => V.config() }, { label: 'Usar os dados da nuvem', cls: 'pri', action: () => { finish('baixar'); } }],
          onClose: () => { on.disabled = false; on.textContent = 'Conectar'; }
        });
      } else {
        const exemplo = S.config().exemplo;
        UI.modal({
          title: 'Banco vazio', size: 'narrow',
          body: '<p style="margin:0">O banco da empresa está vazio. ' + (exemplo ? 'Este computador tem apenas <b>dados de exemplo</b>. Recomendado: começar com o banco limpo.' : 'Deseja enviar os dados deste computador para a nuvem?') + '</p>',
          buttons: exemplo
            ? [{ label: 'Enviar os exemplos', action: () => { finish('enviar'); } }, { label: 'Começar limpo', cls: 'pri', action: () => {
                const emp = JSON.parse(JSON.stringify(S.config().empresa));
                S.replaceAllLocal(); S.config().empresa = emp; S.config().exemplo = false; S.log('Sistema conectado à nuvem');
                finish('enviar');
              } }]
            : [{ label: 'Cancelar', action: () => V.config() }, { label: 'Enviar para a nuvem', cls: 'pri', action: () => { finish('enviar'); } }],
          onClose: () => { on.disabled = false; on.textContent = 'Conectar'; }
        });
      }
    };
    const sy = UI.$('#cl-sync');
    if (sy) sy.onclick = async () => { await C2.syncNow(); UI.toast(C2.status().estado === 'ok' ? 'Sincronizado' : C2.status().msg, C2.status().estado === 'ok' ? 'ok' : 'bad'); V.config(); };
    const off = UI.$('#cl-off');
    if (off) off.onclick = async () => {
      if (!(await UI.confirm('Desconectar este computador do banco na nuvem? Os dados continuam na nuvem e uma cópia fica neste computador, mas deixa de sincronizar.', 'Desconectar'))) return;
      C2.desconectar();
      V.config();
    };
  }

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
      cloudCard() +
      '<div class="grid g2"><div class="card"><div class="hd"><h2>Cópia de segurança</h2></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">Os dados ficam guardados neste navegador (' + kb + ' KB). Baixe uma cópia regularmente e restaure em outro computador quando precisar.</p>' +
      '<div class="row"><button class="btn" id="bk">' + UI.icon('download') + 'Baixar cópia (.json)</button><button class="btn" id="rs">' + UI.icon('upload') + 'Restaurar cópia</button></div></div></div>' +
      '<div class="card"><div class="hd"><h2>Dados de exemplo</h2></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">' + (cfg.exemplo ? 'O sistema está com dados de exemplo. Limpe para começar a usar com seus dados reais.' : 'Carregue exemplos para treinar a equipe. Isto substitui todos os dados atuais.') + '</p>' +
      '<div class="row">' + (cfg.exemplo ? '<button class="btn danger" id="clr">' + UI.icon('trash') + 'Limpar exemplos e começar</button>' : '<button class="btn" id="ld">Carregar exemplos</button><button class="btn danger" id="zero">' + UI.icon('trash') + 'Apagar todos os dados</button>') + '</div></div></div></div>');

    bindCloud();

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
      if (root.Cloud.configured()) msg += ' ATENÇÃO: o sistema está ligado ao banco na nuvem — os dados serão apagados para TODOS os usuários.';
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
