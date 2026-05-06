export function sanitizeDisplayNameInput(value) {
  return String(value || "")
    .replace(/[^\p{L}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s+/g, "");
}

export function formatDisplayName(value) {
  return sanitizeDisplayNameInput(value)
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (/^[-']$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`))
        .join("")
    )
    .join(" ");
}

export function isCompletePersonName(value) {
  const words = formatDisplayName(value)
    .split(" ")
    .filter(Boolean);

  if (words.length < 2) {
    return false;
  }

  const connectiveWords = new Set(["da", "de", "do", "das", "dos", "e"]);

  return words.every((word) => {
    const normalizedWord = word.replace(/[-']/g, "").trim();
    return normalizedWord.length >= 2 || connectiveWords.has(normalizedWord.toLowerCase());
  });
}
