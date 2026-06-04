import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function countOccurrences(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

const featureFlagsSource = readProjectFile("src/lib/finance-feature-flags.js");
const functionsSource = readProjectFile("src/api/functions.js");
const appClientSource = readProjectFile("src/api/appClient.js");
const paymentSqlSource = readProjectFile("supabase/supabase-schema-finance-wallet-payment-sprint9b1.sql");
const reversalSqlSource = readProjectFile("supabase/supabase-schema-finance-wallet-payment-reversal-sprint9b1.sql");
const paymentTestSqlSource = readProjectFile("supabase/supabase-test-finance-wallet-payment-sprint9b1.sql");
const reversalTestSqlSource = readProjectFile("supabase/supabase-test-finance-wallet-payment-reversal-sprint9b1.sql");

assert.match(
  featureFlagsSource,
  /paymentV2WriteEnabled:\s*"finance\.payment_v2_write_enabled"/,
  "Flag do Payment V2 precisa permanecer exposta no cliente.",
);
assert.match(
  featureFlagsSource,
  /paymentV2ReversalEnabled:\s*"finance\.payment_v2_reversal_enabled"/,
  "Flag do Estorno V2 precisa permanecer exposta no cliente.",
);

assert.match(
  functionsSource,
  /export const financePaymentV2Execute = async \(\.\.\.args\) => \{/,
  "Wrapper publico financePaymentV2Execute precisa existir.",
);
assert.match(
  functionsSource,
  /export const financePaymentV2ExecutionAudit = async \(\.\.\.args\) => \{/,
  "Wrapper publico financePaymentV2ExecutionAudit precisa existir.",
);
assert.match(
  functionsSource,
  /export const financePaymentV2Reverse = async \(\.\.\.args\) => \{/,
  "Wrapper publico financePaymentV2Reverse precisa existir.",
);
assert.match(
  functionsSource,
  /export const financePaymentV2ReversalAudit = async \(\.\.\.args\) => \{/,
  "Wrapper publico financePaymentV2ReversalAudit precisa existir.",
);

assert.equal(
  countOccurrences(appClientSource, /mockFunctions\.financePaymentV2Execute = async/g),
  1,
  "Mock do Payment V2 deve existir uma unica vez.",
);
assert.equal(
  countOccurrences(appClientSource, /mockFunctions\.financePaymentV2Reverse = async/g),
  1,
  "Mock do Estorno V2 deve existir uma unica vez.",
);
assert.equal(
  countOccurrences(appClientSource, /supabase\.rpc\('finance_payment_v2_execute'/g),
  1,
  "Cliente Supabase deve expor um unico caminho RPC oficial para Payment V2.",
);
assert.equal(
  countOccurrences(appClientSource, /supabase\.rpc\('finance_payment_v2_reverse'/g),
  1,
  "Cliente Supabase deve expor um unico caminho RPC oficial para Estorno V2.",
);
assert.equal(
  countOccurrences(appClientSource, /supabase\.rpc\('finance_payment_v2_execution_audit'/g),
  1,
  "Cliente Supabase deve expor um unico caminho RPC oficial para auditoria de Payment V2.",
);
assert.equal(
  countOccurrences(appClientSource, /supabase\.rpc\('finance_payment_v2_reversal_audit'/g),
  1,
  "Cliente Supabase deve expor um unico caminho RPC oficial para auditoria de Estorno V2.",
);

assert.match(
  paymentSqlSource,
  /constraint uq_pagamento_v2_execucao_empresa_operacao unique \(empresa_id, operacao_idempotencia\)/,
  "Schema de Payment V2 precisa manter a unicidade por empresa + operacao_idempotencia.",
);
assert.match(
  paymentSqlSource,
  /on conflict on constraint uq_pagamento_v2_execucao_empresa_operacao do nothing/,
  "Payment V2 precisa manter ON CONFLICT nomeado para execucao idempotente.",
);
assert.match(
  paymentSqlSource,
  /on conflict on constraint uq_carteira_alocacao do update/,
  "Payment V2 precisa manter ON CONFLICT nomeado para alocacao de carteira.",
);

assert.match(
  reversalSqlSource,
  /coalesce\(v_attachment_extension, ''\) not in \('\.pdf', '\.doc', '\.txt', '\.img', '\.jpg', '\.png'\)/,
  "Estorno V2 precisa validar extensoes obrigatorias de anexo.",
);
assert.match(
  reversalSqlSource,
  /v_reason_code := 'payment_v2_reversal_disabled';/,
  "Estorno V2 precisa continuar bloqueado pela flag dedicada.",
);

assert.match(
  paymentTestSqlSource,
  /^begin;[\s\S]*rollback;$/m,
  "Teste SQL de Payment V2 precisa continuar protegido por begin/rollback.",
);
assert.match(
  reversalTestSqlSource,
  /^begin;[\s\S]*rollback;$/m,
  "Teste SQL de Estorno V2 precisa continuar protegido por begin/rollback.",
);

console.log("Sprint 9B.1 Cut 3 client contract smoke passed.");
