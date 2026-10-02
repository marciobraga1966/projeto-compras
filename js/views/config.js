/* Configurações (administradores): dados da empresa, parâmetros, diagnóstico do banco central,
   envio de dados que ficaram só neste computador, cópia de segurança e dados de exemplo */
(function (root) {
  'use strict';
  const { U, S, UI, C, Cloud, Auth } = root;
  const V = root.V = root.V || {};

  /* Envio ao banco dos registros que estavam só neste navegador */
  V.migrarLegado = function (leg) {
    const cols = Object.keys(leg).filter(c => leg[c] && leg[c].length);
    const ex = r => /\(exemplo\)/i.test(JSON.stringify([r.nome, r.razao, r.fantasia, r.descricao])) || r.exemplo;
    const permite = c => Auth.perm.admin || ((c === 'fornecedores' || c === 'produtos') && Auth.perm.editarProdutosFornecedores);
    UI.modal({
      title: 'Dados encontrados só neste computador', size: 'wide',
      body: '<p style="margin:0">Estes registros foram criados neste navegador antes da conexão com o banco central (por exemplo, uma planilha importada do ERP) e <b>ainda não estão no Supabase</b>. Escolha o que enviar para que todos os usuários vejam.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Cadastro</th><th class="n">Registros</th><th>Exemplos</th></tr></thead><tbody>' +
        cols.map(c => {
          const n = leg[c].length, nex = leg[c].filter(ex).length;
          return '<tr><td><input type="checkbox" data-col="' + c + '"' + (permite(c) && n - nex > 0 && (c === 'fornecedores' || c === 'produtos') ? ' checked' : '') + (permite(c) ? '' : ' disabled') + ' aria-label="Enviar ' + U.esc(S.rotulo(c)) + '"></td>' +
            '<td><b>' + U.esc(S.rotulo(c)) + '</b><br><span class="small muted">' + leg[c].slice(0, 4).map(r => U.esc(r.razao || r.descricao || r.nome || r.numero || '')).join(', ') + (n > 4 ? '…' : '') + '</span></td>' +
            '<td class="n">' + n + '</td><td class="small">' + (nex ? nex + ' de exemplo (não serão enviados)' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="small muted" style="margin:0">Registros marcados "(exemplo)" ficam de fora. Você pode fazer isto depois em Configurações.</p>',
      buttons: [
        { label: 'Agora não' },
        { label: 'Descartar estes dados', cls: 'danger', action: async () => {
          if (!(await UI.confirm('Descartar definitivamente os dados que estão só neste computador?', 'Descartar'))) return false;
          await S.limparLegado();
          UI.toast('Dados locais descartados', 'ok');
        } },
        { label: 'Enviar ao banco central', cls: 'pri', icon: 'upload', action: async m => {
          const sel = UI.$$('input[data-col]:checked', m.el).map(i => i.dataset.col);
          if (!sel.length) { UI.toast('Marque o que deseja enviar', 'bad'); return false; }
          const envio = {};
          sel.forEach(c => { envio[c] = leg[c].filter(r => !ex(r)); });
          const pg = UI.progress('Enviando ao banco central');
          try {
            const n = await Cloud.enviarLegado(envio);
            await S.limparLegado(sel);
            pg.close();
            UI.toast(n + ' registro(s) gravados no banco central', 'ok');
            root.App.route();
          } catch (err) { pg.close(); UI.toast('Falha ao enviar: ' + err.message, 'bad'); return false; }
        } }
      ]
    });
  };

  V.config = function () {
    const cfg = S.config();
    const e = cfg.empresa;
    const nuvem = Cloud.ativo();
    UI.setHeader('Configurações', 'Administração', '<button class="btn pri" id="save">' + UI.icon('check') + 'Salvar</button>');
    UI.render('<div class="card"><div class="hd"><h2>Banco de dados central</h2>' + (nuvem ? '<span class="pill ok">Supabase</span>' : '<span class="pill warn">Não configurado</span>') + '</div><div class="bd stack" id="diag">' +
      (nuvem ? '<p class="small muted" style="margin:0">Todos os cadastros, solicitações, cotações e pedidos são gravados no Supabase e vistos por todos os usuários conforme as permissões.</p><div class="row"><button class="btn" id="d-run">' + UI.icon('eye') + 'Diagnosticar conexão</button><button class="btn" id="d-sync">Sincronizar agora</button><button class="btn" id="d-leg">Dados só neste computador</button></div><div id="d-out"></div>'
        : '<div class="note warn">O portal está sem banco central: os dados ficam só neste navegador e cada usuário vê um portal separado. Para centralizar, configure <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> na Vercel e publique novamente (passo a passo em docs/BANCO-NA-NUVEM.md).</div>') +
      '</div></div>' +
      '<div class="card"><div class="hd"><h2>Empresa (aparece nos documentos)</h2></div><div class="bd"><div class="form">' +
      '<div class="f s6"><label for="e-nome">Razão social</label><input id="e-nome" value="' + U.esc(e.nome) + '"></div>' +
      '<div class="f s3"><label for="e-cnpj">CNPJ</label><input id="e-cnpj" value="' + U.esc(e.cnpj) + '"></div>' +
      '<div class="f s3"><label for="e-tel">Telefone</label><input id="e-tel" value="' + U.esc(e.telefone) + '"></div>' +
      '<div class="f s6"><label for="e-end">Endereço</label><input id="e-end" value="' + U.esc(e.endereco) + '"></div>' +
      '<div class="f s3"><label for="e-cid">Cidade/UF</label><input id="e-cid" value="' + U.esc(e.cidade) + '"></div>' +
      '<div class="f s3"><label for="e-mail">E-mail de compras</label><input id="e-mail" type="email" value="' + U.esc(e.email) + '"></div>' +
      '</div></div></div>' +
      '<div class="card"><div class="hd"><h2>Parâmetros de compras</h2></div><div class="bd"><div class="form">' +
      '<div class="f s4"><label for="c-loc">Local de entrega padrão (estoque)</label><input id="c-loc" value="' + U.esc(cfg.localEntrega) + '"></div>' +
      '<div class="f s4"><label for="c-pr">Prazo para resposta da cotação (dias)</label><input id="c-pr" class="n" value="' + U.esc(cfg.prazoRespostaDias) + '"></div>' +
      '<div class="f s4"><label for="c-val">Validade padrão da proposta (dias)</label><input id="c-val" class="n" value="' + U.esc(cfg.validadePadraoDias) + '"></div>' +
      '<div class="f s12"><label class="row" style="text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--ink)"><input type="checkbox" id="c-frete"' + (cfg.considerarFreteNoMapa ? ' checked' : '') + '> Somar o frete FOB no total de cada fornecedor no mapa comparativo</label></div>' +
      '</div></div></div>' +
      '<div class="grid g2"><div class="card"><div class="hd"><h2>Cópia de segurança</h2></div><div class="bd stack">' +
      '<p class="small muted" style="margin:0">' + (nuvem ? 'Baixa uma cópia dos dados do banco central visíveis para você.' : 'Os dados ficam guardados neste navegador. Baixe uma cópia regularmente.') + '</p>' +
      '<div class="row"><button class="btn" id="bk">' + UI.icon('download') + 'Baixar cópia (.json)</button>' + (nuvem ? '' : '<button class="btn" id="rs">' + UI.icon('upload') + 'Restaurar cópia</button>') + '</div></div></div>' +
      (nuvem ? '' : '<div class="card"><div class="hd"><h2>Dados de exemplo</h2></div><div class="bd stack">' +
        '<p class="small muted" style="margin:0">' + (cfg.exemplo ? 'O portal está com dados de demonstração. Limpe para começar com dados reais (o seu usuário administrador é mantido).' : 'Carregue exemplos para treinar a equipe. Isto substitui os dados atuais.') + '</p>' +
        '<div class="row">' + (cfg.exemplo ? '<button class="btn danger" id="clr">' + UI.icon('trash') + 'Limpar exemplos e começar</button>' : '<button class="btn" id="ld">Carregar exemplos</button>') + '</div></div></div>') +
      '</div>');

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

    if (nuvem) {
      UI.$('#d-run').onclick = async () => {
        const out = UI.$('#d-out');
        out.innerHTML = '<p class="small muted">Verificando…</p>';
        const linhas = [];
        const ok = (t, d) => linhas.push('<li><span class="pill ok">ok</span> ' + t + (d ? ' — <span class="muted">' + d + '</span>' : '') + '</li>');
        const falha = (t, d) => linhas.push('<li><span class="pill bad">falha</span> ' + t + ' — ' + U.esc(d) + '</li>');
        ok('Variáveis da Vercel', U.esc(Cloud.url()));
        ok('Usuário conectado', U.esc(Auth.user.email + ' (' + root.R.CATEGORIAS[Auth.user.categoria] + ')'));
        try {
          const cont = await Cloud.contagens();
          ok('Tabela registros', Object.keys(cont).filter(k => cont[k]).map(k => S.rotulo(k) + ': ' + cont[k]).join(' · ') || 'vazia');
        } catch (err) { falha('Tabela registros', err.message); }
        try { await Cloud.carregarAlcadas(); ok('Tabela alcadas', S.db.alcadas.length + ' nível(is)'); } catch (err) { falha('Tabela alcadas', err.message); }
        try { const p = await Auth.listarUsuarios(); ok('Tabela perfis', p.length + ' usuário(s)'); } catch (err) { falha('Tabela perfis', err.message); }
        ok('Alterações pendentes de gravação', String(Cloud.pendencias()));
        out.innerHTML = '<ul class="diag">' + linhas.join('') + '</ul>';
      };
      UI.$('#d-sync').onclick = async () => {
        try { await Cloud.gravarAgora(); await Cloud.sincronizarAgora(); UI.toast('Sincronizado com o banco central', 'ok'); }
        catch (err) { UI.toast(err.message, 'bad'); }
      };
      UI.$('#d-leg').onclick = async () => {
        const leg = await S.legado();
        if (!leg || !Object.keys(leg).some(c => leg[c].length)) { UI.toast('Não há dados pendentes neste computador', 'ok'); return; }
        V.migrarLegado(leg);
      };
      return;
    }

    UI.$('#rs').onclick = async () => {
      const f = await UI.pickFile('.json,application/json');
      if (!f.length) return;
      try {
        const data = JSON.parse(await C.readAsText(f[0]));
        if (!data || !Array.isArray(data.solicitacoes)) throw new Error('Arquivo não é uma cópia do sistema de compras');
        if (!(await UI.confirm('Restaurar a cópia substitui todos os dados atuais. Continuar?', 'Restaurar'))) return;
        const usuarios = S.db.usuarios;
        S.replaceAll(data);
        if (!S.db.usuarios.length) S.db.usuarios = usuarios;
        S.save();
        UI.toast('Cópia restaurada', 'ok');
        location.hash = '#/painel';
      } catch (err) { UI.toast(err.message, 'bad'); }
    };
    if (UI.$('#clr')) UI.$('#clr').onclick = async () => {
      if (!(await UI.confirm('Apagar todos os dados de exemplo? Solicitações, cotações, pedidos, cadastros e usuários de exemplo serão removidos; o seu usuário é mantido.', 'Apagar'))) return;
      const emp = JSON.parse(JSON.stringify(cfg.empresa));
      const eu = S.db.usuarios.find(u => u.id === Auth.user.id);
      const alc = S.db.alcadas;
      S.reset();
      S.config().empresa = emp;
      S.config().exemplo = false;
      S.db.usuarios = eu ? [Object.assign(eu, { demo_senha: undefined, nome: eu.nome.replace(' (exemplo)', '') })] : [];
      S.db.alcadas = alc;
      S.db.auditoria = [];
      S.log('Portal iniciado sem dados de exemplo');
      S.save();
      UI.toast('Pronto para usar', 'ok');
      location.hash = '#/painel';
      root.App.route();
    };
    if (UI.$('#ld')) UI.$('#ld').onclick = async () => {
      if (!(await UI.confirm('Carregar exemplos substitui todos os dados atuais. Continuar?', 'Carregar'))) return;
      root.Seed.load();
      location.reload();
    };
  };
})(window);
