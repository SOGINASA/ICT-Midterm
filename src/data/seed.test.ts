import { createSeedSnapshot } from "./seed";
import { getMonthTransactions, totalSpent } from "../utils/analytics";

it("keeps demo creation times in the past even just after the month changes", () => {
  const now = new Date(2026, 9, 1, 0, 5);
  const snapshot = createSeedSnapshot(now);
  expect(snapshot.transactions.every((row) => Date.parse(row.createdAt) < now.getTime())).toBe(true);
  expect(totalSpent(getMonthTransactions(snapshot.transactions, "2026-10"))).toBe(77650);
  const newest = [...snapshot.transactions, {
    ...snapshot.transactions[0], id: "just-added", createdAt: now.toISOString(),
  }].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
  expect(newest[0].id).toBe("just-added");
});
