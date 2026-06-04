# Baseline LGPD e Segurança do Webapp

Este documento registra o endurecimento técnico aplicado no frontend e os pontos que ainda dependem de processo, backend e governança.

## O que já foi aplicado no webapp

- Headers defensivos no deploy via `vercel.json`:
  - `Content-Security-Policy`
  - `Permissions-Policy`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `X-Robots-Tag`
  - `Strict-Transport-Security`
- Bloqueio de indexação pública com `public/robots.txt`.
- Mascaramento de dados pessoais para perfis não gerenciais/plataforma:
  - CPF/CNPJ
  - telefone
  - email
  - endereço
- Minimização de exposição em telas de maior risco:
  - `Perfis`
  - `Orçamentos`
  - modal financeiro do orçamento

## O que isso não resolve sozinho

Essas mudanças não tornam o sistema “100% LGPD” por si só. Ainda é necessário tratar:

- base legal e finalidade por operação de tratamento;
- política de retenção e descarte;
- atendimento a direitos do titular;
- registro de operações de tratamento;
- resposta a incidentes;
- revisão de perfis/permissões e menor privilégio no backend;
- criptografia em repouso e em backups;
- logs com minimização de PII;
- contratos com operadores e integrações terceiras.

## Próximos passos recomendados

### Backend e banco

- aplicar RLS e revisão de permissões no Supabase para tabelas com PII;
- revisar signed URLs e tempo de expiração;
- mapear e reduzir armazenamento de dados pessoais em `localStorage`;
- implementar trilha de auditoria para acesso a dados sensíveis;
- revisar logs e mensagens de erro para evitar vazamento de PII.

### Governança

- publicar política interna de retenção e descarte;
- definir fluxo de incidente de segurança;
- manter inventário de dados pessoais tratados;
- formalizar papéis de controlador/operador/encarregado;
- revisar bases legais de cada fluxo operacional e financeiro.
