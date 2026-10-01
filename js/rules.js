/* Regras de acesso, alçadas de aprovação e destino dos itens — funções puras
   (usadas pela interface e pelos testes; o banco Supabase aplica as mesmas regras no servidor). */
(function (root) {
  'use strict';
  const R = {};

  R.CATEGORIAS = {
    basico: 'Básico',
    comprador: 'Comprador',
    administrador: 'Administrador'
  };

  /* Permissões efetivas de um perfil de usuário */
  R.permissoes = function (perfil, comprador) {
    const p = perfil || {};
    const admin = p.categoria === 'administrador';
    const compr = p.categoria === 'comprador' || admin;
    return {
      admin: admin,
      comprador: compr,
      basico: !compr,
      verTodasSolicitacoes: compr,
      verTotalizadores: admin || !!p.ver_totalizadores,
      verRegistros: admin || !!p.ver_registros,
      editarProdutosFornecedores: admin || (p.categoria === 'comprador' && !!p.pode_cadastros),
      editarCadastrosBase: admin,          // solicitantes, compradores (alçadas), centros de custo
      gerenciarUsuarios: admin,
      processoCompras: compr,              // cotações, pedidos, estoque
      excluirItensSolicitados: admin,
      niveis: comprador && Array.isArray(comprador.niveis) ? comprador.niveis.map(Number).sort() : []
    };
  };

  /* ---------- Alçadas ---------- */

  /* alcadas: [{ nivel: 1, limite: 500 }, { nivel: 2, limite: 1000 }, { nivel: 3, limite: null }] (null = acima) */
  R.ordenarAlcadas = function (alcadas) {
    return (alcadas || []).slice().sort((a, b) => a.nivel - b.nivel);
  };

  /* Nível exigido para um valor; null quando não há alçadas configuradas */
  R.nivelNecessario = function (valor, alcadas) {
    const lista = R.ordenarAlcadas(alcadas);
    if (!lista.length) return null;
    for (const a of lista) {
      if (a.limite === null || a.limite === undefined || a.limite === '' || Number(valor) <= Number(a.limite) + 1e-9) return a.nivel;
    }
    return lista[lista.length - 1].nivel;
  };

  /* Para aprovar no nível N o autorizador precisa ter todos os níveis de 1 até N */
  R.podeAprovar = function (perm, nivel) {
    if (nivel === null || nivel === undefined) return true;
    if (perm.admin) return true;
    for (let n = 1; n <= nivel; n++) if (perm.niveis.indexOf(n) < 0) return false;
    return true;
  };

  R.descreverAlcada = function (alcadas) {
    const lista = R.ordenarAlcadas(alcadas);
    let anterior = 0;
    return lista.map(a => {
      const niveis = Array.from({ length: a.nivel }, (_, i) => i + 1).join(', ');
      const faixa = a.limite === null || a.limite === undefined || a.limite === ''
        ? 'acima de ' + fmt(anterior)
        : 'até ' + fmt(a.limite);
      if (a.limite !== null && a.limite !== undefined && a.limite !== '') anterior = a.limite;
      return { nivel: a.nivel, faixa: faixa, exige: 'níveis ' + niveis };
    });
  };
  function fmt(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ---------- Solicitações ---------- */

  const ABERTAS = ['rascunho', 'aberta'];
  const EM_PROCESSO = ['rascunho', 'aberta', 'em_cotacao'];

  R.podeVerSolicitacao = function (perm, perfil, sol) {
    if (perm.verTodasSolicitacoes) return true;
    const centros = (perfil && perfil.centros) || [];
    return centros.indexOf(sol.centroCustoId) > -1 || sol.criadoPor === (perfil && perfil.id);
  };

  /* Básico altera só a própria solicitação enquanto o processo não começou;
     depois disso só compradores e administradores */
  R.podeEditarSolicitacao = function (perm, perfil, sol) {
    if (perm.comprador) return EM_PROCESSO.indexOf(sol.status) > -1;
    return ABERTAS.indexOf(sol.status) > -1 && sol.criadoPor === (perfil && perfil.id);
  };

  R.podeCancelarSolicitacao = R.podeEditarSolicitacao;

  /* Destino: 'aplicacao' | 'estoque' | 'ambas'. Com 'ambas', cada item precisa ter o seu. */
  R.validarDestinos = function (sol) {
    const erros = [];
    if (['aplicacao', 'estoque', 'ambas'].indexOf(sol.destino) < 0) erros.push('Informe o destino do material.');
    (sol.itens || []).forEach((it, i) => {
      if (it.destino !== 'aplicacao' && it.destino !== 'estoque') erros.push('Item ' + (i + 1) + ': informe se vai para estoque ou aplicação direta.');
      else if (sol.destino !== 'ambas' && it.destino !== sol.destino) erros.push('Item ' + (i + 1) + ': destino diferente do informado na solicitação.');
    });
    return erros;
  };

  /* Destino resumido a partir dos itens */
  R.destinoDosItens = function (itens) {
    const set = new Set((itens || []).map(i => i.destino).filter(Boolean));
    if (set.size === 2) return 'ambas';
    return set.size === 1 ? Array.from(set)[0] : '';
  };

  root.R = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
