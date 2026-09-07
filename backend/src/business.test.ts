import { describe, expect, it } from "vitest";
import {
  businessDate,
  isValidInvoiceCode,
  isValidDateOnly,
  shouldReserveSoldProduct,
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
});

describe("sold-before-arrival inventory", () => {
  it("reserves the whole action when location stock is insufficient", () => {
    expect(shouldReserveSoldProduct(0, 1)).toBe(true);
    expect(shouldReserveSoldProduct(2, 3)).toBe(true);
  });

  it("subtracts immediately when the location has enough stock", () => {
    expect(shouldReserveSoldProduct(3, 3)).toBe(false);
    expect(shouldReserveSoldProduct(4, 3)).toBe(false);
  });
});

describe("invoice codes", () => {
  it("preserves and accepts leading zeroes", () => {
    expect(isValidInvoiceCode("00160")).toBe(true);
    expect(isValidInvoiceCode("0")).toBe(true);
  });

  it("still rejects non-digit invoice codes", () => {
    expect(isValidInvoiceCode("16A")).toBe(false);
    expect(isValidInvoiceCode("")).toBe(false);
  });
});
