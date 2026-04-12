export const DEFAULT_BOOTSTRAP_PIN = "654321";

export function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

export function isSequentialPin(value) {
  const pin = normalizePin(value);
  if (pin.length !== 6) return false;

  let ascending = true;
  let descending = true;

  for (let index = 1; index < pin.length; index += 1) {
    const current = Number(pin[index]);
    const previous = Number(pin[index - 1]);

    if (current !== previous + 1) ascending = false;
    if (current !== previous - 1) descending = false;
  }

  return ascending || descending;
}

export function validatePin(pin) {
  const normalized = normalizePin(pin);

  if (normalized.length !== 6) {
    return "A senha deve conter 6 numeros.";
  }

  if (isSequentialPin(normalized)) {
    return "A senha nao pode ser sequencial.";
  }

  return "";
}
