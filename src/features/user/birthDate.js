export function normalizeBirthDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(value))
    return "";
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return "";
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day > monthDays[month - 1]) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isValidBirthDate(value) {
  return Boolean(normalizeBirthDate(value));
}
