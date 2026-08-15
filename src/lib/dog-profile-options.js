export const DOG_COAT_OPTIONS = ["Curto", "Médio", "Longo"];

export const DOG_COLOR_OPTIONS = [
  "Amarelo",
  "Beje",
  "Preto",
  "Marrom",
  "Branco",
  "Laranja",
  "Cobre",
  "Dourado",
  "Ouro Claro",
  "Palha",
  "Creme",
  "Cinza",
  "Prata",
  "Cinza azulado",
  "Azul acinzentado",
  "Chocolate Diluido",
];

export function parseSelectedDogColors(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  const rawValue = String(value || "").trim();
  if (!rawValue) return [];

  return [...new Set(
    rawValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function serializeSelectedDogColors(colors) {
  return parseSelectedDogColors(colors).join(", ");
}
