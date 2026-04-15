import { clientRegistration } from "@/api/functions";

export function normalizeCpfDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

export function normalizeFirstName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)[0] || "";
}

export function isValidCpfChecksum(value) {
  const cpf = normalizeCpfDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;

  return check === Number(cpf[10]);
}

export async function validateCpfWithGov({ cpf, fullName }) {
  const normalizedCpf = normalizeCpfDigits(cpf);
  const normalizedName = String(fullName || "").trim();

  if (!normalizedCpf || !normalizedName) {
    return {
      shouldBlock: false,
      configured: false,
      message: "",
      validFormat: false,
      firstNameMatches: null,
    };
  }

  if (!isValidCpfChecksum(normalizedCpf)) {
    return {
      shouldBlock: true,
      configured: true,
      message: "CPF inválido.",
      validFormat: false,
      firstNameMatches: false,
    };
  }

  const result = await clientRegistration({
    action: "verify_cpf",
    cpf: normalizedCpf,
    full_name: normalizedName,
  });

  if (result?.configured === false) {
    return {
      shouldBlock: false,
      configured: false,
      message: "",
      validFormat: true,
      firstNameMatches: null,
      apiName: "",
    };
  }

  if (result?.valid_format === false) {
    return {
      shouldBlock: true,
      configured: true,
      message: "CPF inválido.",
      validFormat: false,
      firstNameMatches: false,
    };
  }

  if (result?.first_name_matches === false) {
    return {
      shouldBlock: true,
      configured: true,
      message: `O primeiro nome não confere com o retorno da API GOV${result?.api_name ? ` (${result.api_name})` : ""}.`,
      validFormat: true,
      firstNameMatches: false,
      apiName: result?.api_name || "",
    };
  }

  return {
    shouldBlock: false,
    configured: true,
    message: "",
    validFormat: true,
    firstNameMatches: true,
    apiName: result?.api_name || "",
  };
}
