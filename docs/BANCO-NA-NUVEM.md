# Banco de dados central (Supabase) — passo a passo

Com o Supabase configurado, **todos os dados ficam no banco central**: cadastros, solicitações, cotações, pedidos, entregas, estoque e registros.
Todo usuário entra com e-mail e senha e vê os mesmos dados, conforme as permissões da categoria dele.
O navegador guarda só uma cópia de trabalho; cada gravação é confirmada pelo banco ("gravado no banco central").

As regras de acesso valem **no próprio banco**, não só nas telas: um usuário básico não consegue ler pedidos nem alterar produtos, mesmo tentando pela API. Pedidos acima da alçada também são recusados se o autorizador não tiver o nível exigido.

---

## Passo 1 — Criar as tabelas (SQL Editor do Supabase)

1. Abra o projeto em **supabase.com** → menu lateral **SQL Editor** → **New query**.
2. Copie **todo** o conteúdo do arquivo [`supabase/schema.sql`](../supabase/schema.sql) do GitHub, cole e clique em **Run**.
   Deve aparecer **Success. No rows returned**.
   O script pode ser executado de novo sem perder dados (por exemplo, depois de uma atualização do portal).

O script cria:

| Tabela | Conteúdo |
|---|---|
| `registros` | Todos os dados do portal (um registro por linha, conteúdo em JSON) |
| `perfis` | Usuários do portal: categoria, centros de custo e permissões |
| `alcadas` | Níveis e valores de aprovação (já vem com R$ 500 / R$ 1.000 / acima) |
| `auditoria` | Registro de tudo o que cada usuário fez, com data e hora |

## Passo 2 — Criar o seu usuário administrador

1. **Authentication → Sign In / Providers**: confirme que **Email** está habilitado e **desligue "Allow new users to sign up"**. Assim só entra quem o administrador cadastrar.
2. **Authentication → Users → Add user → Create new user**: informe **o seu** e-mail e uma senha e marque **Auto Confirm User**.
3. Volte ao **SQL Editor**, rode a linha abaixo com o seu e-mail e nome e confira a mensagem *Pronto: … agora é administrador do portal*:
   ```sql
   select public.tornar_admin('seu.email@brasmic.com.br', 'Seu Nome');
   ```

Os demais usuários você cadastra **dentro do portal** (Administração → Usuários e acessos), depois do passo 3.

## Passo 3 — Ligar o portal ao banco (Vercel)

No Supabase, abra **Project Settings → API Keys** (ou **API**) e copie três valores:

| Variável na Vercel | Onde encontrar | Observação |
|---|---|---|
| `SUPABASE_URL` | **Project URL** (ex.: `https://abcd1234.supabase.co`) | |
| `SUPABASE_ANON_KEY` | chave **anon public** ou **publishable** (`sb_publishable_…`) | Fica no navegador; sem login não dá acesso a nada |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **service_role** ou **secret** (`sb_secret_…`) | **Somente no servidor.** Usada apenas para cadastrar usuários e redefinir senhas. Nunca a coloque no código nem compartilhe |

Na **Vercel** → projeto `projeto-compras` → **Settings → Environment Variables**, cadastre as três variáveis, marcando *Production*, *Preview* e *Development*.
Depois: **Deployments** → três pontinhos do último deploy → **Redeploy**.

> O build confere as chaves: se a chave secreta for colocada por engano em `SUPABASE_ANON_KEY`, o deploy para com erro, em vez de expor a chave.

## Passo 4 — Primeiro acesso

1. Abra o portal (ex.: `https://projeto-compras-tau.vercel.app`). Aparece a tela de **login**.
2. Entre com o usuário do passo 2.
3. **Dados que estavam só no seu computador** (por exemplo, a planilha de fornecedores do ERP importada antes): o portal mostra a janela *Dados encontrados só neste computador*. Marque o que enviar (fornecedores, produtos, centros de custo…) e clique em **Enviar ao banco central**. Registros marcados "(exemplo)" ficam de fora.
   Se fechar a janela, dá para fazer depois em **Configurações → Dados só neste computador**.
4. Em **Configurações → Diagnosticar conexão**, confira se está tudo "ok" e quantos registros há no banco.

## Passo 5 — Cadastros básicos e usuários

1. **Cadastros → Centros de custo**, **Equipamentos** (cada um no seu centro de custo) e **Categorias de despesa** (botão *Incluir categorias padrão*).
2. **Cadastros → Compradores e alçadas**: em cada comprador, marque os **níveis de alçada** que ele pode aprovar.
3. **Administração → Alçadas de aprovação**: ajuste os valores, se necessário.
4. **Administração → Usuários e acessos → Novo usuário**: nome, e-mail, senha inicial, categoria (Básico, Comprador ou Administrador), centros de custo, vínculo com solicitante/comprador e permissões (totalizadores, registros, cadastro de produtos e fornecedores).
5. **Fornecedores / Produtos / Equipamentos → Importar planilha**: o portal reconhece as colunas do ERP e mostra uma tela de conferência antes de gravar no banco.

---

## Como funciona por dentro

- **Gravação**: cada alteração é enviada ao banco em até 1 segundo. Em cadastros, importações e aprovações, a tela só confirma depois que o banco aceitou.
- **Atualização**: o portal busca as alterações dos outros usuários a cada 15 segundos e ao voltar para a aba.
- **Sem internet**: o portal avisa ("Banco central: sem conexão") e grava as alterações quando a conexão voltar.
- **Recusa do banco** (sem permissão ou alçada insuficiente): o portal mostra o motivo e volta a tela para o que está no banco.
- **Exclusões** ficam marcadas, sem apagar o histórico. Cada alteração fica na tabela `auditoria`, com campo, valor anterior e valor novo.
- **Numeração** (SC-, CT-, PC-, ENT-) considera os números já existentes no banco.
- **Backup**: o plano gratuito do Supabase não tem backup automático diário. Use **Configurações → Baixar cópia** periodicamente ou contrate o plano Pro.
