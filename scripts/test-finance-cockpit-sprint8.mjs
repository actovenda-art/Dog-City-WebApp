import assert from "node:assert/strict";
import {
  buildCockpitCompareRows,
  buildFinancialAlertsSummary,
  sortFinancialAlerts,
} from "../src/lib/finance-cockpit.js";

const compareRows = buildCockpitCompareRows({
  legacy: {
    recebimentos_total: 1000,
    pendencias_total: 300,
    faturamento_real_total: 1000,
    geracao_recursos_total: 800,
    cancelamentos_estornos_total: 0,
    comissoes_total: 0,
    cobrancas_abertas_vencidas_total: 2,
  },
  v2: {
    recebimentos_total: 1000,
    pendencias_total: 330,
    faturamento_real_total: 980,
    geracao_recursos_total: 800,
    cancelamentos_estornos_total: 1,
    comissoes_total: 20,
    cobrancas_abertas_vencidas_total: 3,
  },
});

assert.equal(compareRows.length, 7, "O comparativo do cockpit precisa gerar 7 métricas");
assert.equal(compareRows.find((row) => row.metric_key === "recebimentos")?.severity, "ok");
assert.equal(compareRows.find((row) => row.metric_key === "comissoes")?.difference_origin, "legado_sem_modelagem_oficial");
assert.equal(compareRows.find((row) => row.metric_key === "cancelamentos_estornos")?.severity, "info");
assert.equal(compareRows.find((row) => row.metric_key === "cobrancas_abertas_vencidas")?.difference_value, 1);

const alerts = sortFinancialAlerts([
  { severity: "baixa", amount: 10, title: "Baixo" },
  { severity: "critica", amount: 5, title: "Critico" },
  { severity: "alta", amount: 80, title: "Alta" },
  { severity: "media", amount: 100, title: "Media" },
]);

assert.equal(alerts[0]?.severity, "critica", "Alertas críticos precisam aparecer primeiro");
assert.equal(alerts[1]?.severity, "alta");
assert.equal(alerts[2]?.severity, "media");

const alertSummary = buildFinancialAlertsSummary(alerts);
assert.equal(alertSummary.total, 4);
assert.equal(alertSummary.bySeverity.critica, 1);
assert.equal(alertSummary.bySeverity.alta, 1);
assert.equal(alertSummary.bySeverity.media, 1);
assert.equal(alertSummary.bySeverity.baixa, 1);

console.log("finance cockpit sprint8 tests passed");
