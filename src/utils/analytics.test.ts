import { createSeedSnapshot } from "../data/seed";
import { Transaction } from "../types/finance";
import {
  categoryTotals,
  getMonthTransactions,
  remainingBudget,
  totalSpent,
} from "./analytics";
import { formatDate, monthKey, monthLabel, todayISO } from "./dates";
import { formatMoney } from "./money";
import { budgetSchema, expenseSchema } from "./validation";

const validExpense = {
  amount: 3500,
  categoryId: "food",
  paymentMethod: "card" as const,
  occurredAt: "2026-09-30",
  note: "Lunch",
};

describe("budget analytics", () => {
  const snapshot = createSeedSnapshot(new Date(2026, 8, 30));
  const month = getMonthTransactions(snapshot.transactions, "2026-09");

  it("keeps the current month at the promised total and excludes older expenses", () => {
    expect(totalSpent(month)).toBe(77650);
    expect(remainingBudget(snapshot.profile.monthlyBudget, month)).toBe(42350);
    expect(totalSpent(snapshot.transactions)).toBe(83750);
  });

  it("counts every transaction in exactly one category", () => {
    const totals = categoryTotals(month, snapshot.categories);
    expect(totals.reduce((total, category) => total + category.spent, 0)).toBe(
      totalSpent(month),
    );
    expect(totals.find((category) => category.id === "food")?.spent).toBe(
      31800,
    );
  });

  it("calculates currency in minor units and avoids floating point drift", () => {
    const fractions: Transaction[] = [0.1, 0.2].map((amount, index) => ({
      ...validExpense,
      amount,
      id: String(index),
      createdAt: "2026-09-30T00:00:00.000Z",
      syncStatus: "synced",
    }));
    expect(totalSpent(fractions)).toBe(0.3);
    expect(remainingBudget(0.5, fractions)).toBe(0.2);
    expect(categoryTotals(fractions, snapshot.categories)[0].spent).toBe(0.3);
    expect(formatMoney(1234.5)).toBe("₸1,234.50");
  });

  it("keeps overspending visible and handles zero limits without NaN", () => {
    const totals = categoryTotals(
      month,
      snapshot.categories.map((category) => ({ ...category, monthlyLimit: 0 })),
    );
    expect(totals[0].remaining).toBe(-31800);
    expect(totals[0].percentage).toBe(100);
    expect(
      categoryTotals(
        [],
        snapshot.categories.map((category) => ({
          ...category,
          monthlyLimit: 0,
        })),
      )[0].percentage,
    ).toBe(0);
  });

  it("preserves the demo total even when opened at the start of a month", () => {
    const earlyMonth = createSeedSnapshot(new Date(2027, 1, 1));
    const current = getMonthTransactions(earlyMonth.transactions, "2027-02");
    expect(totalSpent(current)).toBe(77650);
    expect(
      current.every((transaction) => transaction.occurredAt === "2027-02-01"),
    ).toBe(true);
  });
});

describe("centralized validation", () => {
  it.each([0, -1, NaN, Infinity, 3.141, 0.001])(
    "rejects invalid amount %s",
    (amount) => {
      expect(expenseSchema.safeParse({ ...validExpense, amount }).success).toBe(
        false,
      );
    },
  );

  it.each([1, 0.01, 1.1, 2500.99])(
    "accepts valid currency amount %s",
    (amount) => {
      expect(expenseSchema.safeParse({ ...validExpense, amount }).success).toBe(
        true,
      );
    },
  );

  it("rejects empty category, impossible dates and long notes", () => {
    expect(
      expenseSchema.safeParse({ ...validExpense, categoryId: "" }).success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({ ...validExpense, occurredAt: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({ ...validExpense, occurredAt: "" }).success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({ ...validExpense, note: "a".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({
        ...validExpense,
        occurredAt: "2026-09-30T12:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("allows zero budgets and rejects negative budgets and extra decimals", () => {
    expect(budgetSchema.safeParse(0).success).toBe(true);
    expect(budgetSchema.safeParse(-1).success).toBe(false);
    expect(budgetSchema.safeParse(1.001).success).toBe(false);
  });
});

it("formats calendar dates without shifting the selected day", () => {
  const date = new Date(2026, 8, 30, 23, 59);
  expect(todayISO(date)).toBe("2026-09-30");
  expect(monthKey(date)).toBe("2026-09");
  expect(monthLabel("2026-09")).toBe("September 2026");
  expect(formatDate("2026-09-30")).toBe("Sep 30");
});
