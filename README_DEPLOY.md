Deploy rapido (GitHub + Vercel + Supabase)
=========================================

Passos recomendados:

1. Suba o repositorio para o GitHub.
2. Crie o projeto no Supabase e copie `Project URL` e `anon key`.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no provedor de deploy.
4. No Vercel, use:
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
