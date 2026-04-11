export const UNIT_PAGE_POLICY = {
  Login: { mergedMode: "allowed", label: "Login" },
  AuthCallback: { mergedMode: "allowed", label: "Callback de autenticação" },
  CompletarCadastro: { mergedMode: "allowed", label: "Completar cadastro" },
  VisualizadorImagem: { mergedMode: "allowed", label: "Visualizador de imagem" },

  AdministracaoSistema: {
    mergedMode: "contextual",
    label: "Administração Central",
    description: "A visão unificada serve para contexto e comparação entre unidades. Cadastros e configurações continuam vinculados à unidade em acesso.",
  },
  Backup: {
    mergedMode: "read_only",
    label: "Backup",
    description: "A leitura pode considerar as unidades selecionadas, mas operações administrativas devem continuar por unidade.",
  },
  Agenda_Comercial: {
    mergedMode: "read_only",
    label: "Agenda Comercial",
    description: "A visão unificada é útil para consulta e comparação. Alterações operacionais devem ser feitas em uma unidade por vez.",
  },
  Cockpit: {
    mergedMode: "read_only",
    label: "Cockpit",
    description: "Indicadores agregados por múltiplas unidades podem ser exibidos juntos.",
  },
  ControleGerencial: {
    mergedMode: "read_only",
    label: "Controle Gerencial",
    description: "Os indicadores gerenciais podem ser consolidados entre unidades. Ações de cadastro permanecem restritas.",
  },
  Movimentacoes: {
    mergedMode: "read_only",
    label: "Transações",
    description: "A visão unificada exibe movimentações consolidadas. Criações, edições e exclusões permanecem bloqueadas.",
  },
  Receitas: {
    mergedMode: "read_only",
    label: "Receitas",
    description: "Receitas podem ser analisadas em conjunto. Ajustes manuais continuam individuais por unidade.",
  },
  Despesas: {
    mergedMode: "read_only",
    label: "Despesas",
    description: "Despesas podem ser analisadas em conjunto. Alterações seguem restritas à unidade em acesso.",
  },
  RelatoriosCaes: {
    mergedMode: "read_only",
    label: "Relatórios Cães",
    description: "Os relatórios podem consolidar cães de múltiplas unidades sem misturar escrituras de dados.",
  },

  Dev_Dashboard: {
    mergedMode: "single_only",
    label: "Gestão de Usuários",
    description: "Gestão de acessos e convites deve operar com uma única unidade para não misturar permissões.",
  },
  Registrador: {
    mergedMode: "single_only",
    label: "Registrador",
    description: "Check-in, check-out e rotinas operacionais acontecem por unidade e não podem ser unificados.",
  },
  Cadastro: {
    mergedMode: "single_only",
    label: "Cadastro",
    description: "Cadastros de cães, responsáveis e carteiras devem permanecer isolados por unidade.",
  },
  Planos: {
    mergedMode: "single_only",
    label: "Planos",
    description: "Planos e reposições precisam ser geridos em contexto de uma única unidade.",
  },
  ContasReceber: {
    mergedMode: "single_only",
    label: "Contas a Receber",
    description: "Cobrança e baixa financeira exigem contexto de uma única unidade.",
  },
  PedidosInternos: {
    mergedMode: "single_only",
    label: "Tarefas",
    description: "Pedidos internos e seus fluxos devem continuar vinculados à unidade em acesso.",
  },
  ContasPagar: {
    mergedMode: "single_only",
    label: "Contas a Pagar",
    description: "Contas a pagar exigem contexto individual para evitar quitações na unidade errada.",
  },
  PerfilCao: {
    mergedMode: "single_only",
    label: "Perfil do Cão",
    description: "A ficha individual do cão deve permanecer no contexto da unidade correta.",
  },
  Orcamentos: {
    mergedMode: "single_only",
    label: "Orçamentos",
    description: "Criação de orçamento, agendamentos e cobrança precisam continuar isolados por unidade.",
  },
  ConfiguracoesPrecos: {
    mergedMode: "single_only",
    label: "Configurações de Preços",
    description: "Tabelas de preços e descontos são parametrizações individuais por unidade.",
  },
  HistoricoOrcamentos: {
    mergedMode: "single_only",
    label: "Histórico de Orçamentos",
    description: "Reprocessamentos e mudanças de status do histórico devem seguir por unidade.",
  },
  Agendamentos: {
    mergedMode: "single_only",
    label: "Agendamentos",
    description: "Fila operacional, faltas e confirmações precisam de operação por unidade.",
  },
  PlanosConfig: {
    mergedMode: "single_only",
    label: "Planos Recorrentes",
    description: "Automação de planos, agendamentos e cobranças deve continuar individual por unidade.",
  },
  ServicosPrestados: {
    mergedMode: "single_only",
    label: "Serviços Prestados",
    description: "Lançamentos e confirmações de serviços prestados não devem ser unificados.",
  },
  ConfigurarIntegracoes: {
    mergedMode: "single_only",
    label: "Integrações",
    description: "Credenciais, certificados e rotinas automáticas do Banco Inter são estritamente por unidade.",
  },
};

export function getUnitPagePolicy(pageName) {
  return UNIT_PAGE_POLICY[pageName] || {
    mergedMode: "single_only",
    label: pageName,
    description: "Esta tela ainda não foi homologada para visão unificada.",
  };
}

export function isPageBlockedInMergedMode(pageName) {
  return getUnitPagePolicy(pageName).mergedMode === "single_only";
}

export function isPageReadOnlyInMergedMode(pageName) {
  return getUnitPagePolicy(pageName).mergedMode === "read_only";
}

export function isPageContextualInMergedMode(pageName) {
  return getUnitPagePolicy(pageName).mergedMode === "contextual";
}
