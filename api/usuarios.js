/* Função do servidor (Vercel) para o cadastro de usuários do portal.
   Usa a chave de serviço do Supabase, que fica SOMENTE no servidor (variável SUPABASE_SERVICE_ROLE_KEY).
   Só atende administradores do portal (conferido pelo token de quem chama).
   Ações:
     { acao: 'criar', email, senha, perfil }  → cria o login e o perfil
     { acao: 'senha', user_id, senha }        → redefine a senha */
module.exports = async function handler(req, res) {
  const URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const responder = (status, corpo) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(corpo)); };

  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido' });
  if (!URL || !ANON || !SERVICE) return responder(500, { erro: 'Servidor sem configuração: defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY na Vercel.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body) {
    body = await new Promise(resolve => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({}); } }); });
  }

  const svc = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
  try {
    // 1. quem está chamando?
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return responder(401, { erro: 'Sessão ausente' });
    const ru = await fetch(URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } });
    if (!ru.ok) return responder(401, { erro: 'Sessão inválida ou expirada' });
    const quem = await ru.json();
    // 2. é administrador ativo do portal?
    const rp = await fetch(URL + '/rest/v1/perfis?select=categoria,ativo,nome&user_id=eq.' + quem.id, { headers: svc });
    const perfil = (await rp.json())[0];
    if (!perfil || !perfil.ativo || perfil.categoria !== 'administrador') return responder(403, { erro: 'Somente administradores podem cadastrar usuários.' });

    const auditar = (acao, uid, resumo, detalhe) => fetch(URL + '/rest/v1/auditoria', {
      method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, svc),
      body: JSON.stringify({ user_id: quem.id, email: quem.email, nome: perfil.nome || quem.email, acao: acao, colecao: 'usuarios', registro_id: uid, resumo: resumo, detalhe: detalhe || null })
    });

    if (body.acao === 'criar') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return responder(400, { erro: 'E-mail inválido' });
      if (!body.senha || String(body.senha).length < 6) return responder(400, { erro: 'A senha precisa ter pelo menos 6 caracteres' });
      const rc = await fetch(URL + '/auth/v1/admin/users', { method: 'POST', headers: svc, body: JSON.stringify({ email: email, password: body.senha, email_confirm: true }) });
      const novo = await rc.json();
      if (!rc.ok) return responder(400, { erro: /already|registered|exists/i.test(novo.msg || novo.message || '') ? 'Já existe um login com este e-mail.' : (novo.msg || novo.message || 'Falha ao criar o login') });
      const p = Object.assign({}, body.perfil || {}, { user_id: novo.id, email: email });
      const ri = await fetch(URL + '/rest/v1/perfis', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, svc), body: JSON.stringify(p) });
      if (!ri.ok) {
        await fetch(URL + '/auth/v1/admin/users/' + novo.id, { method: 'DELETE', headers: svc });
        const j = await ri.json().catch(() => ({}));
        return responder(400, { erro: 'Falha ao gravar o perfil: ' + (j.message || ri.status) });
      }
      await auditar('criou', novo.id, 'Login criado para ' + email, { categoria: { de: null, para: p.categoria } });
      return responder(200, { user_id: novo.id });
    }

    if (body.acao === 'senha') {
      if (!body.user_id || !body.senha || String(body.senha).length < 6) return responder(400, { erro: 'A senha precisa ter pelo menos 6 caracteres' });
      const rs = await fetch(URL + '/auth/v1/admin/users/' + encodeURIComponent(body.user_id), { method: 'PUT', headers: svc, body: JSON.stringify({ password: body.senha }) });
      if (!rs.ok) { const j = await rs.json().catch(() => ({})); return responder(400, { erro: j.msg || j.message || 'Falha ao redefinir a senha' }); }
      await auditar('alterou', body.user_id, 'Senha redefinida pelo administrador', { senha: { de: '•••', para: 'redefinida' } });
      return responder(200, { ok: true });
    }

    return responder(400, { erro: 'Ação desconhecida' });
  } catch (err) {
    return responder(500, { erro: 'Erro no servidor: ' + err.message });
  }
};
