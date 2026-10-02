/* Cadastros: fornecedores, produtos (com marcas e histórico de preços), solicitantes, compradores, centros de custo */
(function (root) {
  'use strict';
  const { U, S, D, UI, C, R, Auth, Cloud } = root;

  function podeEditar(key) {
    if (key === 'fornecedores' || key === 'produtos' || key === 'equipamentos' || key === 'categoriasDespesa') return Auth.perm.editarProdutosFornecedores;
    return Auth.perm.editarCadastrosBase;
  }
  /* Com o banco central, só confirma depois que o Supabase aceitou a gravação */
  async function confirmarGravacao(msgOk) {
    if (!Cloud.ativo()) { UI.toast(msgOk, 'ok'); return true; }
    try { await Cloud.gravarAgora(); UI.toast(msgOk + ' — gravado no banco central', 'ok'); return true; }
    catch (err) { UI.toast('Não foi gravado no banco: ' + err.message, 'bad'); return false; }
  }
  const V = root.V = root.V || {};

  const DEF = {
    fornecedores: {
      col: 'fornecedores', titulo: 'Fornecedores', um: 'fornecedor', prefixo: 'FOR',
      campos: [
        ['codigo', 'Código', 's2'], ['razao', 'Razão social', 's6', true], ['fantasia', 'Nome fantasia', 's4'],
        ['cnpj', 'CNPJ / CPF', 's3'], ['contato', 'Contato', 's3'], ['email', 'E-mail', 's3', false, 'email'], ['telefone', 'Telefone', 's3'],
        ['whatsapp', 'WhatsApp', 's3'], ['cidade', 'Cidade', 's3'], ['uf', 'UF', 's2'], ['categorias', 'Categorias fornecidas', 's4', false, 'text', 'Ex.: EPI, rolamentos, lubrificantes'],
        ['obs', 'Observações', 's12', false, 'textarea']
      ],
      colunas: [['codigo', 'Código'], ['razao', 'Razão social', f => '<b>' + U.esc(f.fantasia || f.razao) + '</b>' + (f.fantasia ? '<br><span class="small muted">' + U.esc(f.razao) + '</span>' : '')],
        ['cnpj', 'CNPJ'], ['contato', 'Contato', f => U.esc(f.contato || '') + (root.IM.contatoTrocado(f) ? ' <span class="tag urg" title="O e-mail foi gravado no campo contato">corrigir</span>' : '')],
        ['telefone', 'Telefone', f => U.esc([f.telefone, f.whatsapp && f.whatsapp !== f.telefone ? 'WhatsApp ' + f.whatsapp : ''].filter(Boolean).join(' · '))],
        ['email', 'E-mail'],
        ['categorias', 'Categorias'], ['origem', 'Origem', f => f.origem === 'proposta' ? '<span class="tag est">Capturado de proposta</span>' : ''],
        ['compras', 'Comprado', f => { const t = U.sum(S.all('pedidos').filter(p => p.fornecedorId === f.id && p.status !== 'cancelado'), p => p.total); return t ? U.money(t) : '—'; }, 'n']]
    },
    produtos: {
      col: 'produtos', titulo: 'Produtos e marcas', um: 'produto', prefixo: 'MAT',
      campos: [
        ['codigo', 'Código', 's2'], ['descricao', 'Descrição', 's6', true], ['unidade', 'Unidade', 's2', false, 'unit'], ['categoria', 'Categoria', 's2', true, 'cat'],
        ['marcas', 'Marcas aceitas (separe por vírgula)', 's6', false, 'marcas'], ['ncm', 'NCM', 's2'], ['estoqueMin', 'Estoque mínimo', 's2', false, 'num'], ['estoqueMax', 'Estoque máximo', 's2', false, 'num'],
        ['obs', 'Especificação técnica / observações', 's12', false, 'textarea']
      ],
      colunas: [['codigo', 'Código'], ['descricao', 'Descrição', p => '<b>' + U.esc(p.descricao) + '</b>' + (p.origem && p.origem !== 'cadastro' ? '<br><span class="small muted">capturado de ' + U.esc(p.origem) + '</span>' : '')],
        ['unidade', 'Unid'], ['categoria', 'Categoria'], ['marcas', 'Marcas', p => (p.marcas || []).map(m => '<span class="tag">' + U.esc(m) + '</span>').join(' ')],
        ['ultimo', 'Último preço', p => { const v = Auth.perm.comprador ? D.ultimoPreco(p) : 0; return v ? U.money(v) : '—'; }, 'n'],
        ['saldo', 'Saldo', p => U.num(D.saldo(p.id)), 'n']]
    },
    solicitantes: {
      col: 'solicitantes', titulo: 'Solicitantes', um: 'solicitante', prefixo: 'SOL',
      campos: [['codigo', 'Código', 's2'], ['nome', 'Nome', 's6', true], ['setor', 'Setor', 's4'], ['email', 'E-mail', 's6', false, 'email'], ['telefone', 'Telefone', 's6']],
      colunas: [['codigo', 'Código'], ['nome', 'Nome'], ['setor', 'Setor'], ['email', 'E-mail'], ['n', 'Solicitações', x => S.all('solicitacoes').filter(s => s.solicitanteId === x.id).length, 'n']]
    },
    compradores: {
      col: 'compradores', titulo: 'Compradores', um: 'comprador', prefixo: 'COMP',
      campos: [['codigo', 'Código', 's2'], ['nome', 'Nome', 's6', true], ['email', 'E-mail', 's4', false, 'email'], ['telefone', 'Telefone', 's4'],
        ['niveis', 'Alçada de aprovação (níveis do autorizador)', 's8', false, 'niveis']],
      colunas: [['codigo', 'Código'], ['nome', 'Nome'], ['email', 'E-mail'], ['telefone', 'Telefone'],
        ['niveis', 'Alçada', x => (x.niveis && x.niveis.length ? x.niveis.map(n => '<span class="tag">Nível ' + n + '</span>').join(' ') + '<br><span class="small muted">aprova até ' + U.esc(limiteAprovacao(x.niveis)) + '</span>' : '<span class="muted small">não aprova</span>')],
        ['n', 'Cotações', x => S.all('cotacoes').filter(c => c.compradorId === x.id).length, 'n']]
    },
    centros: {
      col: 'centrosCusto', titulo: 'Centros de custo', um: 'centro de custo', prefixo: 'CC',
      campos: [['codigo', 'Código', 's3', true], ['descricao', 'Descrição', 's9', true]],
      colunas: [['codigo', 'Código'], ['descricao', 'Descrição'], ['g', 'Comprado', x => { const t = U.sum(S.all('pedidos').filter(p => p.status !== 'cancelado'), p => U.sum(p.itens.filter(i => i.centroCustoId === x.id), i => i.total)); return t ? U.money(t) : '—'; }, 'n']]
    }
  };
  DEF.equipamentos = {
    col: 'equipamentos', titulo: 'Equipamentos', um: 'equipamento', prefixo: 'EQP',
    campos: [
      ['codigo', 'Código / TAG / frota', 's3'], ['descricao', 'Descrição', 's5', true], ['tipo', 'Tipo', 's4', false, 'tipoeq'],
      ['centroCustoId', 'Centro de custo', 's4', true, 'cc'], ['fabricante', 'Fabricante', 's4'], ['modelo', 'Modelo', 's4'],
      ['serie', 'Nº de série / placa / chassi', 's4'], ['obs', 'Observações', 's8', false, 'textarea']
    ],
    colunas: [['codigo', 'Código'], ['descricao', 'Equipamento', e => '<b>' + U.esc(e.descricao) + '</b>' + (e.tipo ? '<br><span class="small muted">' + U.esc(e.tipo) + '</span>' : '') + (e.ativo === false ? ' <span class="tag urg">inativo</span>' : '')],
      ['centroCustoId', 'Centro de custo', e => U.esc(D.centro(e.centroCustoId))],
      ['fabricante', 'Fabricante / modelo', e => U.esc([e.fabricante, e.modelo].filter(Boolean).join(' · '))], ['serie', 'Série / placa'],
      ['custo', 'Custo acumulado', e => { if (!Auth.perm.verTotalizadores) return '—'; const t = D.custoEquipamento(e.id); return t ? '<a href="#/custos" data-eq="' + e.id + '">' + U.money(t) + '</a>' : '—'; }, 'n']]
  };
  DEF.categoriasDespesa = {
    col: 'categoriasDespesa', titulo: 'Categorias de despesa (uso e consumo coletivo)', um: 'categoria', prefixo: 'DSP',
    campos: [
      ['codigo', 'Código', 's2'], ['descricao', 'Categoria', 's6', true], ['grupo', 'Grupo', 's4', false, 'grupodesp'],
      ['centros', 'Centros de custo que usam esta categoria (nenhum marcado = todos)', 's12', false, 'ccmulti'],
      ['obs', 'O que entra nesta categoria', 's12', false, 'textarea']
    ],
    colunas: [['codigo', 'Código'], ['descricao', 'Categoria', c => '<b>' + U.esc(c.descricao) + '</b>' + (c.obs ? '<br><span class="small muted">' + U.esc(c.obs) + '</span>' : '') + (c.ativo === false ? ' <span class="tag urg">inativa</span>' : '')],
      ['grupo', 'Grupo'], ['centros', 'Centros de custo', c => (c.centros || []).length ? c.centros.map(id => '<span class="tag">' + U.esc((S.find('centrosCusto', id) || {}).codigo || '?') + '</span>').join(' ') : '<span class="muted small">todos</span>'],
      ['custo', 'Custo acumulado', c => { if (!Auth.perm.verTotalizadores) return '—'; const t = D.custoCategoriaDespesa(c.id); return t ? U.money(t) : '—'; }, 'n']]
  };
  DEF.centrosCusto = DEF.centros;

  /* Categorias usuais de despesas de uso e consumo coletivo (podem ser alteradas e ampliadas) */
  V.CATEGORIAS_DESPESA_PADRAO = [
    ['Segurança e saúde', 'EPI — equipamentos de proteção individual', 'Luvas, botinas, capacetes, óculos, protetores auriculares, respiradores'],
    ['Segurança e saúde', 'Sinalização e proteção coletiva (EPC)', 'Placas, cones, fitas zebradas, extintores, guarda-corpos'],
    ['Segurança e saúde', 'Saúde ocupacional e primeiros socorros', 'Kits de primeiros socorros, medicamentos de enfermaria, exames'],
    ['Pessoal', 'Uniformes e vestuário', 'Uniformes, jaquetas, capas de chuva'],
    ['Pessoal', 'Treinamento e capacitação', 'Cursos, NRs, materiais didáticos'],
    ['Facilities', 'Limpeza e higiene', 'Produtos de limpeza, papel higiênico, sabonete, sacos de lixo'],
    ['Facilities', 'Copa e cozinha', 'Café, açúcar, água mineral, descartáveis, utensílios'],
    ['Facilities', 'Manutenção predial e civil', 'Material elétrico e hidráulico predial, tintas, cimento, ferragens'],
    ['Facilities', 'Conservação de áreas e jardinagem', 'Roçagem, capina, adubos, ferramentas de jardim'],
    ['Administrativo', 'Material de escritório e papelaria', 'Papel, canetas, toner, pastas, envelopes'],
    ['Administrativo', 'Informática e telecomunicações', 'Periféricos, cabos, rádios, celulares, licenças'],
    ['Administrativo', 'Correios, cartório e despesas gerais', 'Postagens, autenticações, taxas'],
    ['Operacional', 'Ferramentas de uso comum', 'Ferramentas manuais e elétricas da oficina e das frentes de trabalho'],
    ['Operacional', 'Material de consumo de oficina', 'Estopa, abrasivos, discos de corte, fixadores, colas, vedantes'],
    ['Operacional', 'Gases industriais e consumíveis de solda', 'Oxigênio, acetileno, eletrodos, arames'],
    ['Operacional', 'Combustíveis e lubrificantes de uso geral', 'Diesel e lubrificantes não apropriados a um equipamento específico'],
    ['Operacional', 'Explosivos e acessórios de desmonte', 'Explosivos, espoletas, cordel, acessórios de detonação'],
    ['Operacional', 'Laboratório e controle de qualidade', 'Peneiras de ensaio, reagentes, material de amostragem'],
    ['Meio ambiente', 'Controle ambiental', 'Aspersão e controle de poeira, efluentes, coleta de resíduos'],
    ['Logística', 'Fretes e transporte de materiais', 'Fretes de compras e transferências']
  ];
  V.criarCategoriasPadrao = function () {
    let n = 0;
    V.CATEGORIAS_DESPESA_PADRAO.forEach(([grupo, desc, obs]) => {
      if (S.all('categoriasDespesa').some(c => U.norm(c.descricao) === U.norm(desc))) return;
      S.upsert('categoriasDespesa', { codigo: S.nextCode('DSP', 'categoriasDespesa'), descricao: desc, grupo: grupo, obs: obs, centros: [], ativo: true, origem: 'padrão' }, true);
      n++;
    });
    return n;
  };

  const busca = {};

  /* Até quanto um autorizador com estes níveis pode aprovar */
  function limiteAprovacao(niveis) {
    const al = R.ordenarAlcadas(S.db.alcadas);
    let max = 0;
    for (const a of al) { if (niveis.indexOf(a.nivel) < 0) break; max = a.nivel; }
    if (!max) return 'nenhum valor (falta o nível 1)';
    const a = al.find(x => x.nivel === max);
    return a.limite === null || a.limite === undefined ? 'qualquer valor' : U.money(a.limite);
  }

  V.cadastro = function (key) {
    const d = DEF[key];
    UI.setHeader(d.titulo, 'Cadastros',
      ((key === 'fornecedores' || key === 'produtos' || key === 'equipamentos') && podeEditar(key) ? '<button class="btn" id="imp">' + UI.icon('upload') + 'Importar planilha</button>' : '') +
      '<button class="btn" id="exp">' + UI.icon('download') + 'Exportar</button>' +
      (podeEditar(key) ? '<button class="btn pri" id="novo">' + UI.icon('plus') + 'Novo ' + d.um + '</button>' : ''));
    const v = UI.render('<div class="card"><div class="hd"><div class="toolbar"><input type="search" id="q" placeholder="Buscar" value="' + U.esc(busca[key] || '') + '"></div><div class="acts muted small" id="cnt"></div></div><div class="bd flush"><div class="tbl-wrap" id="tb"></div></div></div>' +
      (key === 'produtos' ? '<p class="small muted" style="margin:0">Produtos digitados em solicitações ou recebidos em propostas entram aqui automaticamente, com marcas ofertadas e histórico de preços.</p>' : '') +
      (key === 'fornecedores' ? '<p class="small muted" style="margin:0">Fornecedores identificados em propostas importadas (CNPJ, e-mail, telefone) são cadastrados automaticamente.</p>' : ''));
    function draw() {
      const q = U.norm(busca[key] || '');
      const list = S.all(d.col).filter(x => !q || U.norm(Object.values(x).filter(v => typeof v === 'string').join(' ')).indexOf(q) > -1)
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
      UI.$('#cnt').textContent = list.length + ' registro(s)';
      UI.$('#tb').innerHTML = list.length ? '<table class="tbl"><thead><tr>' + d.colunas.map(c => '<th class="' + (c[3] || '') + '">' + c[1] + '</th>').join('') + '<th></th></tr></thead><tbody>' +
        list.map(x => '<tr class="click" data-id="' + x.id + '">' + d.colunas.map(c => '<td class="' + (c[3] || '') + '">' + (c[2] ? c[2](x) : U.esc(x[c[0]] || '')) + '</td>').join('') +
          '<td class="act">' + (!podeEditar(key) ? '' : '<button class="btn icon ghost" data-ed="' + x.id + '" title="Editar" aria-label="Editar">' + UI.icon('edit') + '</button><button class="btn icon ghost danger" data-rm="' + x.id + '" title="Excluir" aria-label="Excluir">' + UI.icon('trash') + '</button>') + '</td></tr>').join('') +
        '</tbody></table>' : UI.empty('Nenhum registro', 'Cadastre o primeiro ' + d.um + '.');
    }
    draw();
    UI.$('#q').oninput = U.debounce(e => { busca[key] = e.target.value; draw(); }, 200);
    if (UI.$('#novo')) UI.$('#novo').onclick = () => form(key, null, () => V.cadastro(key));
    if (key === 'categoriasDespesa' && podeEditar(key)) {
      const faltam = V.CATEGORIAS_DESPESA_PADRAO.filter(([, d]) => !S.all('categoriasDespesa').some(c => U.norm(c.descricao) === U.norm(d))).length;
      if (faltam) {
        v.insertAdjacentHTML('afterbegin', '<div class="note row">' + faltam + ' categoria(s) padrão de uma empresa organizada ainda não cadastradas (EPI, limpeza, escritório, ferramentas de uso comum, explosivos…). <button class="btn sm" id="cat-pad">Incluir categorias padrão</button></div>');
        UI.$('#cat-pad').onclick = async () => { const n = V.criarCategoriasPadrao(); S.save(); if (await confirmarGravacao(n + ' categoria(s) incluída(s)')) V.cadastro(key); };
      }
    }
    const trocados = key === 'fornecedores' && podeEditar(key) ? S.all('fornecedores').filter(root.IM.contatoTrocado) : [];
    if (trocados.length) {
      v.insertAdjacentHTML('afterbegin', '<div class="note warn row">' + trocados.length + ' fornecedor(es) com o e-mail gravado no campo "Contato" (importação anterior). <button class="btn sm" id="fix-cont">Mover para o campo e-mail</button></div>');
      UI.$('#fix-cont').onclick = async () => {
        trocados.forEach(f => root.IM.corrigirContato(f));
        S.save();
        if (await confirmarGravacao(trocados.length + ' fornecedor(es) corrigidos')) V.cadastro(key);
      };
    }
    const avisoPerm = podeEditar(key) ? '' : (key === 'fornecedores' || key === 'produtos' || key === 'equipamentos' ? 'Consulta: somente compradores autorizados e administradores alteram este cadastro.' : 'Consulta: somente administradores alteram este cadastro.');
    if (avisoPerm) v.insertAdjacentHTML('afterbegin', '<div class="note small">' + avisoPerm + '</div>');
    UI.$('#tb').addEventListener('click', async e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const x = S.find(d.col, rm.dataset.rm);
        const usos = D.usos(d.col, x.id);
        if (usos.length) {
          if (key === 'fornecedores' || key === 'produtos') {
            if (await UI.confirm('Este ' + d.um + ' está em uso (' + usos.slice(0, 5).join(', ') + (usos.length > 5 ? '…' : '') + ') e não pode ser excluído sem perder o histórico. Deseja inativá-lo?', 'Inativar', false)) {
              x.ativo = false; S.save(); UI.toast('Inativado', 'ok'); draw();
            }
          } else UI.toast('Não é possível excluir: usado em ' + usos.slice(0, 5).join(', '), 'bad');
          return;
        }
        if (!(await UI.confirm('Excluir ' + d.um + ' "' + (x.nome || x.razao || x.descricao) + '"?', 'Excluir'))) return;
        S.remove(d.col, x.id);
        UI.toast('Excluído', 'ok');
        draw();
        return;
      }
      const tr = e.target.closest('[data-id]');
      if (tr) {
        if (!podeEditar(key) && key !== 'produtos' && key !== 'fornecedores') return;
        if (e.target.closest('[data-eq]')) { e.preventDefault(); V.custosFiltro = { equipamentoId: e.target.closest('[data-eq]').dataset.eq }; location.hash = '#/custos'; return; }
        if (key === 'produtos' && !e.target.closest('[data-ed]')) return produtoDetalhe(S.find(d.col, tr.dataset.id), () => V.cadastro(key));
        if (key === 'fornecedores' && !e.target.closest('[data-ed]')) return fornecedorDetalhe(S.find(d.col, tr.dataset.id), () => V.cadastro(key));
        form(key, S.find(d.col, tr.dataset.id), () => V.cadastro(key));
      }
    });
    UI.$('#exp').onclick = () => {
      const rows = [d.campos.map(c => c[1])];
      S.all(d.col).forEach(x => rows.push(d.campos.map(c => Array.isArray(x[c[0]]) ? x[c[0]].join(', ') : (x[c[0]] === undefined ? '' : x[c[0]]))));
      C.writeXlsx(key + '.xlsx', { [d.titulo]: rows }).catch(err => UI.toast(err.message, 'bad'));
    };
    if (UI.$('#imp')) UI.$('#imp').onclick = () => importar(key);
  };

  function form(key, obj, done) {
    const d = DEF[key];
    const x = obj ? JSON.parse(JSON.stringify(obj)) : { ativo: true, origem: 'cadastro' };
    if (!obj) x.codigo = S.nextCode(d.prefixo, d.col);
    const field = c => {
      const [k, label, span, req, type, ph] = c;
      let val = x[k];
      if (type === 'marcas') val = (val || []).join(', ');
      const id = 'cf-' + k;
      let inp;
      if (type === 'textarea') inp = '<textarea id="' + id + '" rows="2">' + U.esc(val || '') + '</textarea>';
      else if (type === 'unit') inp = '<select id="' + id + '">' + UI.unitOptions(val) + '</select>';
      else if (type === 'cat') {
        const cats = Array.from(new Set(S.all('produtos').map(p => p.categoria).filter(Boolean))).sort();
        inp = '<input id="' + id + '" list="dl-cf-cat" value="' + U.esc(val || '') + '" placeholder="Escolha ou digite"><datalist id="dl-cf-cat">' + cats.map(c => '<option value="' + U.esc(c) + '">').join('') + '</datalist>';
      } else if (type === 'ccmulti') {
        inp = '<div class="chips-sel" id="' + id + '">' + S.all('centrosCusto').map(c => '<label class="row small"><input type="checkbox" value="' + c.id + '"' + ((val || []).indexOf(c.id) > -1 ? ' checked' : '') + '> ' + U.esc(c.codigo + ' · ' + c.descricao) + '</label>').join('') + '</div>';
      } else if (type === 'grupodesp') {
        const grupos = Array.from(new Set(V.CATEGORIAS_DESPESA_PADRAO.map(x => x[0]).concat(S.all('categoriasDespesa').map(c => c.grupo).filter(Boolean)))).sort();
        inp = '<input id="' + id + '" list="dl-cf-grupo" value="' + U.esc(val || '') + '"><datalist id="dl-cf-grupo">' + grupos.map(c => '<option value="' + U.esc(c) + '">').join('') + '</datalist>';
      } else if (type === 'cc') {
        inp = '<select id="' + id + '">' + UI.options(S.all('centrosCusto'), val, c => c.codigo + ' · ' + c.descricao, 'Selecione…') + '</select>';
      } else if (type === 'tipoeq') {
        const tipos = Array.from(new Set(['Britador', 'Peneira', 'Transportador de correia', 'Escavadeira', 'Pá carregadeira', 'Caminhão', 'Gerador', 'Bomba', 'Compressor', 'Veículo leve'].concat(S.all('equipamentos').map(e => e.tipo).filter(Boolean)))).sort();
        inp = '<input id="' + id + '" list="dl-cf-tipo" value="' + U.esc(val || '') + '"><datalist id="dl-cf-tipo">' + tipos.map(c => '<option value="' + U.esc(c) + '">').join('') + '</datalist>';
      } else if (type === 'niveis') {
        const al = R.ordenarAlcadas(S.db.alcadas);
        inp = al.length ? '<div class="row" id="' + id + '">' + R.descreverAlcada(al).map(a => '<label class="row small"><input type="checkbox" value="' + a.nivel + '"' + ((val || []).map(Number).indexOf(a.nivel) > -1 ? ' checked' : '') + '> Nível ' + a.nivel + ' <span class="muted">(' + a.faixa + ')</span></label>').join('') + '</div><span class="small muted">Para aprovar no nível N o autorizador precisa ter todos os níveis de 1 até N.</span>'
          : '<div class="small muted" id="' + id + '">Nenhuma alçada configurada (Cadastros → Alçadas).</div>';
      }
      else inp = '<input id="' + id + '" type="' + (type === 'email' ? 'email' : 'text') + '"' + (type === 'num' ? ' class="n" inputmode="decimal"' : '') + ' value="' + U.esc(val === undefined ? '' : (type === 'num' ? U.num(val) : val)) + '"' + (ph ? ' placeholder="' + U.esc(ph) + '"' : '') + '>';
      return '<div class="f ' + span + '"><label for="' + id + '">' + label + (req ? ' *' : '') + '</label>' + inp + '</div>';
    };
    UI.modal({
      title: (obj ? 'Editar ' : 'Novo ') + d.um, size: key === 'fornecedores' || key === 'produtos' ? 'wide' : '',
      body: '<div class="form">' + d.campos.map(field).join('') + '</div>' +
        (obj && (key === 'fornecedores' || key === 'produtos' || key === 'equipamentos' || key === 'categoriasDespesa') ? '<label class="row small"><input type="checkbox" id="cf-ativo"' + (x.ativo !== false ? ' checked' : '') + '> Ativo</label>' : ''),
      buttons: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'pri', icon: 'check', action: m => {
        for (const c of d.campos) {
          const el = UI.$('#cf-' + c[0], m.el);
          if (c[4] === 'niveis') { x.niveis = UI.$$('input[type=checkbox]:checked', el).map(i => Number(i.value)); continue; }
          if (c[4] === 'ccmulti') { x[c[0]] = UI.$$('input[type=checkbox]:checked', el).map(i => i.value); continue; }
          let v = el.value.trim();
          if (c[4] === 'num') v = U.parseNum(v);
          if (c[4] === 'marcas') v = v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
          if (c[3] && !v) { UI.toast('Preencha: ' + c[1], 'bad'); el.focus(); return false; }
          x[c[0]] = v;
        }
        if (x.codigo && S.all(d.col).some(o => o.id !== x.id && String(o.codigo).toLowerCase() === String(x.codigo).toLowerCase())) { UI.toast('Já existe um cadastro com o código ' + x.codigo, 'bad'); return false; }
        if (key === 'fornecedores' && x.cnpj) {
          const dig = U.onlyDigits(x.cnpj);
          if (dig.length === 14 && !U.validCnpj(dig)) { UI.toast('CNPJ inválido — confira os dígitos', 'bad'); return false; }
          x.cnpj = U.fmtCnpj(dig);
          if (S.all('fornecedores').some(o => o.id !== x.id && U.onlyDigits(o.cnpj) === dig)) { UI.toast('Já existe fornecedor com este CNPJ', 'bad'); return false; }
        }
        const at = UI.$('#cf-ativo', m.el);
        if (at) x.ativo = at.checked;
        S.upsert(d.col, x);
        confirmarGravacao((obj ? 'Alterado: ' : 'Cadastrado: ') + (x.nome || x.razao || x.descricao)).then(ok => { if (ok && done) done(x); });
      } }]
    });
  }

  V.cadQuickAdd = function (key, cb) { form(key, null, cb); };

  function produtoDetalhe(p, done) {
    const hist = (p.historicoPrecos || []).slice().reverse();
    const cots = (p.cotacoesRecebidas || []).slice().reverse();
    const precos = hist.map(h => h.preco);
    UI.modal({
      title: p.codigo + ' — ' + p.descricao, size: 'wide',
      body: '<dl class="kv"><dt>Unidade</dt><dd>' + U.esc(p.unidade) + '</dd><dt>Categoria</dt><dd>' + U.esc(p.categoria || '—') + '</dd><dt>Marcas</dt><dd>' + ((p.marcas || []).map(m => '<span class="tag">' + U.esc(m) + '</span>').join(' ') || '—') + '</dd>' +
        '<dt>Saldo em estoque</dt><dd>' + U.num(D.saldo(p.id)) + ' ' + U.esc(p.unidade) + ' (mínimo ' + U.num(p.estoqueMin || 0) + ')</dd>' +
        (precos.length && Auth.perm.comprador ? '<dt>Preço pago</dt><dd>último ' + U.money(precos[0]) + ' · menor ' + U.money(Math.min.apply(null, precos)) + ' · maior ' + U.money(Math.max.apply(null, precos)) + '</dd>' : '') + '</dl>' +
        (!Auth.perm.comprador ? '' : '<h3>Histórico de compras</h3>' + (hist.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Fornecedor</th><th>Marca</th><th class="n">Preço</th><th>Pedido</th></tr></thead><tbody>' +
          hist.map(h => '<tr><td>' + U.date(h.data) + '</td><td>' + U.esc(D.fornecedorNome(h.fornecedorId)) + '</td><td>' + U.esc(h.marca || '') + '</td><td class="n">' + U.money(h.preco) + '</td><td>' + U.esc(h.pedido || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Ainda não comprado.</p>') +
        '<h3>Preços recebidos em cotações</h3>' + (cots.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Fornecedor</th><th>Marca</th><th class="n">Preço</th><th>Cotação</th></tr></thead><tbody>' +
          cots.map(h => '<tr><td>' + U.date(h.data) + '</td><td>' + U.esc(D.fornecedorNome(h.fornecedorId)) + '</td><td>' + U.esc(h.marca || '') + '</td><td class="n">' + U.money(h.preco) + '</td><td>' + U.esc(h.cotacao || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Nenhuma cotação finalizada com este produto.</p>')),
      buttons: [{ label: 'Fechar' }].concat(podeEditar('produtos') ? [{ label: 'Editar', cls: 'pri', icon: 'edit', action: () => { setTimeout(() => form('produtos', p, done), 0); } }] : [])
    });
  }

  function fornecedorDetalhe(f, done) {
    const peds = S.all('pedidos').filter(p => p.fornecedorId === f.id);
    const cots = S.all('cotacoes').filter(c => c.propostas.some(p => p.fornecedorId === f.id));
    const venc = cots.filter(c => c.status === 'finalizada' && Object.values(c.selecao).some(pid => (c.propostas.find(p => p.id === pid) || {}).fornecedorId === f.id));
    UI.modal({
      title: f.fantasia || f.razao, size: 'wide',
      body: '<dl class="kv"><dt>Razão social</dt><dd>' + U.esc(f.razao) + '</dd><dt>CNPJ</dt><dd>' + U.esc(f.cnpj || '—') + (f.cnpj && U.onlyDigits(f.cnpj).length === 14 && !U.validCnpj(f.cnpj) ? ' <span class="tag urg">inválido</span>' : '') + '</dd>' +
        '<dt>Contato</dt><dd>' + U.esc([f.contato, f.telefone, f.whatsapp, f.email].filter(Boolean).join(' · ') || '—') + '</dd><dt>Local</dt><dd>' + U.esc([f.cidade, f.uf].filter(Boolean).join('/') || '—') + '</dd>' +
        '<dt>Categorias</dt><dd>' + U.esc(f.categorias || '—') + '</dd><dt>Desempenho</dt><dd>' + cots.length + ' proposta(s) enviada(s), ' + venc.length + ' cotação(ões) com itens vencidos, ' + peds.length + ' pedido(s) — ' + U.money(U.sum(peds.filter(p => p.status !== 'cancelado'), p => p.total)) + '</dd></dl>' +
        (peds.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Data</th><th class="n">Total</th><th>Status</th></tr></thead><tbody>' + peds.map(p => '<tr class="click" data-go="#/pedidos/' + p.id + '"><td>' + p.numero + '</td><td>' + U.date(p.data) + '</td><td class="n">' + U.money(p.total) + '</td><td>' + UI.pill(D.STATUS_PED, p.status) + '</td></tr>').join('') + '</tbody></table></div>' : ''),
      buttons: [{ label: 'Fechar' }].concat(podeEditar('fornecedores') ? [{ label: 'Editar', cls: 'pri', icon: 'edit', action: () => { setTimeout(() => form('fornecedores', f, done), 0); } }] : [])
    });
  }

  /* Importação em lote de fornecedores/produtos por planilha */
  /* Importação de planilha (ERP): reconhece as colunas, mostra a conferência e grava no banco central */
  async function importar(key) {
    const d = DEF[key];
    const files = await UI.pickFile('.xlsx,.xls,.csv,.ods');
    if (!files.length) return;
    let rows;
    try {
      const sh = await C.readSheet(files[0]);
      rows = sh.rows.filter(r => r.some(c => String(c).trim()));
    } catch (err) { UI.toast(err.message, 'bad'); return; }
    // cabeçalho: primeira linha com pelo menos 2 textos
    const hi = Math.max(0, rows.findIndex(r => r.filter(c => /[a-zà-ú]{2,}/i.test(String(c))).length >= 2));
    const cab = rows[hi] || [];
    const dadosLin = rows.slice(hi + 1);
    if (!dadosLin.length) { UI.toast('A planilha não tem linhas de dados', 'bad'); return; }
    const mapa = root.IM.mapear(key, cab, dadosLin);
    const principal = key === 'fornecedores' ? 'razao' : 'descricao';
    const campos = d.campos.filter(c => c[0] !== 'centroCustoId').concat(key === 'equipamentos' ? [['centroCusto', 'Centro de custo (código ou nome)', '', true]] : []);
    const opts = sel => '<option value="">— não importar —</option>' + cab.map((h, ci) => '<option value="' + ci + '"' + (sel === ci ? ' selected' : '') + '>' + U.esc(String(h || 'Coluna ' + (ci + 1))) + '</option>').join('');
    const amostra = (ci) => ci === '' || ci === undefined ? '' : dadosLin.slice(0, 3).map(r => U.esc(String(r[ci] === undefined ? '' : r[ci]).slice(0, 40))).join(' · ');
    UI.modal({
      title: 'Conferir importação — ' + d.titulo, size: 'wide',
      body: '<p class="small muted" style="margin:0">' + dadosLin.length + ' linha(s) em "' + U.esc(files[0].name) + '". Confira a coluna da planilha usada em cada campo; os exemplos mostram as 3 primeiras linhas.</p>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campo do portal</th><th style="width:260px">Coluna da planilha</th><th>Exemplos</th></tr></thead><tbody>' +
        campos.map(c => '<tr><td><b>' + U.esc(c[1]) + '</b>' + (c[0] === principal ? ' *' : '') + '</td><td><select data-campo="' + c[0] + '">' + opts(mapa[c[0]]) + '</select></td><td class="small muted" data-amostra="' + c[0] + '">' + amostra(mapa[c[0]]) + '</td></tr>').join('') +
        '</tbody></table></div><p class="small muted" style="margin:0">Registros já cadastrados (mesmo CNPJ/código ou mesmo nome) são atualizados; os demais são incluídos.' + (Cloud.ativo() ? ' Tudo é gravado no banco central.' : '') + '</p>',
      buttons: [{ label: 'Cancelar' }, { label: 'Importar ' + dadosLin.length + ' linha(s)', cls: 'pri', icon: 'upload', action: async m => {
        const mp = {};
        UI.$$('select[data-campo]', m.el).forEach(sel => { if (sel.value !== '') mp[sel.dataset.campo] = Number(sel.value); });
        if (mp[principal] === undefined) { UI.toast('Escolha a coluna de "' + campos.find(c => c[0] === principal)[1] + '"', 'bad'); return false; }
        let novos = 0, atual = 0, ignorados = 0;
        dadosLin.forEach(r => {
          const o = {};
          Object.keys(mp).forEach(k => {
            let v = r[mp[k]];
            const c = campos.find(x => x[0] === k) || [];
            if (c[4] === 'num') v = U.parseNum(v);
            else if (c[4] === 'marcas') v = String(v || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
            else if (c[4] === 'unit') v = root.P.unitCode(v) || String(v || 'UN').toUpperCase();
            else v = String(v === undefined || v === null ? '' : v).trim();
            o[k] = v;
          });
          if (key === 'fornecedores') {
            if (o.email) o.email = o.email.toLowerCase();
            root.IM.corrigirContato(o);
            if (o.cnpj) o.cnpj = U.fmtCnpj(o.cnpj);
          }
          if (key === 'equipamentos') {
            const ccTxt = U.norm(o.centroCusto || '');
            const cc = S.all('centrosCusto').find(x => U.norm(x.codigo) === ccTxt || U.norm(x.descricao) === ccTxt) || S.all('centrosCusto').find(x => ccTxt && U.norm(x.descricao).indexOf(ccTxt) > -1);
            delete o.centroCusto;
            if (cc) o.centroCustoId = cc.id;
          }
          if (!o[principal]) { ignorados++; return; }
          const ex = key === 'fornecedores'
            ? S.all(d.col).find(x => (o.cnpj && U.onlyDigits(x.cnpj) === U.onlyDigits(o.cnpj)) || U.norm(x.razao) === U.norm(o.razao))
            : S.all(d.col).find(x => (o.codigo && x.codigo === o.codigo) || U.norm(x.descricao) === U.norm(o.descricao));
          if (ex) {
            Object.keys(o).forEach(k => { if (o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) ex[k] = o[k]; });
            if (key === 'fornecedores') root.IM.corrigirContato(ex);
            atual++;
          } else {
            if (!o.codigo) o.codigo = S.nextCode(d.prefixo, d.col);
            const base = { ativo: true, origem: 'importação' };
            if (key === 'produtos') Object.assign(base, { historicoPrecos: [], unidade: 'UN', marcas: [], categoria: '' });
            S.upsert(d.col, Object.assign(base, o), true);
            novos++;
          }
        });
        S.save();
        const pg = Cloud.ativo() ? UI.progress('Gravando no banco central') : null;
        if (pg) pg.set(50, (novos + atual) + ' registro(s) sendo gravados…');
        const ok = await confirmarGravacao('Planilha importada: ' + novos + ' novo(s), ' + atual + ' atualizado(s)' + (ignorados ? ', ' + ignorados + ' linha(s) sem ' + campos.find(c => c[0] === principal)[1].toLowerCase() + ' ignorada(s)' : ''));
        if (pg) pg.close();
        if (ok) V.cadastro(key);
      } }],
      onMount: el => el.addEventListener('change', e => {
        const sel = e.target.closest('select[data-campo]');
        if (sel) UI.$('[data-amostra="' + sel.dataset.campo + '"]', el).innerHTML = amostra(sel.value === '' ? '' : Number(sel.value));
      })
    });
  }

})(window);
