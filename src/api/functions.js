import { base44 } from './base44Client';

// Exports as safe wrappers: some SDK builds may not expose `functions` at module-eval time
// so we avoid reading `base44.functions` directly during import to prevent
// "Cannot read properties of undefined" errors in the browser console.

const getFunctions = () => base44 && base44.functions ? base44.functions : null;

export const notificacoesOrcamento = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.notificacoesOrcamento !== 'function') {
		return Promise.reject(new Error('base44.functions.notificacoesOrcamento is not available'));
	}
	return f.notificacoesOrcamento(...args);
};

export const bancoInter = async (...args) => {
	const f = getFunctions();
	if (!f || typeof f.bancoInter !== 'function') {
		return Promise.reject(new Error('base44.functions.bancoInter is not available'));
	}
	return f.bancoInter(...args);
};

