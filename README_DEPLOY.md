Deploy rapido (GitHub + Vercel + Supabase)
=========================================

Passos recomendados:

1. Suba o repositorio para o GitHub.
2. Crie o projeto no Supabase e copie `Project URL` e `anon key`.
3. O arquivo oficial versionado do frontend e `.env.local`, usado como base de configuracao do cliente.
4. Configure no provedor de deploy os mesmos valores publicos do `.env.local` quando necessario.
5. Nunca coloque secrets de servidor, tokens privados ou `service_role` no `.env.local` ou em variaveis `VITE_*`.
6. No Vercel, use:
   - Build Command: `npm run build`
   - Output Directory: `dist`

Cliente da aplicacao:

- `src/api/appClient.js` faz a conexao com o Supabase.
- Quando as variaveis nao existem, o app usa fallback local para testes.

Comandos uteis:

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
