export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type DeliveryStatus = "IN_TRANSIT" | "DELIVERED";
export type ReturnStatus =
  | "COMPLETED"
  | "PARTIALLY_RETURNED"
  | "RETURNED";
export type ReportPeriod = "MONTH" | "QUARTER" | "YEAR";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

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

function formatDateOnly(year: number, month: number, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function reportPeriodBounds(
  period: ReportPeriod,
  date = new Date(),
  timeZone = process.env.APP_TIMEZONE || "Asia/Tbilisi",
) {
  const [year, month] = businessDate(date, timeZone).split("-").map(Number);
  const startMonth =
    period === "YEAR"
      ? 1
      : period === "QUARTER"
        ? Math.floor((month - 1) / 3) * 3 + 1
        : month;
  const months = period === "YEAR" ? 12 : period === "QUARTER" ? 3 : 1;
  const endIndex = startMonth - 1 + months;
  const endYear = year + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;

  return {
    from: formatDateOnly(year, startMonth),
    to: formatDateOnly(endYear, endMonth),
  };
}

export function calculateSaleBalance(
  total: number,
  grossPaid: number,
  refunded: number,
  returnedValue: number,
) {
  const effectiveTotal = Math.max(0, roundMoney(total - returnedValue));
  const paid = Math.max(0, roundMoney(grossPaid - refunded));
  const remaining = Math.max(0, roundMoney(effectiveTotal - paid));
  const paymentStatus: PaymentStatus =
    paid <= 0
      ? effectiveTotal === 0
        ? "PAID"
        : "UNPAID"
      : paid >= effectiveTotal
        ? "PAID"
        : "PARTIALLY_PAID";

  return { effectiveTotal, paid, remaining, paymentStatus };
}

export function calculateReservationBalance(
  quantity: number,
  unitPrice: number,
  deposit: number,
) {
  const total = roundMoney(quantity * unitPrice);
  return {
    total,
    remaining: Math.max(0, roundMoney(total - deposit)),
  };
}

export function nextDeliveryStatus(current: string): DeliveryStatus {
  return current === "IN_TRANSIT" || current === "DELIVERED"
    ? "DELIVERED"
    : "IN_TRANSIT";
}

export function returnStatus(
  items: Array<{ quantity: number; returned: number }>,
): ReturnStatus {
  if (items.length && items.every((item) => item.returned >= item.quantity))
    return "RETURNED";
  if (items.some((item) => item.returned > 0)) return "PARTIALLY_RETURNED";
  return "COMPLETED";
}

export function returnNote(
  productName: string,
  quantity: number,
  notes: string,
) {
  return `RETURN | ${productName} | Quantity: ${quantity} | Notes: ${notes}`;
}
