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
