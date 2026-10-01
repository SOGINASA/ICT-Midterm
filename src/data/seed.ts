import { Category, FinanceSnapshot, Transaction } from "../types/finance";
import { monthKey } from "../utils/dates";

export const seedCategories: Category[] = [
  {
    id: "food",
    name: "Food",
    icon: "utensils",
    monthlyLimit: 45000,
    color: "#15776E",
  },
  {
    id: "transport",
    name: "Transport",
    icon: "bus",
    monthlyLimit: 20000,
    color: "#75AAA4",
  },
  {
    id: "study",
    name: "Study",
    icon: "book-open",
    monthlyLimit: 15000,
    color: "#A4C5BD",
  },
  {
    id: "leisure",
    name: "Leisure",
    icon: "clapperboard",
    monthlyLimit: 25000,
    color: "#C4D6CC",
  },
  {
    id: "other",
    name: "Other",
    icon: "shapes",
    monthlyLimit: 15000,
    color: "#D9E1D4",
  },
];

// All current-month rows total exactly ₸77,650, independent of when the demo is opened.
const expenseRows: Array<[number, string, string, number, "card" | "cash"]> = [
  [29, "food", "Lunch at the campus café", 3500, "card"],
  [29, "transport", "Bus / taxi", 1200, "card"],
  [28, "study", "Printing", 2450, "cash"],
  [27, "leisure", "Cinema with friends", 5500, "card"],
  [26, "food", "Groceries", 8200, "card"],
  [25, "other", "Mobile plan", 4990, "card"],
  [23, "food", "Coffee and a sandwich", 2800, "card"],
  [21, "transport", "Weekly bus rides", 2100, "card"],
  [19, "food", "Groceries for the week", 7600, "card"],
  [17, "study", "Course notebook and pens", 3850, "card"],
  [15, "leisure", "Weekend bowling", 6500, "card"],
  [13, "food", "Dinner with friends", 4500, "card"],
  [11, "transport", "Taxi home", 2800, "card"],
  [9, "other", "Everyday essentials", 3460, "cash"],
  [7, "food", "Campus lunches", 5200, "cash"],
  [5, "study", "English workbook", 4500, "card"],
  [3, "leisure", "Museum and coffee", 3500, "card"],
  [2, "transport", "Bus pass top-up", 5000, "card"],
];

export function createSeedSnapshot(now: Date = new Date()): FinanceSnapshot {
  const month = monthKey(now);
  const currentDay = now.getDate();
  const transactions: Transaction[] = expenseRows.map(
    ([day, categoryId, note, amount, paymentMethod], index) => {
      const date = `${month}-${String(Math.min(day, currentDay)).padStart(2, "0")}`;
      // At the start of a month, sample dates collapse onto today. Keep their
      // creation times in the past so a real new entry remains the most recent.
      const sampleTime = Date.parse(
        `${date}T12:${String(index).padStart(2, "0")}:00.000Z`,
      );
      const createdAt = new Date(
        Math.min(sampleTime, now.getTime() - (index + 1) * 60_000),
      ).toISOString();
      return {
        id: `demo-${month}-${index + 1}`,
        amount,
        categoryId,
        note,
        paymentMethod,
        occurredAt: date,
        createdAt,
        syncStatus: "synced",
      };
    },
  );
  const previousMonth = monthKey(
    new Date(now.getFullYear(), now.getMonth() - 1, 15),
  );
  transactions.push({
    id: `demo-${previousMonth}-1`,
    amount: 6100,
    categoryId: "food",
    note: "Last month’s grocery shop",
    paymentMethod: "card",
    occurredAt: `${previousMonth}-15`,
    createdAt: `${previousMonth}-15T12:00:00.000Z`,
    syncStatus: "synced",
  });
  return {
    version: 1,
    profile: {
      id: "demo-ayan",
      displayName: "Ayan",
      currency: "KZT",
      monthlyBudget: 120000,
      onboardingCompleted: true,
    },
    categories: seedCategories.map((category) => ({ ...category })),
    transactions,
  };
}
