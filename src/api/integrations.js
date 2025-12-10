import { base44 } from './base44Client';




const getIntegrations = () => (base44 && base44.integrations) ? base44.integrations : null;

const getCore = () => {
	const i = getIntegrations();
	return i && i.Core ? i.Core : null;
};

export const InvokeLLM = async (...args) => {
	const core = getCore();
	if (!core || typeof core.InvokeLLM !== 'function') return Promise.reject(new Error('integrations.Core.InvokeLLM not available'));
	return core.InvokeLLM(...args);
};

export const SendEmail = async (...args) => {
	const core = getCore();
	if (!core || typeof core.SendEmail !== 'function') return Promise.reject(new Error('integrations.Core.SendEmail not available'));
	return core.SendEmail(...args);
};

export const UploadFile = async (...args) => {
	const core = getCore();
	if (!core || typeof core.UploadFile !== 'function') return Promise.reject(new Error('integrations.Core.UploadFile not available'));
	return core.UploadFile(...args);
};

export const GenerateImage = async (...args) => {
	const core = getCore();
	if (!core || typeof core.GenerateImage !== 'function') return Promise.reject(new Error('integrations.Core.GenerateImage not available'));
	return core.GenerateImage(...args);
};

export const ExtractDataFromUploadedFile = async (...args) => {
	const core = getCore();
	if (!core || typeof core.ExtractDataFromUploadedFile !== 'function') return Promise.reject(new Error('integrations.Core.ExtractDataFromUploadedFile not available'));
	return core.ExtractDataFromUploadedFile(...args);
};

export const CreateFileSignedUrl = async (...args) => {
	const core = getCore();
	if (!core || typeof core.CreateFileSignedUrl !== 'function') return Promise.reject(new Error('integrations.Core.CreateFileSignedUrl not available'));
	return core.CreateFileSignedUrl(...args);
};

export const UploadPrivateFile = async (...args) => {
	const core = getCore();
	if (!core || typeof core.UploadPrivateFile !== 'function') return Promise.reject(new Error('integrations.Core.UploadPrivateFile not available'));
	return core.UploadPrivateFile(...args);
};

export const Core = {
	InvokeLLM,
	SendEmail,
	UploadFile,
	GenerateImage,
	ExtractDataFromUploadedFile,
	CreateFileSignedUrl,
	UploadPrivateFile
};






