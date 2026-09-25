const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (value) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return time;
};

const today = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const rentalDays = (startDate, endDate) => (parseDate(endDate) - parseDate(startDate)) / DAY_MS + 1;

const rangesOverlap = (startA, endA, startB, endB) => startA <= endB && startB <= endA;

const rentalCost = (dailyRate, days) => Math.round(Number(dailyRate) * days * 100) / 100;

module.exports = { parseDate, today, rentalDays, rangesOverlap, rentalCost };
