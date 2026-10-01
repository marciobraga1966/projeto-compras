/* Testes dos interpretadores (voz, OCR, propostas). Rodar: npm test */
const test = require('node:test');
const assert = require('node:assert');
global.U = require('../js/util.js');
const P = require('../js/parser.js');

const produtos = [
  { id: 'p1', codigo: 'MAT-001', descricao: 'Parafuso sextavado M12 x 50 zincado', unidade: 'PC' },
  { id: 'p2', codigo: 'MAT-002', descricao: 'Óleo hidráulico ISO 68', unidade: 'L' }
];

test('números em pt-BR', () => {
  assert.strictEqual(U.parseNum('1.234,56'), 1234.56);
  assert.strictEqual(U.parseNum('R$ 12,5'), 12.5);
  assert.strictEqual(U.parseNum('1,234.56'), 1234.56);
  assert.strictEqual(U.parseNum('12.50'), 12.5);
  assert.strictEqual(P.wordsToNumbers('vinte e cinco metros'), '25 metros');
  assert.strictEqual(P.wordsToNumbers('meia dúzia de luvas'), '6 de luvas');
});

test('CNPJ', () => {
  assert.ok(U.validCnpj('11.222.333/0001-81'));
  assert.ok(!U.validCnpj('11.222.333/0001-82'));
});

test('ditado por voz gera itens e ignora falas de cabeçalho', () => {
  const it = P.parseItems('dez unidades de parafuso sextavado M12 marca Gerdau, cinco litros de óleo hidráulico 68, urgente, próximo item duas caixas de luva de raspa', { mode: 'voz', produtos });
  assert.strictEqual(it.length, 3);
  assert.deepStrictEqual([it[0].qtd, it[0].unidade, it[0].marca, it[0].produtoId], [10, 'UN', 'Gerdau', 'p1']);
  assert.deepStrictEqual([it[1].qtd, it[1].unidade, it[1].produtoId], [5, 'L', 'p2']);
  assert.deepStrictEqual([it[2].descricao, it[2].qtd, it[2].unidade], ['Luva de raspa', 2, 'CX']);
});

test('cabeçalho ditado', () => {
  const h = P.parseHeader('solicitante João Silva, centro de custo britagem, aplicação direta, urgente, necessidade 15/10/2026',
    { solicitantes: [{ id: 's1', nome: 'João da Silva' }], centrosCusto: [{ id: 'c1', codigo: 'CC-10', descricao: 'Britagem primária' }] });
  assert.deepStrictEqual(h, { destino: 'aplicacao', prioridade: 'urgente', solicitanteId: 's1', centroCustoId: 'c1', necessidade: '2026-10-15' });
});

test('OCR de requisição digitalizada', () => {
  const it = P.parseItems('REQUISIÇÃO DE COMPRA\nItem Descrição Qtd Un\n01 - Parafuso sextavado M12x50 | 100 PC\n02 - Correia transportadora 800mm | 50 m\n3) Luva de raspa cano longo 20 par\nAssinatura: ____', { mode: 'ocr', produtos });
  assert.strictEqual(it.length, 3);
  assert.deepStrictEqual([it[0].qtd, it[0].produtoId], [100, 'p1']);
  assert.deepStrictEqual([it[1].qtd, it[1].unidade], [50, 'M']);
  assert.deepStrictEqual([it[2].qtd, it[2].unidade], [20, 'PAR']);
});

test('proposta de fornecedor em texto', () => {
  const itens = [{ id: 'a', descricao: 'Parafuso sextavado M12x50', qtd: 100 }, { id: 'b', descricao: 'Correia transportadora 800mm', qtd: 50 }];
  const r = P.parseProposal('Comercial Ferragens LTDA\nCNPJ: 11.222.333/0001-81\n1 Parafuso sext. M12x50 zincado 100 pc R$ 1,25 R$ 125,00 marca Ciser\n2 Correia transportadora 800 mm 3 lonas 50 m 389,90 19.495,00\nPrazo de entrega: 7 dias\nCondição de pagamento: 28 dias\nFrete: FOB R$ 150,00\nValidade da proposta: 15 dias', itens);
  assert.strictEqual(r.cnpj, '11.222.333/0001-81');
  assert.strictEqual(r.fornecedorNome, 'Comercial Ferragens LTDA');
  assert.strictEqual(r.precos.a.unit, 1.25);
  assert.strictEqual(r.precos.a.marca, 'Ciser');
  assert.strictEqual(r.precos.b.unit, 389.9);
  assert.deepStrictEqual([r.prazoEntregaDias, r.freteTipo, r.frete, r.validadeDias], [7, 'FOB', 150, 15]);
});
