/* Acesso ao portal: login com senha, perfil/permissões do usuário, cadastro de usuários,
   alçadas e consulta da auditoria.
   - Com Supabase: Supabase Auth + tabelas perfis, alcadas e auditoria (regras aplicadas também no banco).
   - Sem Supabase (prévia/demonstração): usuários e auditoria ficam neste navegador. */
(function (root) {
  'use strict';
  const { U, S, R, Cloud } = root;
  const K_LOCAL = 'brasmic-sessao-local';

  const Auth = { user: null, perm: R.permissoes(null), modo: Cloud.ativo() ? 'nuvem' : 'local' };

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return memSessao; } }
  function lsSet(k, v) { memSessao = v; try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem localStorage */ } }
  let memSessao = null;

  async function sha256(txt) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381;
      for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
      return 'x' + (h >>> 0).toString(16);
    }
  }
  Auth.hashSenha = async function (senha, salt) { return sha256(salt + ':' + senha); };

  Auth.atualizarPerm = function () {
    const comp = Auth.user && Auth.user.comprador_id ? S.find('compradores', Auth.user.comprador_id) : null;
    Auth.perm = R.permissoes(Auth.user, comp);
  };

  function semSenha(u) { const c = Object.assign({}, u); delete c.senha_hash; delete c.salt; return c; }

  /* ---------- Sessão ---------- */
  Auth.iniciar = async function () {
    if (Auth.modo === 'nuvem') {
      const u = await Cloud.restaurarSessao();
      if (!u) return false;
      try { return await carregarPerfilNuvem(); } catch (e) { root.UI.toast(e.message, 'bad'); return false; }
    }
    const s = lsGet(K_LOCAL);
    const u = s && S.db.usuarios.find(x => x.id === s.id && x.ativo !== false);
    if (!u) return false;
    Auth.user = semSenha(u);
    Auth.atualizarPerm();
    return true;
  };

  async function carregarPerfilNuvem() {
    const p = await Cloud.meuPerfil();
    if (!p || !p.ativo) {
      await Cloud.logout();
      throw new Error(p ? 'Seu acesso está desativado. Fale com o administrador.' : 'Seu usuário ainda não foi liberado pelo administrador do portal.');
    }
    Auth.user = p;
    await Cloud.carregarTudo();
    Auth.atualizarPerm();
    return true;
  }

  Auth.entrar = async function (email, senha) {
    email = String(email || '').trim().toLowerCase();
    if (!email || !senha) throw new Error('Informe e-mail e senha.');
    if (Auth.modo === 'nuvem') {
      await Cloud.login(email, senha);
      await carregarPerfilNuvem();
      Cloud.registrarAcesso('entrada no portal');
      return Auth.user;
    }
    const u = S.db.usuarios.find(x => x.email.toLowerCase() === email);
    if (!u || (await Auth.hashSenha(senha, u.salt)) !== u.senha_hash) throw new Error('E-mail ou senha incorretos.');
    if (u.ativo === false) throw new Error('Seu acesso está desativado. Fale com o administrador.');
    Auth.user = semSenha(u);
    Auth.atualizarPerm();
    lsSet(K_LOCAL, { id: u.id });
    S.auditarEvento('acesso', 'usuarios', u.id, 'Entrada no portal');
    return Auth.user;
  };

  Auth.sair = async function () {
    if (Auth.modo === 'nuvem') { await Cloud.registrarAcesso('saída do portal'); await Cloud.logout(); }
    else { S.auditarEvento('acesso', 'usuarios', Auth.user && Auth.user.id, 'Saída do portal'); lsSet(K_LOCAL, null); }
    Auth.user = null;
    Auth.perm = R.permissoes(null);
    location.hash = '#/painel';
    location.reload();
  };

  Auth.sessaoExpirada = function () {
    if (Auth.user) Auth.telaLogin('Sua sessão expirou. Entre novamente para continuar.');
  };

  /* ---------- Usuários (somente administradores) ---------- */
  function exigirAdmin() { if (!Auth.perm.gerenciarUsuarios) throw new Error('Somente administradores podem alterar usuários.'); }

  Auth.listarUsuarios = async function () {
    if (Auth.modo === 'nuvem') return Cloud.listarPerfis();
    return S.db.usuarios.map(semSenha).sort((a, b) => a.nome.localeCompare(b.nome));
  };

  Auth.salvarUsuario = async function (p, senha) {
    exigirAdmin();
    p.email = String(p.email || '').trim().toLowerCase();
    if (!p.nome || !/^\S+@\S+\.\S+$/.test(p.email)) throw new Error('Informe nome e um e-mail válido.');
    if (!p.id && (!senha || senha.length < 6)) throw new Error('Defina uma senha com pelo menos 6 caracteres.');
    if (senha && senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    if (p.categoria === 'basico' && !(p.centros || []).length) throw new Error('Usuário básico precisa de pelo menos um centro de custo.');
    if (Auth.modo === 'nuvem') {
      const id = await Cloud.salvarPerfil(p, senha);
      if (id === Auth.user.id) { Auth.user = await Cloud.meuPerfil(); Auth.atualizarPerm(); }
      return id;
    }
    const lista = S.db.usuarios;
    if (lista.some(x => x.email === p.email && x.id !== p.id)) throw new Error('Já existe um usuário com este e-mail.');
    let u = p.id ? lista.find(x => x.id === p.id) : null;
    const antes = u ? semSenha(u) : null;
    if (!u) { u = { id: U.uid(), salt: U.uid(), criado_em: U.nowIso() }; lista.push(u); }
    Object.assign(u, semSenha(p), { id: u.id });
    if (senha) { u.salt = U.uid(); u.senha_hash = await Auth.hashSenha(senha, u.salt); }
    const detalhe = {};
    if (antes) Object.keys(semSenha(u)).forEach(k => { if (JSON.stringify(antes[k]) !== JSON.stringify(u[k])) detalhe[k] = { de: antes[k], para: u[k] }; });
    if (senha && antes) detalhe.senha = { de: '•••', para: 'redefinida' };
    S.auditarEvento(antes ? 'alterou' : 'criou', 'usuarios', u.id, 'Usuário ' + u.email, antes ? detalhe : { categoria: { de: null, para: u.categoria } });
    if (u.id === Auth.user.id) { Auth.user = semSenha(u); Auth.atualizarPerm(); }
    S.save();
    return u.id;
  };

  /* ---------- Alçadas ---------- */
  Auth.salvarAlcadas = async function (lista) {
    exigirAdmin();
    lista = R.ordenarAlcadas(lista);
    lista.forEach((a, i) => { if (a.nivel !== i + 1) throw new Error('Os níveis devem ser sequenciais (1, 2, 3…).'); });
    for (let i = 1; i < lista.length; i++) {
      const ant = lista[i - 1].limite, at = lista[i].limite;
      if (ant === null) throw new Error('Somente o último nível pode ficar sem limite ("acima de").');
      if (at !== null && at <= ant) throw new Error('O limite do nível ' + lista[i].nivel + ' deve ser maior que o do nível ' + lista[i - 1].nivel + '.');
    }
    if (Auth.modo === 'nuvem') return Cloud.salvarAlcadas(lista);
    const antes = S.db.alcadas;
    S.db.alcadas = lista;
    S.auditarEvento('alterou', 'alcadas', 'alcadas', 'Alçadas de aprovação', { alcadas: { de: antes, para: lista } });
    S.save();
  };

  /* ---------- Auditoria ---------- */
  Auth.listarAuditoria = async function (f) {
    if (!Auth.perm.verRegistros) throw new Error('Sem permissão para consultar os registros.');
    if (Auth.modo === 'nuvem') return Cloud.listarAuditoria(f);
    return S.db.auditoria.filter(a => {
      const d = a.quando.slice(0, 10);
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
      if (f.usuario && a.email !== f.usuario) return false;
      if (f.colecao && a.colecao !== f.colecao) return false;
      return true;
    }).slice(0, f.limite || 500);
  };

  /* ---------- Tela de login ---------- */
  Auth.telaLogin = function (aviso) {
    const UI = root.UI;
    const old = document.getElementById('login');
    if (old) old.remove();
    const demo = Auth.modo === 'local' && S.config().exemplo;
    const usuariosDemo = demo ? S.db.usuarios.filter(u => u.demo_senha) : [];
    const semUsuarios = Auth.modo === 'local' && !S.db.usuarios.length;
    const el = document.createElement('div');
    el.id = 'login';
    el.className = 'login';
    el.innerHTML = '<form class="login-box" id="login-form" autocomplete="on">' +
      '<img src="assets/logo-brasmic.svg" alt="Brasmic Mineração Areia &amp; Brita">' +
      '<div class="login-sys">Portal de Compras</div>' +
      (aviso ? '<div class="note warn">' + U.esc(aviso) + '</div>' : '') +
      (semUsuarios ? '<div class="note">Primeiro acesso: crie o usuário administrador.</div><div class="f"><label for="lg-nome">Nome</label><input id="lg-nome" required></div>' : '') +
      '<div class="f"><label for="lg-email">E-mail</label><input id="lg-email" type="email" autocomplete="username" required></div>' +
      '<div class="f"><label for="lg-senha">Senha</label><input id="lg-senha" type="password" autocomplete="current-password" required minlength="' + (semUsuarios ? 6 : 1) + '"></div>' +
      '<button class="btn pri" type="submit" id="lg-ok">' + (semUsuarios ? 'Criar administrador e entrar' : 'Entrar') + '</button>' +
      '<p class="small muted" id="lg-msg" role="alert"></p>' +
      (Auth.modo === 'nuvem' ? '<p class="small muted">Acesso liberado pelo administrador do portal. Esqueceu a senha? Peça ao administrador para redefini-la.</p>' : '') +
      (usuariosDemo.length ? '<div class="demo-users"><div class="small"><b>Prévia — usuários de demonstração</b> (clique para preencher)</div>' +
        usuariosDemo.map(u => '<button type="button" class="btn sm" data-demo="' + U.esc(u.email) + '" data-senha="' + U.esc(u.demo_senha) + '"><b>' + U.esc(R.CATEGORIAS[u.categoria]) + '</b> · ' + U.esc(u.nome.replace(' (exemplo)', '')) + '</button>').join('') + '</div>' : '') +
      '</form>';
    document.body.appendChild(el);
    const f = el.querySelector('#login-form');
    el.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => {
      f.querySelector('#lg-email').value = b.dataset.demo;
      f.querySelector('#lg-senha').value = b.dataset.senha;
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit'));
    });
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('#lg-ok');
      const msg = f.querySelector('#lg-msg');
      btn.disabled = true; msg.textContent = Auth.modo === 'nuvem' ? 'Entrando e carregando os dados do banco…' : 'Entrando…';
      try {
        if (semUsuarios) {
          const id = U.uid(), salt = U.uid();
          S.db.usuarios.push({ id: id, salt: salt, senha_hash: await Auth.hashSenha(f.querySelector('#lg-senha').value, salt), nome: f.querySelector('#lg-nome').value.trim(), email: f.querySelector('#lg-email').value.trim().toLowerCase(), categoria: 'administrador', centros: [], ativo: true, ver_totalizadores: true, ver_registros: true, pode_cadastros: true, criado_em: U.nowIso() });
          S.save();
        }
        await Auth.entrar(f.querySelector('#lg-email').value, f.querySelector('#lg-senha').value);
        el.remove();
        if (root.App) root.App.aposLogin();
      } catch (err) {
        msg.textContent = err.message === 'Failed to fetch' ? 'Não foi possível acessar o banco de dados. Verifique a internet e a configuração do Supabase.' : err.message;
        btn.disabled = false;
      }
    };
    setTimeout(() => f.querySelector('input').focus(), 30);
  };

  root.Auth = Auth;
})(window);
