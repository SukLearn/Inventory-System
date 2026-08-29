import { describe, expect, it } from "vitest";
import {
  businessDate,
  calculateReservationBalance,
  calculateSaleBalance,
  isValidDateOnly,
  nextDeliveryStatus,
  reportPeriodBounds,
  returnNote,
  returnStatus,
} from "./business";

describe("business dates", () => {
  it("uses the shop timezone instead of UTC", () => {
    const nearMidnightUtc = new Date("2026-08-28T21:30:00.000Z");
    expect(businessDate(nearMidnightUtc, "Asia/Tbilisi")).toBe("2026-08-29");
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
  });

  it("uses stable month, quarter, and year boundaries", () => {
    const date = new Date("2026-08-29T12:00:00.000Z");
    expect(reportPeriodBounds("MONTH", date)).toEqual({
      from: "2026-08-01",
      to: "2026-09-01",
    });
    expect(reportPeriodBounds("QUARTER", date)).toEqual({
      from: "2026-07-01",
      to: "2026-10-01",
    });
    expect(reportPeriodBounds("YEAR", date)).toEqual({
      from: "2026-01-01",
      to: "2027-01-01",
    });
  });
});

describe("sale balances", () => {
  it("uses money paid after refunds and removes returned merchandise", () => {
    expect(calculateSaleBalance(2400, 400, 400, 1200)).toEqual({
      effectiveTotal: 1200,
      paid: 0,
      remaining: 1200,
      paymentStatus: "UNPAID",
    });
  });

  it("closes a fully returned partially paid sale", () => {
    expect(calculateSaleBalance(1200, 400, 400, 1200)).toEqual({
      effectiveTotal: 0,
      paid: 0,
      remaining: 0,
      paymentStatus: "PAID",
    });
  });
});

describe("reservation balances", () => {
  it("treats the negotiated price as a unit price", () => {
    expect(calculateReservationBalance(5, 100, 100)).toEqual({
      total: 500,
      remaining: 400,
    });
  });
});

describe("return and delivery states", () => {
  it("uses the two-step delivery workflow", () => {
    expect(nextDeliveryStatus("READY")).toBe("IN_TRANSIT");
    expect(nextDeliveryStatus("IN_TRANSIT")).toBe("DELIVERED");
    expect(nextDeliveryStatus("DELIVERED")).toBe("DELIVERED");
  });

  it("calculates partial and full return statuses", () => {
    expect(returnStatus([{ quantity: 2, returned: 1 }])).toBe(
      "PARTIALLY_RETURNED",
    );
    expect(returnStatus([{ quantity: 2, returned: 2 }])).toBe("RETURNED");
  });

  it("formats auditable return notes", () => {
    expect(returnNote("Table", 1, "Damaged")).toBe(
      "RETURN | Table | Quantity: 1 | Notes: Damaged",
    );
  });
});
