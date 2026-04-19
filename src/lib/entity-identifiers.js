const INTERNAL_ENTITY_CODE_CONFIG = Object.freeze({
  Dog: { sigla: "CAO" },
  Responsavel: { sigla: "RES" },
  Carteira: { sigla: "FINC" },
});

function normalizeDocumentDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getRecordUnitToken(record = {}) {
  return (
    record?.empresa_codigo
    || record?.empresaCode
    || record?.unit_code
    || record?.unitCode
    || record?.empresa_id
    || record?.empresaId
    || ""
  );
}

function buildCodeKeyPrefix(unitCode, sigla) {
  return `${normalizeEntityUnitCode(unitCode)}-${sigla}-`;
}

export function normalizeEntityUnitCode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  return normalized || "00";
}

export function normalizeInternalEntityCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function getInternalEntityCode(record) {
  return normalizeInternalEntityCode(record?.codigo);
}

export function getInternalEntityReference(record) {
  return getInternalEntityCode(record) || String(record?.id || "").trim();
}

export function matchesEntityReference(record, reference) {
  const normalizedReference = normalizeInternalEntityCode(reference);
  if (!normalizedReference) return false;

  const normalizedId = normalizeInternalEntityCode(record?.id);
  return normalizedReference === getInternalEntityCode(record) || normalizedReference === normalizedId;
}

export function findEntityByReference(records, reference) {
  return (records || []).find((record) => matchesEntityReference(record, reference)) || null;
}

export function hasInternalEntityCodeConfig(entityName) {
  return Boolean(INTERNAL_ENTITY_CODE_CONFIG[entityName]);
}

export function extractEntityDocumentSuffix(value) {
  const digits = normalizeDocumentDigits(value);
  if (!digits) return "";
  return digits.slice(-5).padStart(5, "0");
}

export function buildInternalEntityCode({
  entityName,
  record = {},
  existingRecords = [],
  unitCode = "",
}) {
  const config = INTERNAL_ENTITY_CODE_CONFIG[entityName];
  if (!config) return "";

  const resolvedUnitCode = normalizeEntityUnitCode(unitCode || getRecordUnitToken(record));
  const currentId = String(record?.id || "").trim();
  const otherRecords = (existingRecords || []).filter((item) => String(item?.id || "").trim() !== currentId);
  const existingCodes = new Set(otherRecords.map((item) => getInternalEntityCode(item)).filter(Boolean));

  if (entityName === "Dog") {
    const prefix = buildCodeKeyPrefix(resolvedUnitCode, config.sigla);
    const nextSequence = otherRecords.reduce((currentMax, item) => {
      const code = getInternalEntityCode(item);
      if (!code.startsWith(prefix)) return currentMax;

      const suffix = Number.parseInt(code.slice(prefix.length), 10);
      return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax;
    }, 0) + 1;

    return `${prefix}${nextSequence}`;
  }

  const documentValue = entityName === "Responsavel" ? record?.cpf : record?.cpf_cnpj;
  const baseSuffix = extractEntityDocumentSuffix(documentValue);

  let fallbackCounter = otherRecords.reduce((currentMax, item) => {
    const itemDocumentValue = entityName === "Responsavel" ? item?.cpf : item?.cpf_cnpj;
    if (extractEntityDocumentSuffix(itemDocumentValue)) return currentMax;

    const itemCode = getInternalEntityCode(item);
    const prefix = buildCodeKeyPrefix(resolvedUnitCode, config.sigla);
    if (!itemCode.startsWith(prefix)) return currentMax;

    const itemSuffix = itemCode.slice(prefix.length).split("-")[0];
    const numericSuffix = Number.parseInt(itemSuffix, 10);
    return Number.isFinite(numericSuffix) ? Math.max(currentMax, numericSuffix) : currentMax;
  }, 0);

  const suffix = baseSuffix || String(fallbackCounter + 1).padStart(5, "0");
  const baseCode = `${resolvedUnitCode}-${config.sigla}-${suffix}`;

  if (!existingCodes.has(baseCode)) {
    return baseCode;
  }

  let collisionIndex = 2;
  let candidateCode = `${baseCode}-${collisionIndex}`;
  while (existingCodes.has(candidateCode)) {
    collisionIndex += 1;
    candidateCode = `${baseCode}-${collisionIndex}`;
  }

  return candidateCode;
}
