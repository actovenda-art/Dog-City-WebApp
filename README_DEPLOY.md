Deploy rápido (GitHub + Vercel + Supabase)
=========================================

Passos recomendados (ordem sugerida):

1) Inicializar Git e subir para o GitHub
   - Crie um repositório no GitHub e empurre o código para `main`.

2) Criar projeto Supabase
   - Em https://app.supabase.com crie um projeto.
   - No dashboard do projeto → Settings → API copie `Project URL` e `anon key`.
   - Adicione essas chaves como variáveis no Vercel / GitHub (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`).

3) Conectar o repositório ao Vercel
   - Em https://vercel.com crie um novo projeto importando do GitHub.
   - Nas configurações do projeto, adicione as Environment Variables listadas em `.env.example`.
   - Build Command: `npm run build`
   - Output Directory: `dist`

4) Opcional: Render
   - Você pode também usar o Render para deploy static site: Build `npm run build` e publish `dist`.

5) (Opcional) Substituir mock por Supabase
   - Crie tabelas no Supabase (ex.: `dogs`, `clients`, `orcamentos` etc.) e atualize `src/api/base44Client.js` para usar `@supabase/supabase-js`.

Comandos úteis (PowerShell):

```powershell
git init
git add .
git commit -m "Initial commit"
# criar repo via GH CLI (opcional)
# gh repo create <user>/<repo> --public --source=. --remote=origin --push
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Configurar Secrets no GitHub (Settings → Secrets → Actions):
- `VERCEL_TOKEN` (ou use integração direta Vercel)
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nota: o projeto está com um mock local em `src/api/base44Client.js`. Antes de migrar para Supabase, faça testes locais e crie as tabelas necessárias.
