export const DOG_MEAL_LIMIT = 4;
export const DOG_REMINDER_LIMIT = 5;

export function createEmptyDogMeal() {
  return {
    qnt: "",
    horario: "",
    obs: "",
  };
}

export function createEmptyDogReminder() {
  return {
    nome: "",
    data: "",
  };
}

function normalizeMealEntry(meal) {
  return {
    qnt: String(meal?.qnt || meal?.quantidade || ""),
    horario: String(meal?.horario || ""),
    obs: String(meal?.obs || meal?.observacao || ""),
  };
}

function normalizeReminderEntry(reminder) {
  return {
    nome: String(reminder?.nome || reminder?.titulo || reminder?.label || ""),
    data: String(reminder?.data || reminder?.date || ""),
  };
}

export function isDogMealEmpty(meal) {
  const normalized = normalizeMealEntry(meal);
  return !normalized.qnt && !normalized.horario && !normalized.obs;
}

export function isDogMealComplete(meal) {
  const normalized = normalizeMealEntry(meal);
  return Boolean(normalized.qnt && normalized.horario);
}

export function isDogReminderEmpty(reminder) {
  const normalized = normalizeReminderEntry(reminder);
  return !normalized.nome && !normalized.data;
}

export function isDogReminderComplete(reminder) {
  const normalized = normalizeReminderEntry(reminder);
  return Boolean(normalized.nome && normalized.data);
}

function trimTrailingEmptyEntries(entries, isEmpty) {
  const nextEntries = [...entries];
  while (nextEntries.length > 0 && isEmpty(nextEntries[nextEntries.length - 1])) {
    nextEntries.pop();
  }
  return nextEntries;
}

export function ensureProgressiveDogMeals(meals) {
  const normalizedMeals = (Array.isArray(meals) ? meals : [])
    .slice(0, DOG_MEAL_LIMIT)
    .map(normalizeMealEntry);
  const nextMeals = trimTrailingEmptyEntries(normalizedMeals, isDogMealEmpty);

  if (nextMeals.length === 0) {
    return [createEmptyDogMeal()];
  }

  if (nextMeals.length < DOG_MEAL_LIMIT && isDogMealComplete(nextMeals[nextMeals.length - 1])) {
    nextMeals.push(createEmptyDogMeal());
  }

  return nextMeals;
}

export function ensureProgressiveDogReminders(reminders) {
  const normalizedReminders = (Array.isArray(reminders) ? reminders : [])
    .slice(0, DOG_REMINDER_LIMIT)
    .map(normalizeReminderEntry);
  const nextReminders = trimTrailingEmptyEntries(normalizedReminders, isDogReminderEmpty);

  if (nextReminders.length === 0) {
    return [createEmptyDogReminder()];
  }

  if (
    nextReminders.length < DOG_REMINDER_LIMIT
    && isDogReminderComplete(nextReminders[nextReminders.length - 1])
  ) {
    nextReminders.push(createEmptyDogReminder());
  }

  return nextReminders;
}

export function extractDogMeals(source) {
  if (Array.isArray(source?.refeicoes) && source.refeicoes.length > 0) {
    return ensureProgressiveDogMeals(source.refeicoes);
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

  return ensureProgressiveDogMeals(extractedMeals);
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

export function extractDogReminders(source) {
  const reminderCollection = source?.lembretes_importantes || source?.datas_importantes;
  if (Array.isArray(reminderCollection) && reminderCollection.length > 0) {
    return ensureProgressiveDogReminders(reminderCollection);
  }

  const extractedReminders = [];
  for (let index = 1; index <= DOG_REMINDER_LIMIT; index += 1) {
    const reminder = normalizeReminderEntry({
      nome: source?.[`nome_vacina_revacinacao_${index}`],
      data: source?.[`data_revacinacao_${index}`],
    });

    if (!isDogReminderEmpty(reminder)) {
      extractedReminders.push(reminder);
    }
  }

  return ensureProgressiveDogReminders(extractedReminders);
}

export function serializeDogReminders(reminders) {
  const normalizedReminders = Array.isArray(reminders)
    ? reminders.slice(0, DOG_REMINDER_LIMIT).map(normalizeReminderEntry)
    : [];
  const payload = {};

  for (let index = 1; index <= DOG_REMINDER_LIMIT; index += 1) {
    const reminder = normalizedReminders[index - 1] || createEmptyDogReminder();
    payload[`nome_vacina_revacinacao_${index}`] = reminder.nome || "";
    payload[`data_revacinacao_${index}`] = reminder.data || "";
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
