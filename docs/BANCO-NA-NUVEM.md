# Banco de dados na nuvem (Supabase)

Com o banco na nuvem, requisitantes e compradores trabalham na **mesma base**, em qualquer computador ou celular.
Tudo o que um usuário salva aparece para os outros em até 15 segundos. Sem internet, o sistema continua funcionando e envia as alterações quando a conexão volta.

O Supabase é um PostgreSQL na nuvem com plano gratuito (500 MB de banco, suficiente para anos de solicitações e cotações).

## 1. Criar o banco (uma vez, ~10 minutos)

1. Acesse **https://supabase.com** → *Start your project* → entre com e-mail ou GitHub.
2. *New project*:
   - **Name:** `brasmic-compras`
   - **Database password:** crie uma senha forte e guarde (é do administrador; os usuários não usam).
   - **Region:** *South America (São Paulo)*.
3. Aguarde o projeto ficar pronto (1–2 minutos).
4. Menu lateral → **SQL Editor** → *New query* → cole todo o conteúdo do arquivo [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. Deve aparecer *Success*.

## 2. Bloquear cadastro público e criar os usuários

1. **Authentication → Sign In / Providers** (ou *Settings*): desligue **Allow new users to sign up**. Assim só entra quem o administrador cadastrar.
2. **Authentication → Users → Add user → Create new user**, para cada pessoa:
   - e-mail e senha;
   - marque **Auto Confirm User**.
   Crie um usuário para cada comprador e requisitante.

## 3. Pegar os dois códigos de conexão

**Project Settings → API** (ou *Data API* / *API Keys*):
- **Project URL** — ex.: `https://abcdefghijk.supabase.co`
- **anon public key** (ou *publishable key*) — um código longo.

A chave *anon/publishable* pode ficar no navegador: sem login válido ela não dá acesso a nenhum dado (as regras de segurança do script exigem usuário autenticado).
**Nunca** use a chave *service_role* / *secret* no aplicativo.

## 4a. Publicar na Vercel com as variáveis de ambiente (recomendado)

Na Vercel: **Add New → Project →** importe o repositório `projeto-compras`. O `vercel.json` já define o build (`npm run build`) e a pasta de saída (`dist`).

Em **Settings → Environment Variables** (marque *Production*, *Preview* e *Development*):

| Nome | Valor (Supabase → Project Settings → API) |
|---|---|
| `SUPABASE_URL` | Project URL, ex.: `https://abcdefghijk.supabase.co` |
| `SUPABASE_ANON_KEY` | chave **anon public** (ou *publishable key*, `sb_publishable_…`) |

Também são aceitos os nomes criados pela integração Supabase da Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
Depois de salvar as variáveis, faça **Redeploy**. O build recusa a chave `service_role`/secret.

Com as variáveis configuradas, o sistema publicado abre pedindo apenas **e-mail e senha** de cada usuário.

## 4b. Conectar sem a Vercel

Em cada computador (ou celular):
1. Abra o sistema → **Configurações → Banco de dados na nuvem**.
2. Preencha *Project URL*, *chave pública*, *e-mail* e *senha* do usuário → **Conectar**.
3. No **primeiro** computador, com o banco vazio, escolha **Começar limpo** (ou envie os dados que já digitou).
   Nos demais, o sistema baixa os dados da nuvem.

O indicador no rodapé do menu lateral mostra a situação: verde = sincronizado, amarelo = sincronizando, vermelho = sem conexão ou login expirado.

## Como funciona

| Item | Onde fica |
|---|---|
| Solicitações, cotações, propostas, pedidos, estoque, cadastros, configurações da empresa | tabela `registros` (um registro por linha, conteúdo em JSON) |
| Histórico de todas as alterações (quem, quando, o quê) | tabela `registros_historico` (consultar pelo *Table Editor* do Supabase) |
| Cópia local para trabalhar sem internet | navegador de cada computador |

- **Exclusões** são marcadas (não apagadas fisicamente), para chegarem aos outros computadores e preservarem o histórico.
- **Numeração** (SC-, CT-, PC-) considera os números já existentes na base compartilhada.
- **Conflito:** se duas pessoas alterarem o mesmo registro ao mesmo tempo, vale a última gravação; a versão anterior fica em `registros_historico`.
- **Backups:** o Supabase faz backup diário automático nos planos pagos; no gratuito, use também *Configurações → Baixar cópia* periodicamente.

## Publicar o aplicativo na internet (opcional)

Para abrir o sistema de qualquer lugar por um link `https` (necessário para o microfone no celular):
GitHub → repositório → **Settings → Pages** → *Deploy from a branch* → `main` / root → **Save**.
O endereço fica `https://<usuario>.github.io/projeto-compras/`.
