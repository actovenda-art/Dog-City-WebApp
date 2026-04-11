export const ACTIVE_UNIT_STORAGE_KEY = "dogcity_active_unit_id";
export const ACTIVE_UNIT_SELECTION_STORAGE_KEY = "dogcity_unit_selection_v1";
export const ACTIVE_UNIT_EVENT = "dogcity-active-unit-changed";

function normalizeText(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUnitId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUnitIds(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeUnitId).filter(Boolean))];
}

function buildSelectionState(input = {}) {
  const primaryUnitId = normalizeUnitId(input.primaryUnitId || input.unitId || "");
  const selectedUnitIds = normalizeUnitIds([
    primaryUnitId,
    ...(Array.isArray(input.selectedUnitIds) ? input.selectedUnitIds : []),
  ]);
  const resolvedPrimaryUnitId = primaryUnitId || selectedUnitIds[0] || "";
  const resolvedSelectedUnitIds = normalizeUnitIds([
    resolvedPrimaryUnitId,
    ...selectedUnitIds,
  ]);

  return {
    primaryUnitId: resolvedPrimaryUnitId,
    selectedUnitIds: resolvedSelectedUnitIds,
    mode: resolvedSelectedUnitIds.length > 1 ? "merged" : "single",
  };
}

function areSelectionsEqual(left, right) {
  if ((left?.primaryUnitId || "") !== (right?.primaryUnitId || "")) {
    return false;
  }

  const leftIds = Array.isArray(left?.selectedUnitIds) ? left.selectedUnitIds : [];
  const rightIds = Array.isArray(right?.selectedUnitIds) ? right.selectedUnitIds : [];

  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((value, index) => value === rightIds[index]);
}

export function getStoredUnitSelection() {
  if (typeof window === "undefined") {
    return buildSelectionState();
  }

  try {
    const rawSelection = window.localStorage.getItem(ACTIVE_UNIT_SELECTION_STORAGE_KEY);
    if (rawSelection) {
      return buildSelectionState(JSON.parse(rawSelection));
    }
  } catch {
    // Ignore malformed local state and fall back to legacy storage.
  }

  return buildSelectionState({
    primaryUnitId: window.localStorage.getItem(ACTIVE_UNIT_STORAGE_KEY) || "",
  });
}

export function getStoredActiveUnitId() {
  return getStoredUnitSelection().primaryUnitId;
}

export function getStoredSelectedUnitIds() {
  return getStoredUnitSelection().selectedUnitIds;
}

export function isStoredUnitUnionMode() {
  return getStoredUnitSelection().mode === "merged";
}

export function setStoredUnitSelection(selection) {
  if (typeof window === "undefined") return;

  const normalized = buildSelectionState(selection);
  const current = getStoredUnitSelection();
  const hasChanged = !areSelectionsEqual(current, normalized);

  if (normalized.primaryUnitId) {
    window.localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, normalized.primaryUnitId);
    window.localStorage.setItem(ACTIVE_UNIT_SELECTION_STORAGE_KEY, JSON.stringify(normalized));
  } else {
    window.localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_UNIT_SELECTION_STORAGE_KEY);
  }

  if (!hasChanged) return;

  window.dispatchEvent(new CustomEvent(ACTIVE_UNIT_EVENT, {
    detail: {
      unitId: normalized.primaryUnitId || "",
      primaryUnitId: normalized.primaryUnitId || "",
      selectedUnitIds: normalized.selectedUnitIds,
      mode: normalized.mode,
    },
  }));
}

export function setStoredActiveUnitId(unitId) {
  setStoredUnitSelection({
    primaryUnitId: unitId,
    selectedUnitIds: unitId ? [unitId] : [],
  });
}

export function clearStoredActiveUnitId() {
  setStoredUnitSelection({
    primaryUnitId: "",
    selectedUnitIds: [],
  });
}

export function addStoredSelectedUnitId(unitId) {
  const current = getStoredUnitSelection();
  setStoredUnitSelection({
    primaryUnitId: current.primaryUnitId || unitId,
    selectedUnitIds: [...current.selectedUnitIds, unitId],
  });
}

export function removeStoredSelectedUnitId(unitId) {
  const current = getStoredUnitSelection();
  const selectedUnitIds = current.selectedUnitIds.filter((item) => item !== unitId);
  setStoredUnitSelection({
    primaryUnitId: selectedUnitIds[0] || "",
    selectedUnitIds,
  });
}

export function resolveDogCityUnit(units = []) {
  if (!Array.isArray(units) || units.length === 0) return null;

  return units.find((unit) => normalizeText(unit.slug) === "dog-city")
    || units.find((unit) => normalizeText(unit.codigo) === "dogcity")
    || units.find((unit) => normalizeText(unit.nome_fantasia).includes("dog city"))
    || units[0]
    || null;
}

export function getUnitDisplayName(unit) {
  return unit?.nome_fantasia || "Dog City Brasil";
}
