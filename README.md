# Brasmic Compras

Sistema web de **solicitação, cotação, mapa comparativo de preços e pedidos de compra** da Brasmic Mineração Areia & Brita.

Funciona direto no navegador, sem instalação. Pode trabalhar sozinho (dados salvos no navegador) ou ligado ao **banco de dados na nuvem** (Supabase/PostgreSQL), com login por usuário, para que requisitantes e compradores usem a mesma base em qualquer computador ou celular. Passo a passo: [docs/BANCO-NA-NUVEM.md](docs/BANCO-NA-NUVEM.md).

## Como usar

- **Rápido:** abra o `index.html` no Google Chrome ou no Microsoft Edge.
- **Recomendado (voz e leitura de documentos funcionam melhor):** publique a pasta num endereço `https`, por exemplo pelo GitHub Pages (Settings → Pages → branch), ou rode localmente:
  ```bash
  python3 -m http.server 8080   # depois acesse http://localhost:8080
  ```
- No primeiro acesso o sistema abre com **dados de exemplo** para treinamento. Em *Configurações → Limpar exemplos e começar* ele fica zerado para uso real.

## Fluxo

```
Solicitação → Cotação → Propostas → Mapa comparativo → Pedido de compra → Recebimento / Estoque
```

### 1. Solicitação de compra (requisitante)
- Campos: **código do solicitante**, **comprador** responsável, **centro de custo**, **destino (aplicação direta ou estoque)**, aplicação/equipamento, prioridade e data de necessidade.
- Itens com produto, código, quantidade, unidade, **marca** e observação. Ao escolher um produto já cadastrado, o código, a unidade e a marca são preenchidos, e o sistema mostra o último preço pago.
- **Três formas de entrada, que podem ser combinadas:**
  - **Digitada:** direto na tabela de itens.
  - **Digitalizada:** anexe foto, PDF escaneado, planilha ou tire a foto da requisição em papel. O texto é lido por OCR em português (Tesseract), os itens são identificados e aparecem numa tela de conferência. O arquivo fica anexado à solicitação.
  - **Por voz:** dite os itens, por exemplo *“solicitante Ana Paula, centro de custo segurança do trabalho, para estoque, trinta pares de luva de raspa marca Kalipso, próximo item dez caixas de protetor auricular”*. O sistema entende números por extenso, unidades, marcas, destino, prioridade, solicitante e centro de custo.
- Ações: editar, duplicar, imprimir, cancelar, excluir e enviar para cotação.

### 2. Cotação (comprador)
- Agrupa uma ou mais solicitações abertas. Sugere fornecedores que já venderam aqueles produtos ou que atendem a categoria dos itens.
- **Envio do pedido de cotação** por e-mail, WhatsApp, PDF impresso ou **planilha Excel** para o fornecedor preencher.

### 3. Propostas com preenchimento automático
- **Importar proposta** a partir de:
  - planilha devolvida pelo fornecedor (o modelo gerado pelo sistema é lido com 100% de precisão);
  - PDF da proposta (com texto ou escaneado);
  - foto da proposta;
  - texto colado de e-mail ou WhatsApp.
- O sistema identifica o fornecedor (CNPJ, e-mail ou nome), localiza cada item, lê preço unitário (distingue unitário de total), marca, prazo de entrega, condição de pagamento, frete, desconto e validade. Tudo passa por uma tela de conferência antes de salvar.
- **Cadastro automático:** fornecedores novos e produtos novos que aparecem nas cotações recebidas são cadastrados sozinhos, e as marcas ofertadas entram no cadastro do produto.

### 4. Mapa comparativo e totalizador
- Grade de itens × fornecedores com preço unitário (já com desconto), total por quantidade e marca.
- O **menor preço** de cada item fica destacado e é **selecionado automaticamente**. Clique em qualquer célula para trocar o fornecedor escolhido.
- Opção de **comprar tudo de um só fornecedor**.
- **Totalizador:** total selecionado (com fretes), total com os melhores preços, economia sobre a média, economia sobre o maior preço e melhor fornecedor único.
- Exporta para Excel e imprime.

### 5. Pedido de compra
- **Gerar pedidos** cria automaticamente um pedido por fornecedor vencedor, com logotipo e dados da empresa, pronto para imprimir/PDF, enviar por e-mail ou WhatsApp.
- Acompanhamento: emitido → enviado → recebido parcial → recebido, com alerta de entrega atrasada.
- **Recebimento** com nota fiscal. Itens para estoque entram no saldo; itens de aplicação direta são lançados como consumo do centro de custo. A solicitação passa a “Atendida”.

### 6. Estoque
- Saldos, custo médio, valor em estoque e movimentações (entradas, saídas por requisição de material, exclusão de lançamentos manuais).
- Alerta de estoque mínimo e **reposição automática**, que gera a solicitação de compra dos itens em falta.

### Cadastros
Fornecedores (com validação de CNPJ e histórico de desempenho), produtos e marcas (com histórico de preços pagos e cotados), solicitantes, compradores e centros de custo. Inclusão, edição, exclusão (ou inativação quando o cadastro já foi usado), exportação e importação por planilha.

### Painel
Solicitações abertas e urgentes, cotações em andamento, pedidos a receber ou atrasados, valor comprado no mês, economia obtida, gastos por centro de custo, principais fornecedores e atividade recente.

## Estrutura

```
index.html            página única do aplicativo
css/app.css           identidade visual (cores da marca Brasmic)
assets/               logotipo e ícone
js/util.js            formatação, números em pt-BR, similaridade de textos, CNPJ
js/parser.js          interpretação de ditado, OCR e propostas
js/store.js           armazenamento no navegador
js/cloud.js           login e sincronização com o banco na nuvem (Supabase)
supabase/schema.sql   script de criação do banco, segurança e histórico
js/domain.js          regras do processo (cotação, mapa, pedidos, estoque)
js/capture.js         voz, OCR, PDF e planilhas
js/docs.js            pedido de cotação, pedido de compra, mapa (impressão/Excel)
js/views/*.js         telas
tests/                testes automatizados dos interpretadores (npm test)
```

Bibliotecas carregadas sob demanda pela internet: Tesseract.js (OCR), PDF.js (leitura de PDF) e SheetJS (Excel).

## Limitações atuais
- Sem o banco na nuvem configurado, os dados ficam só no navegador de cada computador.
- Com o banco na nuvem, alterações de outros usuários chegam em até 15 segundos. Se duas pessoas alterarem o mesmo registro ao mesmo tempo, vale a última gravação (a anterior fica no histórico do banco).
- O reconhecimento de voz depende do Chrome/Edge e de internet. No celular, o microfone do teclado também funciona no campo de texto do ditado.
- A leitura de fotos e de manuscritos depende da qualidade da imagem. Por isso todo item lido passa pela tela de conferência.
