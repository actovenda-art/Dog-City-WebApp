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
