# Dog City Brasil WebApp

Aplicacao principal da Dog City Brasil, desenvolvida em Vite + React e conectada ao Supabase para autenticacao, banco, storage e Edge Functions.

Este README deve ser a referencia inicial para qualquer dev que entrar no projeto.

## Visao geral

O sistema concentra operacao, comercial, financeiro, cadastros e administracao em um unico frontend.

Principais frentes do produto:

- Operacao: `Agendamentos`, `Registrador`, `Escalacao`
- Comercial e cadastro: `Cadastro`, `Perfis`, `Orcamentos`
- Financeiro: `CarteirasFinanceiras`, `Movimentacoes`, `Cockpit`, `ControleGerencial`, `PlanosConfig`
- Administracao: `Dev_Dashboard`, `AdministracaoSistema`, `ConfiguracoesPrecos`, `ConfigurarIntegracoes`
- Fluxos publicos: cadastro de cliente, cadastro de monitor, aprovacao de responsavel

As rotas ficam centralizadas em [`src/utils/index.ts`](./src/utils/index.ts) e o roteamento principal em [`src/pages/index.jsx`](./src/pages/index.jsx).

## Stack

- Vite 6
- React 18
- React Router 7
- Tailwind CSS
- Radix UI
- Supabase JS
- date-fns
- Recharts
- Framer Motion

## Requisitos

- Node LTS recente
- npm
- acesso ao projeto Supabase da Dog City
- acesso ao repositorio GitHub

Ferramentas opcionais:

- Supabase CLI
- Vercel CLI
- Docker, se for trabalhar no gateway de WhatsApp

## Inicio rapido

```bash
npm install
npm run dev
```

Build local:

```bash
npm run build
```

Preview da build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## Ambiente oficial do frontend

O arquivo oficial versionado do frontend e [`.env.local`](./.env.local).

Regra importante:

- `VITE_*` pode ficar no frontend
- segredo real nao pode ficar no frontend
- nunca colocar `service_role`, token bancario privado, senha SMTP, segredo JWT ou credencial interna dentro de `VITE_*`

Variaveis usadas hoje:

| Variavel | Obrigatoria | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sim | chave anonima publica do frontend |
| `VITE_SUPABASE_PUBLIC_BUCKET` | nao | bucket publico; padrao `public-assets` |
| `VITE_SUPABASE_PRIVATE_BUCKET` | nao | bucket privado; padrao `private-files` |
| `VITE_EMAIL_WEBHOOK_URL` | nao | endpoint para disparo de email; se vazio usa `${VITE_SUPABASE_URL}/functions/v1/send-email` |
| `VITE_SITE_URL` | nao | URL absoluta usada em callbacks de autenticacao |
| `VITE_MOCK_QA_ROLE` | nao | override de perfil para QA no mock local |

Observacoes:

- O `README_DEPLOY.md` continua util para deploy: [README_DEPLOY.md](./README_DEPLOY.md)
- O setup base do Supabase esta em [SUPABASE_SETUP_GUIDE.md](./SUPABASE_SETUP_GUIDE.md)
- Se precisar alterar o `.env.local`, trate a mudanca como mudanca de configuracao compartilhada do time, porque o arquivo e versionado

## Mock local e override de QA

O cliente principal em [`src/api/appClient.js`](./src/api/appClient.js) funciona em dois modos:

- com `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`: usa Supabase real
- sem essas variaveis: cai em mock local com `localStorage`

Override de QA disponivel no mock:

- via env: `VITE_MOCK_QA_ROLE`
- via `localStorage`: chave `local_app_client_mock_qa_role`

Valores aceitos:

- `gerencial`
- `comercial`
- `admin`
- `platform_admin`

Exemplos no console do browser:

```js
localStorage.setItem("local_app_client_mock_qa_role", "admin");
localStorage.removeItem("local_app_client_mock_qa_role");
```

## Scripts do projeto

Scripts do `package.json`:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test:finance:payment-v2
npm run test:finance:payment-v2:suite
```

Scripts adicionais de apoio ficam em [`scripts/`](./scripts):

- `test-finance-shadow-sprint2.mjs`
- `test-finance-budget-sprint4.mjs`
- `test-finance-cancellation-sprint5.mjs`
- `test-finance-reports-sprint6.mjs`
- `test-finance-commission-sprint7.mjs`
- `test-finance-cockpit-sprint8.mjs`
- `test-finance-observability-sprint9a.mjs`
- `test-finance-payment-sprint9b1.mjs`
- `test-finance-payment-suite-sprint9b1.mjs`
- `test-recurring-packages.mjs`

Antes de subir alteracoes relevantes:

1. rode `npm run build`
2. rode o script de regressao mais proximo da area alterada
3. valide a interface no browser quando a mudanca for visual ou operacional

## Estrutura relevante

```text
src/
  api/
    appClient.js              # cliente principal; Supabase real ou mock local
    entities.js               # wrappers de entidades usadas pelo app
    integrations.js           # uploads e signed URLs
  components/                 # UI compartilhada e componentes de negocio
  lib/                        # regras de negocio puras
  pages/                      # telas e rotas
  utils/                      # slugs, helpers e utilitarios gerais

supabase/
  functions/                  # Edge Functions
  *.sql                       # migracoes, testes e auditorias financeiras

services/
  whatsapp-gateway/           # servico auxiliar para conexoes persistentes do WhatsApp

docs/
  lgpd-hardening.md           # baseline atual de seguranca e LGPD
```

Arquivos importantes fora de `src/`:

- [`vercel.json`](./vercel.json): headers de seguranca + rewrite SPA
- [`SUPABASE_SETUP_GUIDE.md`](./SUPABASE_SETUP_GUIDE.md): ordem de setup do banco
- [`SUPABASE_RLS_DIAGNOSTIC.md`](./SUPABASE_RLS_DIAGNOSTIC.md): apoio para diagnostico de RLS
- [`README_DEPLOY.md`](./README_DEPLOY.md): notas curtas de deploy

## Banco, schemas e SQL

O repositorio possui SQL em dois grupos principais:

- raiz do projeto: schemas base, cloud config, auth, pricing, banco inter, seeds e politicas
- pasta [`supabase/`](./supabase): evolucoes do financeiro V2, testes SQL e auditorias

Regras de trabalho:

- nao aplicar scripts arbitrariamente em producao
- seguir a ordem base descrita em [SUPABASE_SETUP_GUIDE.md](./SUPABASE_SETUP_GUIDE.md)
- para financeiro V2, usar os arquivos da pasta `supabase/` correspondentes ao sprint/tema
- tratar com cuidado scripts com `drop`, `reset`, `fix` ou `reenable`

Arquivos financeiros recentes de referencia:

- `supabase-schema-finance-wallet-*.sql`
- `supabase-test-finance-wallet-*.sql`
- `supabase-audit-finance-wallet-*.sql`

Ciclo de vida dos perfis de clientes:

- `supabase/supabase-schema-profile-lifecycle.sql`: exclusao logica de Responsaveis e Responsaveis Financeiros, recuperacao por 30 dias e unicidade de CPF por categoria/unidade
- `supabase/supabase-test-profile-lifecycle.sql`: regressao transacional de duplicidade, reserva do CPF durante a recuperacao, restauracao e expiracao do prazo

## Edge Functions Supabase

Functions presentes em [`supabase/functions/`](./supabase/functions):

- `banco-inter-sync`: sincronizacao de cobrancas, boleto e movimentacao do Banco Inter
- `send-email`: envio de emails
- `whatsapp-bridge`: ponte entre o app e o gateway externo do WhatsApp
- `user-admin`: rotinas administrativas de usuario
- `client-registration`: fluxos de cadastro publico de cliente
- `monitor-registration`: fluxos de cadastro publico de monitor
- `responsavel-approval`: aprovacao publica de responsavel

Importante:

- secrets dessas functions ficam no Supabase, nao no frontend
- `SUPABASE_SERVICE_ROLE_KEY` e similares nao devem aparecer em `.env.local`

## Gateway de WhatsApp

Existe um servico separado em [`services/whatsapp-gateway/`](./services/whatsapp-gateway) para manter sessoes persistentes do `whatsapp-web.js`.

Documentacao propria:

- [`services/whatsapp-gateway/README.md`](./services/whatsapp-gateway/README.md)

Use esse servico quando precisar:

- manter QR e autenticacao persistente fora do frontend
- integrar as conexoes com a tela `Integracoes`
- operar a ponte `whatsapp-bridge` do Supabase

## Deploy

Deploy padrao:

- frontend: Vercel
- backend: Supabase
- gateway WhatsApp: Render ou infraestrutura equivalente

O [`vercel.json`](./vercel.json) ja contem:

- rewrite SPA para `index.html`
- `Content-Security-Policy`
- `Permissions-Policy`
- `Referrer-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-Robots-Tag`
- `Strict-Transport-Security`

## Seguranca e LGPD

Leitura obrigatoria para frentes sensiveis:

- [`docs/lgpd-hardening.md`](./docs/lgpd-hardening.md)

Resumo do que ja existe:

- mascaramento de PII em varias telas para perfis sem privilegio
- headers defensivos no deploy
- bloqueio de indexacao publica

Resumo do que ainda depende de backend/governanca:

- RLS e menor privilegio
- trilha de auditoria de acesso a PII
- politicas de retencao e descarte
- revisao de logs e erros
- controles de incidente e compliance

## Fluxo recomendado para dev

1. Atualize a branch e rode `npm install`
2. Confirme o conteudo atual de `.env.local`
3. Rode `npm run dev`
4. Se mexer em backend, confirme impacto em SQL, Edge Functions e policies
5. Se mexer em financeiro, rode o script de regressao correspondente
6. Antes de commit, rode `npm run build`

## Ponto de entrada para manutencao

Se voce esta chegando agora, comece por estes arquivos:

- [`src/pages/index.jsx`](./src/pages/index.jsx): roteamento
- [`src/pages/Layout.jsx`](./src/pages/Layout.jsx): navegacao principal
- [`src/api/appClient.js`](./src/api/appClient.js): acesso a dados
- [`src/lib/`](./src/lib): regras de negocio reutilizaveis
- [`src/pages/Agendamentos.jsx`](./src/pages/Agendamentos.jsx): operacao
- [`src/pages/Movimentacoes.jsx`](./src/pages/Movimentacoes.jsx): financeiro operacional
- [`src/pages/PlanosConfig.jsx`](./src/pages/PlanosConfig.jsx): planos recorrentes

## Regras praticas do repositorio

- nao editar `dist/`
- nao subir segredo real para o frontend
- nao aplicar SQL destrutivo sem validacao explicita
- tratar `README`, SQL e docs como parte do produto, nao como acessorios
