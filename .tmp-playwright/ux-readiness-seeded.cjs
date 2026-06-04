const { chromium } = require('C:/Users/admin/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const baseUrl = 'http://127.0.0.1:4175';
const outDir = 'C:/Users/admin/Downloads/dog-city-brasil (1)/.tmp-playwright';

const appConfig = [
  { id: 'cfg_wallet_balance', key: 'finance.wallet_balance_read_enabled', empresa_id: 'empresa_demo', ativo: true, value: { enabled: true } },
  { id: 'cfg_wallet_movements', key: 'finance.wallet_movements_enabled', empresa_id: 'empresa_demo', ativo: true, value: { enabled: true } },
  { id: 'cfg_payment_write', key: 'finance.payment_v2_write_enabled', empresa_id: 'empresa_demo', ativo: true, value: { enabled: false } },
  { id: 'cfg_payment_reversal', key: 'finance.payment_v2_reversal_enabled', empresa_id: 'empresa_demo', ativo: true, value: { enabled: false } },
];

const dogs = [
  { id: 'dog_1', empresa_id: 'empresa_demo', nome: 'Bidu', raca: 'Shih-tzu', porte: 'Pequeno', ativo: true, created_date: '2026-05-01T10:00:00Z' },
];

const responsaveis = [
  { id: 'resp_1', empresa_id: 'empresa_demo', nome_completo: 'Maria Silva', celular: '11999999999', email: 'maria@teste.com', ativo: true, dog_id_1: 'dog_1', created_date: '2026-05-01T10:00:00Z' },
];

const carteiras = [
  { id: 'carteira_1', empresa_id: 'empresa_demo', nome_razao_social: 'Maria Silva', celular: '11999999999', email: 'maria@teste.com', cpf_cnpj: '123.456.789-00', vencimento_planos: '10', ativo: true, dog_id_1: 'dog_1', created_date: '2026-05-01T10:00:00Z' },
];

const contasReceber = [
  { id: 'cr_1', empresa_id: 'empresa_demo', carteira_id: 'carteira_1', cliente_id: 'carteira_1', appointment_id: 'appt_1', orcamento_id: 'orc_1', status: 'pendente', valor: 180, vencimento: '2026-05-20', created_date: '2026-05-20T10:00:00Z' },
];

const appointments = [
  { id: 'appt_1', empresa_id: 'empresa_demo', dog_id: 'dog_1', cliente_id: 'carteira_1', service_type: 'banho', source_type: 'manual_registrador', charge_type: 'avulso', status: 'agendado', data_referencia: '2026-06-02', hora_entrada: '09:00', hora_saida: '10:00', created_date: '2026-06-01T12:00:00Z' },
];

const orcamentos = [
  { id: 'orc_1', empresa_id: 'empresa_demo', cliente_id: 'carteira_1', status: 'aprovado', data_criacao: '2026-06-01', data_validade: '2026-06-10', valor_total: 220, subtotal_hospedagem: 0, subtotal_servicos: 220, subtotal_transporte: 0, desconto_total: 0, observacoes: 'Teste visual do aviso financeiro.', caes: [{ dog_id: 'dog_1', servicos: { banho: true }, banho_data: '2026-06-02', banho_horario_inicio: '09:00', banho_horario_saida: '10:00' }], created_date: '2026-06-01T12:00:00Z' },
];

const carteiraContas = [
  { id: 'conta_1', empresa_id: 'empresa_demo', carteira_id: 'carteira_1', saldo_atual: 180, ultimo_movimento_em: '2026-05-20T10:00:00Z', created_date: '2026-05-20T10:00:00Z' },
];

const carteiraMovimentos = [
  { id: 'mov_1', empresa_id: 'empresa_demo', carteira_conta_id: 'conta_1', tipo: 'credito_manual', natureza: 'entrada', origem: 'admin_manual', valor: 180, referencia_amigavel: 'Saldo inicial', descricao: 'Saldo inicial', saldo_anterior: 0, saldo_final: 180, created_date: '2026-05-20T10:00:00Z' },
];

const carteiraReconciliacoes = [
  { id: 'recon_1', empresa_id: 'empresa_demo', carteira_conta_id: 'conta_1', status: 'ok', diferenca: 0, created_date: '2026-05-21T10:00:00Z' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ appConfig, dogs, responsaveis, carteiras, contasReceber, appointments, orcamentos, carteiraContas, carteiraMovimentos, carteiraReconciliacoes }) => {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('local_app_client_'))
        .forEach((key) => localStorage.removeItem(key));
      localStorage.setItem('local_app_client_AppConfig', JSON.stringify(appConfig));
      localStorage.setItem('local_app_client_Dog', JSON.stringify(dogs));
      localStorage.setItem('local_app_client_Responsavel', JSON.stringify(responsaveis));
      localStorage.setItem('local_app_client_Carteira', JSON.stringify(carteiras));
      localStorage.setItem('local_app_client_ContaReceber', JSON.stringify(contasReceber));
      localStorage.setItem('local_app_client_Appointment', JSON.stringify(appointments));
      localStorage.setItem('local_app_client_Orcamento', JSON.stringify(orcamentos));
      localStorage.setItem('local_app_client_CarteiraConta', JSON.stringify(carteiraContas));
      localStorage.setItem('local_app_client_CarteiraMovimento', JSON.stringify(carteiraMovimentos));
      localStorage.setItem('local_app_client_CarteiraReconciliacao', JSON.stringify(carteiraReconciliacoes));
    }, { appConfig, dogs, responsaveis, carteiras, contasReceber, appointments, orcamentos, carteiraContas, carteiraMovimentos, carteiraReconciliacoes });

    await page.goto(`${baseUrl}/movimentacoes`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${outDir}/movimentacoes-codexmock-seeded-desktop.png`, fullPage: true });

    await page.goto(`${baseUrl}/perfis?tab=carteiras&id=carteira_1`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${outDir}/perfis-codexmock-seeded-desktop.png`, fullPage: true });

    await page.goto(`${baseUrl}/orcamentos?orcamentoId=orc_1`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${outDir}/orcamentos-codexmock-seeded-desktop.png`, fullPage: true });

    await page.goto(`${baseUrl}/agendamentos`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${outDir}/agendamentos-codexmock-seeded-desktop.png`, fullPage: true });

    await page.goto(`${baseUrl}/controle-gerencial`, { waitUntil: 'networkidle' });
    const receberTab = page.getByRole('tab', { name: 'A receber' });
    if (await receberTab.count()) {
      await receberTab.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: `${outDir}/controle-gerencial-codexmock-seeded-desktop.png`, fullPage: true });

    console.log('seeded screenshots complete');
  } finally {
    await browser.close();
  }
})();
