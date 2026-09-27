import { describe, expect, it } from "vitest";
import { getPlanPrice, plans } from "../src/pricing-data";

describe("pricing display math", () => {
  it("shows the full monthly rate without a discount when monthly billing is selected", () => {
    const prices = plans.map((plan) => getPlanPrice(plan, "monthly"));
    expect(prices.map((price) => price.monthlyEquivalent)).toEqual([7.5, 16, 36]);
    expect(prices.map((price) => price.total)).toEqual([7.5, 16, 36]);
    expect(prices.every((price) => price.discountPercent === 0)).toBe(true);
  });

  it("keeps annual totals and displayed savings mathematically consistent", () => {
    const prices = plans.map((plan) => getPlanPrice(plan, "yearly"));
    expect(prices.map((price) => price.total)).toEqual([54, 96, 216]);
    expect(prices.map((price) => price.discountPercent)).toEqual([40, 50, 50]);
  });
});
