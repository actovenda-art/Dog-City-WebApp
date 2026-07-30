# Baseline LGPD e Segurança do Webapp

Este documento registra os controles técnicos, os avisos públicos e os pontos que ainda dependem de processo e governança.

## Transparência e consentimento

- documentos públicos sem autenticação:
  - `/privacidade`;
  - `/termos`;
  - `/cookies`;
- aviso de cookies global com escolha entre recursos necessários e preferências;
- nenhuma categoria de analytics, publicidade ou marketing ativa;
- o cookie visual `sidebar_state` só é criado após autorização de preferências;
- links legais disponíveis no login, cadastros públicos, onboarding, cobrança pública e ambiente autenticado;
- ciência obrigatória no cadastro público de cliente e de funcionário;
- autorização destacada para dados de saúde do funcionário quando essas informações forem fornecidas;
- validação nas Edge Functions, sem confiar apenas no frontend;
- evidência minimizada em `privacy_consent_record`, sem armazenar IP ou conteúdo cadastral.

Versões vigentes:

- Aviso de Privacidade: `2026-07-30`;
- Termos de Uso: `2026-07-30`;
- Política de Cookies: `2026-07-30`.

Ao alterar materialmente um documento, atualize a versão no frontend e nas Edge Functions.

## Controles já aplicados

- headers defensivos no deploy:
  - `Content-Security-Policy`;
  - `Permissions-Policy`;
  - `Referrer-Policy`;
  - `X-Content-Type-Options`;
  - `X-Frame-Options`;
  - `X-Robots-Tag`;
  - `Strict-Transport-Security`;
- bloqueio de indexação pública com `public/robots.txt`;
- mascaramento de CPF/CNPJ, telefone, email e endereço conforme perfil;
- acesso por perfil e unidade;
- autenticação e logs de tentativa de acesso;
- armazenamento privado com URLs temporárias;
- consentimento registrado apenas pelo backend com `service_role`.

## Configuração obrigatória

Defina no ambiente de produção:

```env
VITE_PRIVACY_CONTROLLER_NAME=
VITE_PRIVACY_CONTACT_EMAIL=
```

O email deve ser um canal real e monitorado para solicitações de titulares. Se não estiver configurado, a interface orienta o titular a procurar a unidade responsável.

## O que a implementação não resolve sozinha

Software não torna a operação “100% LGPD” sem processos. A organização ainda deve:

- formalizar controlador, operadores e encarregado ou canal equivalente;
- manter inventário e registro das operações de tratamento;
- aprovar prazos de retenção e descarte por categoria;
- atender solicitações de titulares dentro dos prazos aplicáveis;
- revisar contratos com Supabase, Vercel, Banco Inter e demais operadores;
- manter processo de resposta a incidentes;
- revisar periodicamente perfis, permissões, logs, backups e RLS;
- treinar usuários internos para minimização e uso adequado dos dados;
- obter revisão jurídica dos textos antes da publicação institucional definitiva.
