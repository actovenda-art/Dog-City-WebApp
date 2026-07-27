export const NO_INFORMATION_VALUE = "Não possui";

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function usesNaturalFood(dog) {
  if (typeof dog?.alimentacao_natural === "boolean") return dog.alimentacao_natural;
  return String(dog?.alimentacao_tipo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("natural");
}

export function validateDogNutrition(dog) {
  if (!usesNaturalFood(dog)) {
    if (!hasValue(dog?.alimentacao_marca_racao)) return "Informe a marca da ração.";
    if (!hasValue(dog?.alimentacao_sabor)) return "Informe o sabor da ração.";
    if (!hasValue(dog?.alimentacao_tipo)) return "Informe o tipo da ração.";
  }

  const meals = Array.isArray(dog?.refeicoes) ? dog.refeicoes : [];
  if (meals.length === 0) {
    return "Informe ao menos uma refeição com quantidade e horário.";
  }

  if (meals.some((meal) => !hasValue(meal?.qnt) || !hasValue(meal?.horario))) {
    return "Preencha a quantidade e o horário de todas as refeições adicionadas.";
  }

  return "";
}

export function validateDogCare(dog) {
  const veterinarianFields = [
    dog?.veterinario_responsavel,
    dog?.veterinario_horario_atendimento,
    dog?.veterinario_telefone,
  ];
  const hasNoVeterinarian = veterinarianFields.every((value) => value === NO_INFORMATION_VALUE);
  const hasPartialVeterinarian = veterinarianFields.some((value) => value === NO_INFORMATION_VALUE);

  if (!hasNoVeterinarian && (hasPartialVeterinarian || veterinarianFields.some((value) => !hasValue(value)))) {
    return 'Preencha nome, horário e telefone do veterinário ou marque "Não possui".';
  }

  const requiredFields = [
    ["alergias", "as alergias"],
    ["restricoes_cuidados", "as restrições e os cuidados"],
    ["veterinario_clinica_telefone", "o telefone da clínica"],
    ["veterinario_endereco", "o endereço veterinário ou da clínica"],
  ];

  const missingField = requiredFields.find(([field]) => !hasValue(dog?.[field]));
  if (missingField) {
    return `Informe ${missingField[1]} ou marque "Não possui".`;
  }

  const medications = Array.isArray(dog?.medicamentos_continuos) ? dog.medicamentos_continuos : [];
  if (medications.length === 0) return "";

  if (medications.some((item) => (
    !hasValue(item?.especificacoes)
    || !hasValue(item?.cuidados)
    || !hasValue(item?.horario)
    || !hasValue(item?.dose)
  ))) {
    return 'Preencha todos os dados dos medicamentos ou marque "Não possui".';
  }

  return "";
}

export function validateDogOperationalProfile(dog) {
  return validateDogNutrition(dog) || validateDogCare(dog);
}
