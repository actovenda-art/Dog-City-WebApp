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
