# Dog City WhatsApp Gateway

Gateway auxiliar para rodar conexões persistentes do `whatsapp-web.js` fora do frontend e fora das Edge Functions.

## Variáveis

- `PORT=3033`
- `WHATSAPP_GATEWAY_TOKEN=seu_token_privado`
- `WHATSAPP_SESSION_DIR=/data/whatsapp-sessions`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

## Uso local

```bash
cd services/whatsapp-gateway
npm install
npm run dev
```

## Deploy no Render

Use um serviço `Web Service` com Docker.

### Configuração recomendada

- `Root Directory`: `services/whatsapp-gateway`
- `Environment`: `Docker`
- `Plan`: prefira um plano com disco persistente
- `Health Check Path`: `/health`

### Variáveis no Render

- `WHATSAPP_GATEWAY_TOKEN=seu_token_privado`
- `WHATSAPP_SESSION_DIR=/data/whatsapp-sessions`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

### Disco persistente

Monte um disco persistente para não perder a sessão do WhatsApp.

Sugestão:
- `Mount Path`: `/data`

Com isso, os arquivos do `LocalAuth` ficam preservados entre reinícios e deploys.

## Integração com Supabase

Defina na Edge Function `whatsapp-bridge`:

- `WHATSAPP_GATEWAY_URL=https://seu-servico-no-render.onrender.com`
- `WHATSAPP_GATEWAY_TOKEN=seu_token_privado`

Depois, implante a function:

```bash
npx supabase secrets set WHATSAPP_GATEWAY_URL=https://seu-servico-no-render.onrender.com WHATSAPP_GATEWAY_TOKEN=seu_token_privado --project-ref trgpprhtqkldjdrhwlxa
npx supabase functions deploy whatsapp-bridge --project-ref trgpprhtqkldjdrhwlxa
```

## Fluxo esperado

1. Subir o gateway no Render.
2. Abrir `https://seu-servico-no-render.onrender.com/health` e confirmar `ok: true`.
3. Configurar os secrets da Edge Function no Supabase.
4. Implantar `whatsapp-bridge`.
5. Abrir a tela `Integrações` no app.
6. Gerar o QR de uma das 3 conexões.
