# Dog City WhatsApp Gateway

Gateway auxiliar para rodar conexões persistentes do `whatsapp-web.js` fora do frontend e fora das Edge Functions.

## Variáveis

- `PORT=3033`
- `WHATSAPP_GATEWAY_TOKEN=seu_token_privado`

## Uso

```bash
cd services/whatsapp-gateway
npm install
npm run dev
```

## Integração com Supabase

Defina na Edge Function `whatsapp-bridge`:

- `WHATSAPP_GATEWAY_URL=http://seu-servidor:3033`
- `WHATSAPP_GATEWAY_TOKEN=seu_token_privado`

Depois, implante a function `whatsapp-bridge` no projeto Supabase.
