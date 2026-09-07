export function businessDate(
  date = new Date(),
  timeZone = process.env.APP_TIMEZONE || "Asia/Tbilisi",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function shouldReserveSoldProduct(
  availableAtLocation: number,
  requestedQuantity: number,
) {
  return availableAtLocation < requestedQuantity;
}

export function isValidInvoiceCode(value: string) {
  return /^\d+$/.test(value);
}
