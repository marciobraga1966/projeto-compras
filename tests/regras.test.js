/* Testes das regras de acesso, alçadas, destino e importação de planilhas. Rodar: npm test */
const test = require('node:test');
const assert = require('node:assert');
global.U = require('../js/util.js');
const R = require('../js/rules.js');
const IM = require('../js/importmap.js');

const alcadas = [{ nivel: 1, limite: 500 }, { nivel: 2, limite: 1000 }, { nivel: 3, limite: null }];

test('nível exigido pela alçada', () => {
  assert.strictEqual(R.nivelNecessario(499.99, alcadas), 1);
  assert.strictEqual(R.nivelNecessario(500, alcadas), 1);
  assert.strictEqual(R.nivelNecessario(800, alcadas), 2);
  assert.strictEqual(R.nivelNecessario(1000, alcadas), 2);
  assert.strictEqual(R.nivelNecessario(1000.01, alcadas), 3);
  assert.strictEqual(R.nivelNecessario(10, []), null);
});

test('autorizador precisa ter todos os níveis até o exigido', () => {
  const p = (cat, niveis) => R.permissoes({ categoria: cat }, { niveis: niveis });
  assert.ok(R.podeAprovar(p('comprador', [1, 2]), 2));
  assert.ok(!R.podeAprovar(p('comprador', [1, 2]), 3));
  assert.ok(!R.podeAprovar(p('comprador', [2]), 2));
  assert.ok(R.podeAprovar(p('administrador', []), 3));
  assert.ok(R.podeAprovar(p('comprador', []), null));
});

test('coleções que cada categoria pode gravar no banco', () => {
  const b = R.permissoes({ categoria: 'basico' }), c = R.permissoes({ categoria: 'comprador' }), ca = R.permissoes({ categoria: 'comprador', pode_cadastros: true });
  assert.ok(!R.podeGravarColecao(c, '_sistema'));
  assert.ok(!R.podeGravarColecao(b, '_sistema'));
  assert.ok(R.podeGravarColecao(R.permissoes({ categoria: 'administrador' }), '_sistema'));
  assert.ok(!R.podeGravarColecao(c, 'categoriasDespesa'));
  assert.ok(R.podeGravarColecao(ca, 'categoriasDespesa'));
  assert.ok(R.podeGravarColecao(b, 'entregas') && !R.podeGravarColecao(b, 'produtos'));
});

test('quem gerou o pedido não pode aprová-lo', () => {
  assert.ok(R.ehAutorDoPedido({ criadoPor: 'u1' }, 'u1'));
  assert.ok(!R.ehAutorDoPedido({ criadoPor: 'u1' }, 'u2'));
  assert.ok(!R.ehAutorDoPedido({}, 'u1'));
});

test('permissões por categoria de usuário', () => {
  const b = R.permissoes({ categoria: 'basico' });
  assert.deepStrictEqual([b.basico, b.processoCompras, b.verTotalizadores, b.editarProdutosFornecedores], [true, false, false, false]);
  const c = R.permissoes({ categoria: 'comprador', pode_cadastros: false });
  assert.deepStrictEqual([c.processoCompras, c.editarProdutosFornecedores, c.gerenciarUsuarios], [true, false, false]);
  assert.ok(R.permissoes({ categoria: 'comprador', pode_cadastros: true }).editarProdutosFornecedores);
  assert.ok(!R.permissoes({ categoria: 'basico', pode_cadastros: true }).editarProdutosFornecedores);
  const a = R.permissoes({ categoria: 'administrador' });
  assert.deepStrictEqual([a.verTotalizadores, a.verRegistros, a.gerenciarUsuarios, a.excluirItensSolicitados], [true, true, true, true]);
});

test('visibilidade e alteração de solicitações', () => {
  const eu = { id: 'u1', centros: ['cc1'] };
  const b = R.permissoes({ categoria: 'basico' });
  const c = R.permissoes({ categoria: 'comprador' });
  assert.ok(R.podeVerSolicitacao(b, eu, { centroCustoId: 'cc1' }));
  assert.ok(!R.podeVerSolicitacao(b, eu, { centroCustoId: 'cc2' }));
  assert.ok(R.podeVerSolicitacao(c, eu, { centroCustoId: 'cc2' }));
  assert.ok(R.podeEditarSolicitacao(b, eu, { status: 'aberta', criadoPor: 'u1' }));
  assert.ok(!R.podeEditarSolicitacao(b, eu, { status: 'aberta', criadoPor: 'u2' }));
  assert.ok(!R.podeEditarSolicitacao(b, eu, { status: 'em_cotacao', criadoPor: 'u1' }));
  assert.ok(R.podeEditarSolicitacao(c, eu, { status: 'em_cotacao' }));
  assert.ok(!R.podeEditarSolicitacao(c, eu, { status: 'pedido' }));
});

test('destino da solicitação e dos itens', () => {
  assert.deepStrictEqual(R.validarDestinos({ destino: 'estoque', itens: [{ destino: 'estoque' }] }), []);
  assert.strictEqual(R.validarDestinos({ destino: 'estoque', itens: [{ destino: 'aplicacao' }] }).length, 1);
  assert.strictEqual(R.validarDestinos({ destino: 'ambas', itens: [{ destino: 'aplicacao' }, { destino: '' }] }).length, 1);
  assert.deepStrictEqual(R.validarDestinos({ destino: 'ambas', itens: [{ destino: 'aplicacao' }, { destino: 'estoque' }] }), []);
  assert.strictEqual(R.destinoDosItens([{ destino: 'aplicacao' }, { destino: 'estoque' }]), 'ambas');
});

test('importação de fornecedores: contato e e-mail em colunas separadas', () => {
  const nome = (h, r) => { const m = IM.mapear('fornecedores', h, r); const o = {}; Object.keys(m).forEach(k => { o[k] = h[m[k]]; }); return o; };
  assert.deepStrictEqual(nome(['Fornecedor', 'CNPJ', 'E-mail do Contato', 'Nome do Contato', 'Fone'], [['B', '11222333000181', 'x@b.com', 'Maria', '3199']]),
    { razao: 'Fornecedor', cnpj: 'CNPJ', contato: 'Nome do Contato', email: 'E-mail do Contato', telefone: 'Fone' });
  // coluna "Contato" que na verdade traz e-mails vai para o campo e-mail
  const m = IM.mapear('fornecedores', ['Razao', 'Contato'], [['D Ltda', 'd@d.com'], ['E Ltda', 'e@e.com']]);
  assert.strictEqual(m.email, 1);
  assert.strictEqual(m.contato, undefined);
  const f = { contato: 'Vendas@X.com', email: '' };
  assert.ok(IM.corrigirContato(f));
  assert.deepStrictEqual(f, { contato: '', email: 'vendas@x.com' });
});
