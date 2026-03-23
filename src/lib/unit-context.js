export const ACTIVE_UNIT_STORAGE_KEY = "dogcity_active_unit_id";
export const ACTIVE_UNIT_EVENT = "dogcity-active-unit-changed";

function normalizeText(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getStoredActiveUnitId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACTIVE_UNIT_STORAGE_KEY) || "";
}

export function setStoredActiveUnitId(unitId) {
  if (typeof window === "undefined") return;

  if (unitId) {
    window.localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, unitId);
  } else {
    window.localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent(ACTIVE_UNIT_EVENT, { detail: { unitId: unitId || "" } }));
}

export function clearStoredActiveUnitId() {
  setStoredActiveUnitId("");
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
