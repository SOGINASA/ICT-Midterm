import { Category, Transaction } from "../types/finance";
import { fromMinorUnits, toMinorUnits } from "./money";

export function getMonthTransactions(
  transactions: Transaction[],
  month: string,
): Transaction[] {
  return transactions.filter(
    (transaction) => transaction.occurredAt.slice(0, 7) === month,
  );
}

export function totalSpent(transactions: Transaction[]): number {
  return fromMinorUnits(
    transactions.reduce(
      (total, transaction) => total + toMinorUnits(transaction.amount),
      0,
    ),
  );
}

export function remainingBudget(
  budget: number,
  transactions: Transaction[],
): number {
  return fromMinorUnits(
    toMinorUnits(budget) - toMinorUnits(totalSpent(transactions)),
  );
}

export interface CategoryTotal extends Category {
  spent: number;
  remaining: number;
  percentage: number;
}

export function categoryTotals(
  transactions: Transaction[],
  categories: Category[],
): CategoryTotal[] {
  const totals = new Map<string, number>();
  transactions.forEach((transaction) => {
    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) || 0) +
        toMinorUnits(transaction.amount),
    );
  });
  return categories.map((category) => {
    const spent = fromMinorUnits(totals.get(category.id) || 0);
    return {
      ...category,
      spent,
      remaining: fromMinorUnits(
        toMinorUnits(category.monthlyLimit) - toMinorUnits(spent),
      ),
      percentage:
        category.monthlyLimit > 0
          ? (spent / category.monthlyLimit) * 100
          : spent > 0
            ? 100
            : 0,
    };
  });
}
