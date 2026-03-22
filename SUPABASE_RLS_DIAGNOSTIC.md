# Diagnóstico de Permissões Supabase (RLS)

## Problema Comum
**Erro:** "permission denied" ou "failed to save" ao tentar criar/editar/deletar dados.

**Causa:** Supabase tem **Row Level Security (RLS)** ativado, bloqueando acesso anônimo por padrão.

## Solução Rápida: Desativar RLS (Desenvolvimento)

⚠️ **AVISO:** Desativar RLS torna o banco **públicamente acessível**. Use apenas em desenvolvimento/testing. Para produção, configure policies específicas.

### Passo 1: Acessar Supabase Dashboard

1. Abra https://app.supabase.com
2. Selecione seu projeto
3. Clique em **Authentication** → **Policies** (lateral esquerda)

### Passo 2: Desativar RLS por Tabela

Para cada tabela que precisa ser escrita:

1. Clique em **Table Editor** (lateral esquerda)
2. Selecione a tabela (ex: `carteira`)
3. Clique no ícone de **engrenagem** (⚙️) no canto superior direito
4. Clique em **Enable RLS** toggle para **OFF** (desligar)
5. Confirme que diz "RLS is disabled for this table"

**Tabelas que precisam ser desativadas (para escrita funcionar):**
- `carteira`
- `dogs`
- `appointment`
- `conta_receber`
- `orcamento`
- `despesa`
- `plan_config`
- `users`
- `lancamento`
- `extratobancario`
- `checkins`
- `serviceproviders`
- `serviceprovided`
- `tabelaprecos`
- `notificacao`
- `pedidointerno`
- `receita`
- `transaction`
- `scheduledtransaction`
- `replacement`
- `integracao_config`

### Passo 3: Testar Salvamento

Após desativar RLS:

1. Volte ao app (F5 para recarregar)
2. Tente salvar algo (criar cliente, orçamento, etc.)
3. Se funcionar, o problema era RLS

## Solução Melhor: Configurar RLS Policies (Produção)

Se quiser segurança (recomendado para produção):

### Opção A: Permitir Todos (Público)

Para cada tabela, execute no SQL Editor do Supabase:

```sql
-- Permitir SELECT para todos
CREATE POLICY "Enable select for all users" ON carteira
  FOR SELECT USING (true);

-- Permitir INSERT para todos
CREATE POLICY "Enable insert for all users" ON carteira
  FOR INSERT WITH CHECK (true);

-- Permitir UPDATE para todos
CREATE POLICY "Enable update for all users" ON carteira
  FOR UPDATE USING (true);

-- Permitir DELETE para todos
CREATE POLICY "Enable delete for all users" ON carteira
  FOR DELETE USING (true);
```

Repita para cada tabela (substitua `carteira` pelo nome da tabela).

### Opção B: Permitir por Usuário Autenticado

```sql
-- Apenas usuários autenticados podem escrever
CREATE POLICY "Enable for authenticated users" ON carteira
  FOR ALL USING (auth.uid() IS NOT NULL);
```

## Verificar RLS Status

Para checar se RLS está ativado/desativado:

1. Vá para **SQL Editor** no Supabase
2. Execute:

```sql
SELECT tablename FROM information_schema.tables WHERE table_schema = 'public';
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

Resultado: `rowsecurity = true` significa RLS ativado; `false` significa desativado.

## Próximos Passos

1. **Desenvolvimento (rápido):** Desative RLS (Passo 1-3 acima)
2. **Produção:** Configure RLS Policies (Opção A ou B)
3. **Teste novamente:** F5 no app, tente salvar
4. **Se ainda não funcionar:** Relata o erro exato (console/network) e eu diagnostico

---

**Dúvidas?** Cole o erro do console (F12) aqui.
