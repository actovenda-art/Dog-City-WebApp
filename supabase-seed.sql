-- Seed data para Supabase (Dog City Brasil)
-- Execute este arquivo no SQL Editor do Supabase (ou via psql) após aplicar o schema.

-- Clientes (carteira)
INSERT INTO carteira (id, nome_razao_social, cpf_cnpj, celular, email, ativo, created_date)
VALUES
  ('client_1', 'Ana Silva', '123.456.789-00', '+5511999999999', 'ana.silva@example.com', true, NOW()),
  ('client_2', 'PetShop Amigo', '12.345.678/0001-90', '+5511988888888', 'contato@petamigo.com', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Cães
INSERT INTO dogs (id, nome, apelido, raca, peso, data_nascimento, foto_url, ativo, created_date)
VALUES
  ('dog_1', 'Rex', 'Rexinho', 'Vira-lata', 12.5, '2019-06-10', NULL, true, NOW()),
  ('dog_2', 'Luna', NULL, 'Labrador', 24.3, '2021-02-01', NULL, true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Associações simples: registrar dog_id em carteira (opcional, mantendo colunas dog_id_1..)
UPDATE carteira SET dog_id_1 = 'dog_1' WHERE id = 'client_1';
UPDATE carteira SET dog_id_1 = 'dog_2' WHERE id = 'client_2';

-- Responsáveis
INSERT INTO responsavel (id, nome_completo, cpf, celular, email, ativo, created_date)
VALUES
  ('resp_1', 'Ana Silva', '123.456.789-00', '+5511999999999', 'ana.silva@example.com', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Agendamentos / appointment
INSERT INTO appointment (id, dog_id, data_hora_entrada, data_hora_saida, service_type, status, observacoes, created_date)
VALUES
  ('appt_1', 'dog_1', '2025-12-15 09:00:00', '2025-12-15 12:00:00', 'day_care', 'agendado', 'Levar coleira azul', NOW()),
  ('appt_2', 'dog_2', '2025-12-16 14:00:00', NULL, 'banho_tosa', 'agendado', 'Cortar unhas', NOW())
ON CONFLICT (id) DO NOTHING;

-- Contas a receber
INSERT INTO conta_receber (id, cliente_id, dog_id, descricao, servico, valor, vencimento, status, created_date)
VALUES
  ('rec_1', 'client_1', 'dog_1', 'Banho e Tosa', 'banho_tosa', 80.00, '2025-12-20', 'pendente', NOW()),
  ('rec_2', 'client_2', 'dog_2', 'Hospedagem 1 dia', 'hospedagem', 120.00, '2025-12-22', 'pendente', NOW())
ON CONFLICT (id) DO NOTHING;

-- Orçamentos
INSERT INTO orcamento (id, cliente_id, caes, subtotal_hospedagem, subtotal_servicos, subtotal_transporte, desconto_total, valor_total, status, observacoes, created_date)
VALUES
  ('orc_1', 'client_1', '[{"id":"dog_1","nome":"Rex","servicos":["banho_tosa"]}]'::jsonb, 0, 80.00, 0, 0, 80.00, 'rascunho', 'Orçamento teste', NOW())
ON CONFLICT (id) DO NOTHING;

-- Despesas
INSERT INTO despesa (id, descricao, valor, data_despesa, categoria, status, created_date)
VALUES
  ('desp_1', 'Compra de ração', 250.50, '2025-12-01', 'Infra', 'pendente', NOW())
ON CONFLICT (id) DO NOTHING;

-- Planos
INSERT INTO plan_config (id, dog_id, cliente_id, tipo_plano, valor_mensal, data_vencimento, status, created_date)
VALUES
  ('plan_1', 'dog_1', 'client_1', 'mensal-basic', 59.90, '2026-01-01', 'ativo', NOW())
ON CONFLICT (id) DO NOTHING;

-- Usuários
INSERT INTO users (id, email, full_name, profile, cpf, phone, active, created_date)
VALUES
  ('user_1', 'admin@example.com', 'Administrador', 'admin', '00000000000', '+5511999990000', true, NOW()),
  ('user_2', 'recepcao@example.com', 'Recepção', 'staff', '11111111111', '+5511999990001', true, NOW())
ON CONFLICT (id) DO NOTHING;

-- Lançamentos
INSERT INTO lancamento (id, descricao, valor, data_lancamento, tipo, conta, categoria, created_date)
VALUES
  ('lan_1', 'Pagamento fornecedor', 1200.00, '2025-12-05', 'saida', 'conta_principal', 'fornecedor', NOW()),
  ('lan_2', 'Recebimento cliente', 300.00, '2025-12-06', 'entrada', 'conta_principal', 'venda', NOW())
ON CONFLICT (id) DO NOTHING;

-- Extrato bancário
INSERT INTO extratobancario (id, descricao, tipo, valor, data_movimento, conta_origem, conta_destino, lancamento_id, created_date)
VALUES
  ('ext_1', 'Pagamento Pix fornecedor', 'saida', 1200.00, '2025-12-05', 'conta_principal', NULL, 'lan_1', NOW()),
  ('ext_2', 'Recebimento cartão', 'entrada', 300.00, '2025-12-06', NULL, 'conta_principal', 'lan_2', NOW())
ON CONFLICT (id) DO NOTHING;

-- Observação: ajuste os IDs e datas conforme necessário para seu ambiente.
