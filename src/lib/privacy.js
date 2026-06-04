function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function maskCpfCnpj(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";

  if (digits.length <= 11) {
    const visibleSuffix = digits.slice(-2).padStart(2, "•");
    return `•••.•••.•••-${visibleSuffix}`;
  }

  const visibleSuffix = digits.slice(-2).padStart(2, "•");
  return `••.•••.•••/••••-${visibleSuffix}`;
}

export function maskPhone(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";

  const ddd = digits.slice(0, 2);
  const suffix = digits.slice(-2);
  const prefixLength = Math.max(digits.length - 4, 0);
  const prefix = "•".repeat(prefixLength);
  const middle = digits.length > 10 ? `${prefix.slice(0, 5)}-${prefix.slice(5)}` : `${prefix.slice(0, 4)}-${prefix.slice(4)}`;
  return `(${ddd}) ${middle.replace(/^-/, "")}${suffix ? `${middle.includes("-") ? "" : "-"}${suffix}` : ""}`
    .replace(/\s+-/, " ")
    .replace(/--+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function maskEmail(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const [localPart, domain = ""] = normalized.split("@");
  if (!domain) return normalized;
  const visibleLocal = localPart.slice(0, 2);
  const [domainName, domainTld = ""] = domain.split(".");
  const visibleDomain = domainName ? `${domainName.slice(0, 1)}${"•".repeat(Math.max(domainName.length - 1, 2))}` : "••";
  return `${visibleLocal}${"•".repeat(Math.max(localPart.length - visibleLocal.length, 2))}@${visibleDomain}${domainTld ? `.${domainTld}` : ""}`;
}

export function maskPostalCode(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const visibleSuffix = digits.slice(-3).padStart(3, "•");
  return `•••••-${visibleSuffix}`;
}

export function formatAddressParts(parts = []) {
  return parts.filter(Boolean).join(" • ");
}

export function maskAddressParts(parts = []) {
  const [street, number, neighborhood, city, state, postalCode] = parts;
  return formatAddressParts([
    street ? `${String(street).slice(0, 3)}•••` : "",
    number ? "••" : "",
    neighborhood ? `${String(neighborhood).slice(0, 3)}•••` : "",
    city || "",
    state || "",
    postalCode ? maskPostalCode(postalCode) : "",
  ]);
}

export function maskSensitiveValue(value, maskFn, canViewFull) {
  if (!value) return "";
  return canViewFull ? String(value) : maskFn(String(value));
}
