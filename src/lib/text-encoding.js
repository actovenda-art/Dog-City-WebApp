const LEGACY_UTF8_REPLACEMENTS = [
  ["Ã§", "ç"],
  ["Ã£", "ã"],
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã¢", "â"],
  ["Ãª", "ê"],
  ["Ã´", "ô"],
  ["Ãµ", "õ"],
  ["Ã‡", "Ç"],
  ["Ãƒ", "Ã"],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Â ", " "],
];

export function normalizeLegacyUtf8Text(value) {
  if (typeof value !== "string" || !value) return value || "";
  return LEGACY_UTF8_REPLACEMENTS.reduce(
    (text, [corrupted, normalized]) => text.split(corrupted).join(normalized),
    value,
  );
}
