export const DOG_MEAL_LIMIT = 4;

export function createEmptyDogMeal() {
  return {
    qnt: "",
    horario: "",
    obs: "",
  };
}

function normalizeMealEntry(meal) {
  return {
    qnt: String(meal?.qnt || ""),
    horario: String(meal?.horario || ""),
    obs: String(meal?.obs || ""),
  };
}

export function extractDogMeals(source) {
  if (Array.isArray(source?.refeicoes) && source.refeicoes.length > 0) {
    return source.refeicoes
      .slice(0, DOG_MEAL_LIMIT)
      .map(normalizeMealEntry);
  }

  const extractedMeals = [];
  for (let index = 1; index <= DOG_MEAL_LIMIT; index += 1) {
    const meal = normalizeMealEntry({
      qnt: source?.[`refeicao_${index}_qnt`],
      horario: source?.[`refeicao_${index}_horario`],
      obs: source?.[`refeicao_${index}_obs`],
    });

    if (meal.qnt || meal.horario || meal.obs) {
      extractedMeals.push(meal);
    }
  }

  return extractedMeals.length > 0 ? extractedMeals : [createEmptyDogMeal()];
}

export function serializeDogMeals(meals) {
  const normalizedMeals = Array.isArray(meals)
    ? meals.slice(0, DOG_MEAL_LIMIT).map(normalizeMealEntry)
    : [];

  const payload = {};
  for (let index = 1; index <= DOG_MEAL_LIMIT; index += 1) {
    const meal = normalizedMeals[index - 1] || createEmptyDogMeal();
    payload[`refeicao_${index}_qnt`] = meal.qnt || "";
    payload[`refeicao_${index}_horario`] = meal.horario || "";
    payload[`refeicao_${index}_obs`] = meal.obs || "";
  }

  return payload;
}

export function isNaturalFoodType(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("natural");
}
