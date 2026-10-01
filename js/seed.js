/* Dados de exemplo (marcados como exemplo) para conhecer o sistema no primeiro acesso */
(function (root) {
  'use strict';
  const { U, S, D } = root;
  const Seed = {};

  Seed.load = function () {
    S.reset();
    const db = S.db;
    db.config.exemplo = true;

    const add = (col, o) => S.upsert(col, o, true);

    const cc = {};
    [['CC-100', 'Lavra e extração'], ['CC-200', 'Britagem primária'], ['CC-300', 'Rebritagem e peneiramento'],
     ['CC-400', 'Manutenção mecânica'], ['CC-500', 'Frota e equipamentos móveis'], ['CC-600', 'Segurança do trabalho'],
     ['CC-700', 'Administrativo']].forEach(([c, d]) => { cc[c] = add('centrosCusto', { codigo: c, descricao: d }); });

    const sol1 = add('solicitantes', { codigo: 'SOL-001', nome: 'Carlos Mendes (exemplo)', setor: 'Manutenção mecânica', email: '', telefone: '' });
    const sol2 = add('solicitantes', { codigo: 'SOL-002', nome: 'Ana Paula Ribeiro (exemplo)', setor: 'Segurança do trabalho', email: '', telefone: '' });
    const sol3 = add('solicitantes', { codigo: 'SOL-003', nome: 'Roberto Alves (exemplo)', setor: 'Britagem', email: '', telefone: '' });
    const comp1 = add('compradores', { codigo: 'COMP-001', nome: 'Juliana Costa (exemplo)', email: '', telefone: '' });
    add('compradores', { codigo: 'COMP-002', nome: 'Marcos Teixeira (exemplo)', email: '', telefone: '' });

    const f = [
      { razao: 'Rolamentos Serra Azul Comércio Ltda (exemplo)', fantasia: 'Rolamentos Serra Azul', cidade: 'Belo Horizonte', uf: 'MG', categorias: 'Rolamentos, transmissão', contato: 'Vendas', email: 'vendas@exemplo-rolamentos.com.br', telefone: '(31) 3000-0001' },
      { razao: 'Transmissão Industrial Vale Ltda (exemplo)', fantasia: 'TransVale', cidade: 'Contagem', uf: 'MG', categorias: 'Correias, rolamentos, lubrificantes', contato: 'Comercial', email: 'comercial@exemplo-transvale.com.br', telefone: '(31) 3000-0002' },
      { razao: 'Casa do Minerador Distribuidora Ltda (exemplo)', fantasia: 'Casa do Minerador', cidade: 'Sete Lagoas', uf: 'MG', categorias: 'EPI, ferragens, lubrificantes', contato: 'Atendimento', email: 'orcamento@exemplo-casadominerador.com.br', telefone: '(31) 3000-0003' },
      { razao: 'Proteção Total EPI Ltda (exemplo)', fantasia: 'Proteção Total', cidade: 'Betim', uf: 'MG', categorias: 'EPI, uniformes', contato: 'Vendas', email: 'vendas@exemplo-protecaototal.com.br', telefone: '(31) 3000-0004' }
    ].map((x, i) => add('fornecedores', Object.assign({ codigo: 'FOR-' + U.pad(i + 1, 3), cnpj: '', whatsapp: '', obs: '', origem: 'cadastro', ativo: true }, x)));
    db.seq['cod-FOR'] = 4;

    const prods = [
      ['Rolamento autocompensador de rolos 22218 E', 'UN', 'Rolamentos', ['SKF', 'NSK', 'FAG'], 4],
      ['Graxa de lítio EP2', 'KG', 'Lubrificantes', ['Petronas', 'Mobil'], 50],
      ['Óleo hidráulico ISO VG 68', 'L', 'Lubrificantes', ['Lubrax', 'Mobil'], 200],
      ['Correia transportadora 800 mm 3 lonas', 'M', 'Correias', ['Goodyear', 'Correias Mercúrio'], 0],
      ['Luva de raspa cano longo', 'PAR', 'EPI', ['Kalipso'], 30],
      ['Botina de segurança bico composite', 'PAR', 'EPI', ['Marluvas', 'Bracol'], 10],
      ['Tela de peneira aço manganês malha 1"', 'UN', 'Peneiramento', [], 2],
      ['Dente de caçamba para escavadeira', 'UN', 'Desgaste', ['ESCO'], 6],
      ['Parafuso sextavado M12 x 50 zincado', 'PC', 'Fixação', ['Ciser'], 100],
      ['Protetor auricular tipo plug', 'PAR', 'EPI', ['3M'], 100]
    ].map((p, i) => add('produtos', {
      codigo: 'MAT-' + U.pad(i + 1, 3), descricao: p[0], unidade: p[1], categoria: p[2], marcas: p[3], ncm: '',
      estoqueMin: p[4], estoqueMax: p[4] * 3, origem: 'cadastro', historicoPrecos: []
    }));
    db.seq['cod-MAT'] = prods.length;

    const ent = (p, q, custo, dias) => add('movimentos', { data: U.addDays(U.today(), -dias), produtoId: p.id, tipo: 'entrada', qtd: q, custoUnit: custo, doc: 'Saldo inicial (exemplo)', origem: 'Inventário', obs: '' });
    ent(prods[0], 2, 1890, 60); ent(prods[1], 35, 38.5, 60); ent(prods[2], 420, 22.9, 60);
    ent(prods[4], 12, 17.4, 40); ent(prods[5], 14, 139, 40); ent(prods[7], 8, 612, 50); ent(prods[8], 240, 1.35, 50); ent(prods[9], 60, 1.9, 30);
    add('movimentos', { data: U.addDays(U.today(), -5), produtoId: prods[2].id, tipo: 'saida', qtd: 80, custoUnit: 22.9, doc: 'RM 0412', origem: 'Requisição de material', centroCustoId: cc['CC-500'].id, obs: 'Troca de óleo escavadeira' });

    // Solicitação 1 — manutenção do britador, já em cotação com três propostas
    const s1 = D.novaSolicitacao();
    Object.assign(s1, {
      solicitanteId: sol1.id, compradorId: comp1.id, centroCustoId: cc['CC-200'].id, destino: 'aplicacao',
      aplicacao: 'Britador de mandíbulas — troca dos mancais', prioridade: 'urgente', origemEntrada: 'voz',
      necessidade: U.addDays(U.today(), 5), obs: 'Parada programada para a próxima semana.',
      itens: [
        { id: U.uid(), produtoId: prods[0].id, descricao: prods[0].descricao, qtd: 4, unidade: 'UN', marca: 'SKF', obs: '' },
        { id: U.uid(), produtoId: prods[1].id, descricao: prods[1].descricao, qtd: 20, unidade: 'KG', marca: '', obs: '' },
        { id: U.uid(), produtoId: prods[8].id, descricao: prods[8].descricao, qtd: 200, unidade: 'PC', marca: '', obs: '' }
      ]
    });
    D.salvarSolicitacao(s1);
    const c1 = D.criarCotacao([s1.id], comp1.id);
    c1.fornecedorIds = [f[0].id, f[1].id, f[2].id];
    const prop = (forn, prazo, pag, frete, precos, marcas) => {
      const p = D.novaProposta(forn.id);
      Object.assign(p, { prazoEntregaDias: prazo, condPagamento: pag, frete: frete, freteTipo: frete ? 'FOB' : 'CIF', origem: 'digitada' });
      c1.itens.forEach((it, i) => { if (precos[i] !== null) p.precos[it.id] = { unit: precos[i], marca: marcas[i] || '', disponivel: true }; });
      D.salvarProposta(c1, p);
    };
    prop(f[0], 3, '28 dias', 0, [1845.00, 41.90, 1.42], ['SKF', 'Mobil', 'Ciser']);
    prop(f[1], 5, '30/60 dias', 180, [1799.00, 39.50, null], ['NSK', 'Petronas', '']);
    prop(f[2], 2, 'À vista 3% desc.', 0, [1920.00, 36.80, 1.18], ['FAG', 'Petronas', 'Ciser']);

    // Solicitação 2 — EPI para estoque, aberta aguardando cotação
    const s2 = D.novaSolicitacao();
    Object.assign(s2, {
      solicitanteId: sol2.id, compradorId: comp1.id, centroCustoId: cc['CC-600'].id, destino: 'estoque',
      aplicacao: 'Reposição do almoxarifado de EPI', prioridade: 'normal', origemEntrada: 'digitalizada',
      itens: [
        { id: U.uid(), produtoId: prods[4].id, descricao: prods[4].descricao, qtd: 60, unidade: 'PAR', marca: '', obs: '' },
        { id: U.uid(), produtoId: prods[5].id, descricao: prods[5].descricao, qtd: 12, unidade: 'PAR', marca: 'Marluvas', obs: 'Números 40 a 44' },
        { id: U.uid(), produtoId: prods[9].id, descricao: prods[9].descricao, qtd: 200, unidade: 'PAR', marca: '3M', obs: '' }
      ]
    });
    D.salvarSolicitacao(s2);

    // Solicitação 3 — correia, cotação finalizada e pedido emitido
    const s3 = D.novaSolicitacao();
    Object.assign(s3, {
      solicitanteId: sol3.id, compradorId: comp1.id, centroCustoId: cc['CC-300'].id, destino: 'aplicacao',
      aplicacao: 'Transportador TC-04 da peneira', prioridade: 'alta', origemEntrada: 'digitada', data: U.addDays(U.today(), -9),
      itens: [{ id: U.uid(), produtoId: prods[3].id, descricao: prods[3].descricao, qtd: 60, unidade: 'M', marca: '', obs: 'Com emenda vulcanizada' }]
    });
    D.salvarSolicitacao(s3);
    const c2 = D.criarCotacao([s3.id], comp1.id);
    c2.data = U.addDays(U.today(), -8);
    [[f[1], 389.9, 'Goodyear', 7, '28 dias'], [f[0], 412.0, 'Correias Mercúrio', 10, '30 dias']].forEach(([forn, v, m, prazo, pag]) => {
      const p = D.novaProposta(forn.id);
      Object.assign(p, { prazoEntregaDias: prazo, condPagamento: pag, data: U.addDays(U.today(), -6) });
      p.precos[c2.itens[0].id] = { unit: v, marca: m, disponivel: true };
      D.salvarProposta(c2, p);
    });
    D.gerarPedidos(c2);

    db.log.unshift({ data: U.nowIso(), texto: 'Dados de exemplo carregados' });
    S.save();
  };

  root.Seed = Seed;
})(window);
