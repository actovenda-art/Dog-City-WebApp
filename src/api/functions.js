import { appClient } from './appClient';

// Exports as safe wrappers: some client builds may not expose `functions` at module-eval time
// so we avoid reading `appClient.functions` directly during import to prevent
// "Cannot read properties of undefined" errors in the browser console.

const getFunctions = () => appClient && appClient.functions ? appClient.functions : null;

export const notificacoesOrcamento = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.notificacoesOrcamento !== 'function') {
		return Promise.reject(new Error('appClient.functions.notificacoesOrcamento is not available'));
	}
	return f.notificacoesOrcamento(...args);
};

export const bancoInter = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.bancoInter !== 'function') {
		return Promise.reject(new Error('appClient.functions.bancoInter is not available'));
	}
	return f.bancoInter(...args);
};

export const clientRegistration = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.clientRegistration !== 'function') {
		return Promise.reject(new Error('appClient.functions.clientRegistration is not available'));
	}
	return f.clientRegistration(...args);
};

export const monitorRegistration = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.monitorRegistration !== 'function') {
		return Promise.reject(new Error('appClient.functions.monitorRegistration is not available'));
	}
	return f.monitorRegistration(...args);
};

export const responsavelApproval = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.responsavelApproval !== 'function') {
		return Promise.reject(new Error('appClient.functions.responsavelApproval is not available'));
	}
	return f.responsavelApproval(...args);
};

export const whatsappBridge = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.whatsappBridge !== 'function') {
		return Promise.reject(new Error('appClient.functions.whatsappBridge is not available'));
	}
	return f.whatsappBridge(...args);
};

export const financeShadowSync = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeShadowSync !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeShadowSync is not available'));
	}
	return f.financeShadowSync(...args);
};

export const getPublicGoogleReviewUrl = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.getPublicGoogleReviewUrl !== 'function') {
		return Promise.reject(new Error('appClient.functions.getPublicGoogleReviewUrl is not available'));
	}
	return f.getPublicGoogleReviewUrl(...args);
};

export const financeExpireBudgets = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeExpireBudgets !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeExpireBudgets is not available'));
	}
	return f.financeExpireBudgets(...args);
};

export const financeWalletAdminReadAccounts = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletAdminReadAccounts !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletAdminReadAccounts is not available'));
	}
	return f.financeWalletAdminReadAccounts(...args);
};

export const financeWalletAdminReadMovements = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletAdminReadMovements !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletAdminReadMovements is not available'));
	}
	return f.financeWalletAdminReadMovements(...args);
};

export const financeWalletAdminAuditAccounts = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletAdminAuditAccounts !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletAdminAuditAccounts is not available'));
	}
	return f.financeWalletAdminAuditAccounts(...args);
};

export const financeWalletAdminApplyOperation = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletAdminApplyOperation !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletAdminApplyOperation is not available'));
	}
	return f.financeWalletAdminApplyOperation(...args);
};

export const financeWalletReconcileAccount = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletReconcileAccount !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletReconcileAccount is not available'));
	}
	return f.financeWalletReconcileAccount(...args);
};

export const financeWalletBudgetReadContext = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWalletBudgetReadContext !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWalletBudgetReadContext is not available'));
	}
	return f.financeWalletBudgetReadContext(...args);
};

export const financePreviewBudgetConsumption = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePreviewBudgetConsumption !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePreviewBudgetConsumption is not available'));
	}
	return f.financePreviewBudgetConsumption(...args);
};

export const financeRegisterBudgetAuthorization = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeRegisterBudgetAuthorization !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeRegisterBudgetAuthorization is not available'));
	}
	return f.financeRegisterBudgetAuthorization(...args);
};

export const financeApproveBudgetWithAuthorization = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeApproveBudgetWithAuthorization !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeApproveBudgetWithAuthorization is not available'));
	}
	return f.financeApproveBudgetWithAuthorization(...args);
};

export const financeApplyCompensatoryCredit = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeApplyCompensatoryCredit !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeApplyCompensatoryCredit is not available'));
	}
	return f.financeApplyCompensatoryCredit(...args);
};

export const financeProcessCancellationV2 = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeProcessCancellationV2 !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeProcessCancellationV2 is not available'));
	}
	return f.financeProcessCancellationV2(...args);
};

export const financeProcessBudgetCancellationV2 = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeProcessBudgetCancellationV2 !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeProcessBudgetCancellationV2 is not available'));
	}
	return f.financeProcessBudgetCancellationV2(...args);
};

export const financeReportsV2Summary = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeReportsV2Summary !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeReportsV2Summary is not available'));
	}
	return f.financeReportsV2Summary(...args);
};

export const financeReportGenerationResources = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeReportGenerationResources !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeReportGenerationResources is not available'));
	}
	return f.financeReportGenerationResources(...args);
};

export const financeReportRealBilling = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeReportRealBilling !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeReportRealBilling is not available'));
	}
	return f.financeReportRealBilling(...args);
};

export const financeReportWallet = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeReportWallet !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeReportWallet is not available'));
	}
	return f.financeReportWallet(...args);
};

export const financeReportServicesProvided = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeReportServicesProvided !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeReportServicesProvided is not available'));
	}
	return f.financeReportServicesProvided(...args);
};

export const financeProcessCommissionForObrigacao = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeProcessCommissionForObrigacao !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeProcessCommissionForObrigacao is not available'));
	}
	return f.financeProcessCommissionForObrigacao(...args);
};

export const financeProcessCommissionForOrcamento = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeProcessCommissionForOrcamento !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeProcessCommissionForOrcamento is not available'));
	}
	return f.financeProcessCommissionForOrcamento(...args);
};

export const financeCockpitV2Context = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeCockpitV2Context !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeCockpitV2Context is not available'));
	}
	return f.financeCockpitV2Context(...args);
};

export const financeCockpitV2Summary = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeCockpitV2Summary !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeCockpitV2Summary is not available'));
	}
	return f.financeCockpitV2Summary(...args);
};

export const financeCockpitV2Compare = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeCockpitV2Compare !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeCockpitV2Compare is not available'));
	}
	return f.financeCockpitV2Compare(...args);
};

export const financeFinancialAlertsV2 = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeFinancialAlertsV2 !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeFinancialAlertsV2 is not available'));
	}
	return f.financeFinancialAlertsV2(...args);
};

export const financeWriteFlowMap = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWriteFlowMap !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWriteFlowMap is not available'));
	}
	return f.financeWriteFlowMap(...args);
};

export const financeWriteGovernanceMatrix = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeWriteGovernanceMatrix !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeWriteGovernanceMatrix is not available'));
	}
	return f.financeWriteGovernanceMatrix(...args);
};

export const financeOperationalObservabilityContext = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeOperationalObservabilityContext !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeOperationalObservabilityContext is not available'));
	}
	return f.financeOperationalObservabilityContext(...args);
};

export const financeHybridWriteAudit = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeHybridWriteAudit !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeHybridWriteAudit is not available'));
	}
	return f.financeHybridWriteAudit(...args);
};

export const financeOperationalReconciliationMatrix = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financeOperationalReconciliationMatrix !== 'function') {
		return Promise.reject(new Error('appClient.functions.financeOperationalReconciliationMatrix is not available'));
	}
	return f.financeOperationalReconciliationMatrix(...args);
};

export const financePaymentV2Contract = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePaymentV2Contract !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePaymentV2Contract is not available'));
	}
	return f.financePaymentV2Contract(...args);
};

export const financePaymentV2Execute = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePaymentV2Execute !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePaymentV2Execute is not available'));
	}
	return f.financePaymentV2Execute(...args);
};

export const financePaymentV2ExecutionAudit = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePaymentV2ExecutionAudit !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePaymentV2ExecutionAudit is not available'));
	}
	return f.financePaymentV2ExecutionAudit(...args);
};

export const financePaymentV2Reverse = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePaymentV2Reverse !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePaymentV2Reverse is not available'));
	}
	return f.financePaymentV2Reverse(...args);
};

export const financePaymentV2ReversalAudit = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.financePaymentV2ReversalAudit !== 'function') {
		return Promise.reject(new Error('appClient.functions.financePaymentV2ReversalAudit is not available'));
	}
	return f.financePaymentV2ReversalAudit(...args);
};
