import { BigDecimal, Result } from "effect";
import { describe, expect, it } from "vitest";

import { calculateTotals, formatDecimal, parsePrice } from "#src/money.ts";

const totals = (...prices: ReadonlyArray<string>) =>
  calculateTotals(prices.map((price) => Result.getOrThrow(parsePrice(price))));

describe("exact receipt amounts", () => {
  it("sums decimal prices without binary floating-point drift", () => {
    expect(totals("0.10", "0.20")).toEqual({ subtotal: "0.30", tax: "0.04", total: "0.34" });
  });

  it("rounds tax once to cents with ties away from zero", () => {
    expect(totals("1.50")).toEqual({ subtotal: "1.50", tax: "0.20", total: "1.70" });
    // 0.50 * 0.13 = 0.065 exactly, a tie.
    expect(totals("0.50")).toEqual({ subtotal: "0.50", tax: "0.07", total: "0.57" });
    // Rounding the subtotal's tax once differs from summing per-item rounded taxes (0.01 + 0.01).
    expect(totals("0.05", "0.05")).toEqual({ subtotal: "0.10", tax: "0.01", total: "0.11" });
  });

  it("keeps the subtotal and item precision while totals reach at least cents", () => {
    expect(totals("5")).toEqual({ subtotal: "5", tax: "0.65", total: "5.65" });
    expect(totals("0.001", "0")).toEqual({ subtotal: "0.001", tax: "0.00", total: "0.001" });
    expect(totals("0")).toEqual({ subtotal: "0", tax: "0.00", total: "0.00" });
  });

  it("does not lose digits from high-precision input", () => {
    expect(totals("12345678901234567890.123456789", "0.000000001")).toEqual({
      subtotal: "12345678901234567890.123456790",
      tax: "1604938257160493825.72",
      total: "13950617158395061715.843456790",
    });
  });
});

describe("price parsing", () => {
  it("accepts DecimalString-compatible text and renders plain decimals", () => {
    const render = (text: string) => formatDecimal(Result.getOrThrow(parsePrice(text)));
    expect(render(" 0.10 ")).toBe("0.10");
    expect(render("007")).toBe("7");
    expect(render("1.5e1")).toBe("15");
    expect(render("1E2")).toBe("100");
    expect(render("2.5e-3")).toBe("0.0025");
    expect(render("-1.00")).toBe("-1.00");
    expect(render("-0.00")).toBe("0.00");
  });

  it("rejects non-decimal and unstorable prices", () => {
    for (const text of ["$5", "1,000", "+5", "abc", ".5", "5.", "NaN", "Infinity", "1e"]) {
      expect(Result.isFailure(parsePrice(text))).toBe(true);
    }
    expect(parsePrice(" ")).toEqual(Result.fail("price is required"));
    expect(parsePrice("1e-20000")).toEqual(
      Result.fail('price "1e-20000" is outside the storable numeric range'),
    );
    expect(parsePrice("1e200000")).toEqual(
      Result.fail('price "1e200000" is outside the storable numeric range'),
    );
  });

  it("never converts values through JavaScript numbers", () => {
    const value = Result.getOrThrow(parsePrice("0.1000000000000000055511151231257827"));
    expect(value).toEqual(BigDecimal.make(1000000000000000055511151231257827n, 34));
  });
});
