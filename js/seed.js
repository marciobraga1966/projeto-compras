/* Dados de exemplo (marcados como exemplo) para conhecer o sistema no primeiro acesso */
(function (root) {
  'use strict';
  const { U, S, D, R } = root;
  const Seed = {};

  Seed.load = function () {
    S.reset();
    // durante a carga, age como administrador (para cadastrar produtos e histórico de preços)
    const permAntes = root.Auth ? root.Auth.perm : null;
    if (root.Auth) root.Auth.perm = R.permissoes({ categoria: 'administrador' });
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
    const comp1 = add('compradores', { codigo: 'COMP-001', nome: 'Juliana Costa (exemplo)', email: '', telefone: '', niveis: [1, 2] });
    const comp2 = add('compradores', { codigo: 'COMP-002', nome: 'Marcos Teixeira (exemplo)', email: '', telefone: '', niveis: [1] });

    // alçadas: até R$ 500 nível 1; até R$ 1.000 níveis 1 e 2; acima, níveis 1, 2 e 3
    db.alcadas = [{ nivel: 1, limite: 500 }, { nivel: 2, limite: 1000 }, { nivel: 3, limite: null }];

    // usuários de demonstração (a senha aparece na tela de login da prévia)
    const usr = (id, nome, email, senha, categoria, extra) => {
      const salt = 'demo-' + id;
      const u = Object.assign({ id: id, nome: nome, email: email, categoria: categoria, centros: [], ativo: true, salt: salt, senha_hash: '', demo_senha: senha,
        ver_totalizadores: false, ver_registros: false, pode_cadastros: false, solicitante_id: '', comprador_id: '', criado_em: U.nowIso() }, extra || {});
      db.usuarios.push(u);
      root.Auth.hashSenha(senha, salt).then(hh => { u.senha_hash = hh; S.saveLocal(); });
      return u;
    };
    usr('u-admin', 'Administrador do portal (exemplo)', 'admin@brasmic.demo', 'admin123', 'administrador', { ver_totalizadores: true, ver_registros: true, pode_cadastros: true });
    const uJul = usr('u-juliana', 'Juliana Costa (exemplo)', 'juliana@brasmic.demo', 'compras123', 'comprador', { pode_cadastros: true, ver_totalizadores: true, comprador_id: comp1.id });
    usr('u-marcos', 'Marcos Teixeira (exemplo)', 'marcos@brasmic.demo', 'compras123', 'comprador', { pode_cadastros: false, comprador_id: comp2.id });
    const uCarlos = usr('u-carlos', 'Carlos Mendes (exemplo)', 'carlos@brasmic.demo', 'basico123', 'basico', { centros: [cc['CC-200'].id, cc['CC-400'].id], solicitante_id: sol1.id });
    const uAna = usr('u-ana', 'Ana Paula Ribeiro (exemplo)', 'ana@brasmic.demo', 'basico123', 'basico', { centros: [cc['CC-600'].id], solicitante_id: sol2.id, ver_registros: true });
    const uRob = usr('u-roberto', 'Roberto Alves (exemplo)', 'roberto@brasmic.demo', 'basico123', 'basico', { centros: [cc['CC-300'].id], solicitante_id: sol3.id });

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

    // equipamentos por centro de custo
    const eq = {};
    [['BM-01', 'Britador de mandíbulas primário', 'Britador', 'CC-200', 'Metso', 'C106'],
     ['BC-02', 'Britador cônico secundário', 'Britador', 'CC-300', 'Metso', 'HP300'],
     ['PV-01', 'Peneira vibratória 3 decks', 'Peneira', 'CC-300', 'Faço', '6x16'],
     ['TC-04', 'Transportador de correia TC-04', 'Transportador de correia', 'CC-300', '', ''],
     ['EX-01', 'Escavadeira hidráulica 36 t', 'Escavadeira', 'CC-100', 'Caterpillar', '336'],
     ['PC-01', 'Pá carregadeira', 'Pá carregadeira', 'CC-500', 'Volvo', 'L120'],
     ['CF-03', 'Caminhão fora de estrada', 'Caminhão', 'CC-500', 'Volvo', 'A40'],
     ['GR-01', 'Grupo gerador 450 kVA', 'Gerador', 'CC-400', 'Stemac', '']].forEach(([cod, d, tipo, ccc, fab, mod]) => {
      eq[cod] = add('equipamentos', { codigo: cod, descricao: d, tipo: tipo, centroCustoId: cc[ccc].id, fabricante: fab, modelo: mod, serie: '', obs: '', ativo: true });
    });
    db.seq['cod-EQP'] = 8;
    // categorias de despesa de uso coletivo (padrão de uma empresa organizada)
    root.V.criarCategoriasPadrao();
    const catD = d => S.all('categoriasDespesa').find(c => c.descricao.indexOf(d) === 0);

    const ent = (p, q, custo, dias) => add('movimentos', { data: U.addDays(U.today(), -dias), produtoId: p.id, tipo: 'entrada', qtd: q, custoUnit: custo, doc: 'Saldo inicial (exemplo)', origem: 'Inventário', obs: '' });
    ent(prods[0], 2, 1890, 60); ent(prods[1], 35, 38.5, 60); ent(prods[2], 420, 22.9, 60);
    ent(prods[4], 12, 17.4, 40); ent(prods[5], 14, 139, 40); ent(prods[7], 8, 612, 50); ent(prods[8], 240, 1.35, 50); ent(prods[9], 300, 1.9, 90); ent(prods[6], 2, 4350, 90);
    add('movimentos', { data: U.addDays(U.today(), -5), produtoId: prods[2].id, tipo: 'saida', qtd: 80, custoUnit: 22.9, doc: 'RM 0412', origem: 'Atendimento pelo estoque', centroCustoId: cc['CC-500'].id, equipamentoId: eq['PC-01'].id, categoria: 'Lubrificantes', obs: 'Troca de óleo' });
    // histórico de consumo dos últimos meses (exemplo para o relatório de custos)
    const consumo = (dias, p, q, custo, eqc, ccc, origem, forn, catDesc) => (/compra/.test(origem) ? add('movimentos', {
      data: U.addDays(U.today(), -dias), produtoId: p.id, tipo: 'entrada', qtd: q, custoUnit: custo, doc: 'Exemplo', origem: 'Recebimento de pedido',
      centroCustoId: cc[ccc].id, obs: 'Aplicação direta' }) : null, add('movimentos', {
      data: U.addDays(U.today(), -dias), produtoId: p.id, tipo: 'saida', qtd: q, custoUnit: custo, doc: 'Exemplo', origem: origem,
      centroCustoId: cc[ccc].id, equipamentoId: eqc ? eq[eqc].id : '', categoriaDespesaId: catDesc ? catD(catDesc).id : '', fornecedorId: forn ? forn.id : '', categoria: p.categoria, obs: ''
    }));
    consumo(80, prods[0], 2, 1810, 'BM-01', 'CC-200', 'Aplicação direta (compra)', f[0]);
    consumo(75, prods[1], 15, 38.5, 'BM-01', 'CC-200', 'Atendimento pelo estoque');
    consumo(70, prods[6], 1, 4350, 'PV-01', 'CC-300', 'Aplicação direta (compra)', f[2]);
    consumo(62, prods[7], 6, 598, 'EX-01', 'CC-100', 'Aplicação direta (compra)', f[2]);
    consumo(55, prods[2], 120, 22.9, 'CF-03', 'CC-500', 'Atendimento pelo estoque');
    consumo(48, prods[3], 30, 395, 'TC-04', 'CC-300', 'Aplicação direta (compra)', f[1]);
    consumo(40, prods[1], 10, 38.5, 'BC-02', 'CC-300', 'Atendimento pelo estoque');
    consumo(33, prods[7], 4, 612, 'EX-01', 'CC-100', 'Atendimento pelo estoque');
    consumo(26, prods[2], 60, 22.9, 'PC-01', 'CC-500', 'Atendimento pelo estoque');
    consumo(20, prods[0], 1, 1845, 'BC-02', 'CC-300', 'Aplicação direta (compra)', f[0]);
    consumo(15, prods[4], 20, 17.4, null, 'CC-600', 'Atendimento pelo estoque', null, 'EPI');
    consumo(12, prods[9], 80, 1.9, null, 'CC-200', 'Atendimento pelo estoque', null, 'EPI');
    consumo(9, prods[8], 60, 1.35, null, 'CC-400', 'Atendimento pelo estoque', null, 'Material de consumo de oficina');
    consumo(6, prods[5], 4, 139, null, 'CC-100', 'Atendimento pelo estoque', null, 'EPI');

    // Solicitação 1 — manutenção do britador, já em cotação com três propostas
    const s1 = D.novaSolicitacao();
    Object.assign(s1, {
      solicitanteId: sol1.id, compradorId: comp1.id, centroCustoId: cc['CC-200'].id, destino: 'ambas', criadoPor: uCarlos.id, criadoPorNome: uCarlos.nome, equipamentoId: eq['BM-01'].id,
      aplicacao: 'Britador de mandíbulas — troca dos mancais', prioridade: 'urgente', origemEntrada: 'voz',
      necessidade: U.addDays(U.today(), 5), obs: 'Parada programada para a próxima semana.',
      itens: [
        { id: U.uid(), produtoId: prods[0].id, descricao: prods[0].descricao, qtd: 4, unidade: 'UN', marca: 'SKF', obs: '', destino: 'aplicacao', categoria: 'Rolamentos' },
        { id: U.uid(), produtoId: prods[1].id, descricao: prods[1].descricao, qtd: 20, unidade: 'KG', marca: '', obs: '', destino: 'estoque', categoria: 'Lubrificantes' },
        { id: U.uid(), produtoId: prods[8].id, descricao: prods[8].descricao, qtd: 200, unidade: 'PC', marca: '', obs: '', destino: 'estoque', categoria: 'Fixação' }
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
      solicitanteId: sol2.id, compradorId: comp1.id, centroCustoId: cc['CC-600'].id, destino: 'estoque', criadoPor: uAna.id, criadoPorNome: uAna.nome,
      aplicacao: 'Reposição do almoxarifado de EPI', prioridade: 'normal', origemEntrada: 'digitalizada',
      itens: [
        { id: U.uid(), produtoId: prods[4].id, descricao: prods[4].descricao, qtd: 60, unidade: 'PAR', marca: '', obs: '', destino: 'estoque', categoria: 'EPI' },
        { id: U.uid(), produtoId: prods[5].id, descricao: prods[5].descricao, qtd: 12, unidade: 'PAR', marca: 'Marluvas', obs: 'Números 40 a 44', destino: 'estoque', categoria: 'EPI' },
        { id: U.uid(), produtoId: prods[9].id, descricao: prods[9].descricao, qtd: 200, unidade: 'PAR', marca: '3M', obs: '', destino: 'estoque', categoria: 'EPI' }
      ]
    });
    D.salvarSolicitacao(s2);

    // Solicitação 3 — correia, cotação finalizada e pedido emitido
    const s3 = D.novaSolicitacao();
    Object.assign(s3, {
      solicitanteId: sol3.id, compradorId: comp1.id, centroCustoId: cc['CC-300'].id, destino: 'aplicacao', criadoPor: uRob.id, criadoPorNome: uRob.nome, equipamentoId: eq['TC-04'].id,
      aplicacao: 'Transportador TC-04 da peneira', prioridade: 'alta', origemEntrada: 'digitada', data: U.addDays(U.today(), -9),
      itens: [{ id: U.uid(), produtoId: prods[3].id, descricao: prods[3].descricao, qtd: 60, unidade: 'M', marca: '', obs: 'Com emenda vulcanizada', destino: 'aplicacao', categoria: 'Correias' }]
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

    // Solicitação 4 — aplicação direta com saldo em estoque (mostra a verificação de estoque ao cotar)
    const s4 = D.novaSolicitacao();
    Object.assign(s4, {
      solicitanteId: sol1.id, compradorId: comp1.id, centroCustoId: cc['CC-400'].id, destino: 'aplicacao', equipamentoId: eq['GR-01'].id,
      aplicacao: 'Revisão do gerador', prioridade: 'normal', origemEntrada: 'digitada', criadoPor: uCarlos.id, criadoPorNome: uCarlos.nome,
      itens: [
        { id: U.uid(), produtoId: prods[8].id, descricao: prods[8].descricao, qtd: 40, unidade: 'PC', marca: '', obs: '', destino: 'aplicacao', categoria: 'Fixação' },
        { id: U.uid(), produtoId: prods[2].id, descricao: prods[2].descricao, qtd: 60, unidade: 'L', marca: '', obs: '', destino: 'aplicacao', categoria: 'Lubrificantes' },
        { id: U.uid(), produtoId: prods[6].id, descricao: prods[6].descricao, qtd: 1, unidade: 'UN', marca: '', obs: '', destino: 'aplicacao', categoria: 'Peneiramento' }
      ]
    });
    D.salvarSolicitacao(s4);
    // Solicitação 5 — despesa de uso coletivo (EPI), já atendida pelo estoque e aguardando o aceite do Carlos
    const s5 = D.novaSolicitacao();
    Object.assign(s5, {
      solicitanteId: sol1.id, compradorId: comp1.id, centroCustoId: cc['CC-200'].id, destino: 'aplicacao', categoriaDespesaId: catD('EPI').id,
      aplicacao: 'Equipe da britagem', prioridade: 'normal', origemEntrada: 'digitada', criadoPor: uCarlos.id, criadoPorNome: uCarlos.nome,
      itens: [{ id: U.uid(), produtoId: prods[9].id, descricao: prods[9].descricao, qtd: 20, unidade: 'PAR', marca: '', obs: '', destino: 'aplicacao', categoria: 'EPI' }]
    });
    D.salvarSolicitacao(s5);
    D.atenderPeloEstoque([{ solId: s5.id, itemId: s5.itens[0].id, qtd: 20 }]);
    D.criarCotacao([s5.id], comp1.id, {});

    db.log.unshift({ data: U.nowIso(), texto: 'Dados de exemplo carregados' });
    void uJul;
    if (root.Auth) root.Auth.perm = permAntes || R.permissoes(null);
    S.save();
    db.auditoria.length = 0; // a carga dos exemplos não entra nos registros
    S.saveLocal();
  };

  root.Seed = Seed;
})(window);
