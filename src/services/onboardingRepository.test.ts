import { createSeedSnapshot } from "../data/seed";
import { OnboardingInput } from "../types/finance";
import { onboardingSchema } from "../utils/validation";
import { LocalFinanceRepository } from "./financeRepository";
import { FINANCE_STORAGE_KEY, StorageAdapter } from "./storage";

const setupInput: OnboardingInput = {
  displayName: "  Sam  ",
  monthlyBudget: 90000,
  categoryLimits: { food: 30000, transport: 15000, study: 10000, leisure: 15000, other: 10000 },
};

function fixture(completed = false) {
  const snapshot = createSeedSnapshot(new Date("2026-10-01T10:00:00Z"));
  snapshot.profile.onboardingCompleted = completed;
  snapshot.transactions = [];
  let persisted = JSON.stringify(snapshot);
  const storage: StorageAdapter = {
    getItem: jest.fn(() => persisted),
    setItem: jest.fn((_key, value) => { persisted = value; }),
    removeItem: jest.fn(),
  };
  return { snapshot, storage, repository: new LocalFinanceRepository(storage) };
}

test("validates and atomically persists profile, five limits and completion", async () => {
  const { repository, storage } = fixture();
  const result = await repository.completeOnboarding(setupInput);
  expect(result.profile).toMatchObject({ displayName: "Sam", monthlyBudget: 90000, onboardingCompleted: true });
  expect(Object.fromEntries(result.categories.map((item) => [item.id, item.monthlyLimit]))).toEqual(setupInput.categoryLimits);
  expect(result.transactions).toEqual([]);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledWith(FINANCE_STORAGE_KEY, JSON.stringify(result));
  expect(await repository.loadSnapshot()).toEqual(result);
});

test("a retry cannot overwrite completed setup or later budget changes", async () => {
  const { repository, storage } = fixture();
  await repository.completeOnboarding(setupInput);
  await repository.updateMonthlyBudget(110000);
  const writesBeforeRetry = (storage.setItem as jest.Mock).mock.calls.length;
  const result = await repository.completeOnboarding({ ...setupInput, displayName: "Different", monthlyBudget: 150000 });
  expect(result.profile).toMatchObject({ displayName: "Sam", monthlyBudget: 110000, onboardingCompleted: true });
  expect(storage.setItem).toHaveBeenCalledTimes(writesBeforeRetry);
});

test("failed persistence leaves all settings and completion untouched", async () => {
  const { repository, snapshot, storage } = fixture();
  (storage.setItem as jest.Mock).mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
  await expect(repository.completeOnboarding(setupInput)).rejects.toThrow("Could not save");
  expect(await repository.loadSnapshot()).toEqual(snapshot);
});

test("legacy demo snapshots default to completed and retain all existing data", async () => {
  const { snapshot, storage } = fixture();
  const { onboardingCompleted: _removed, ...legacyProfile } = snapshot.profile;
  storage.getItem = jest.fn(() => JSON.stringify({ ...snapshot, profile: legacyProfile }));
  const result = await new LocalFinanceRepository(storage).loadSnapshot();
  expect(result).toEqual({ ...snapshot, profile: { ...snapshot.profile, onboardingCompleted: true } });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test.each([
  ["short name", { ...setupInput, displayName: " a " }],
  ["blank name", { ...setupInput, displayName: "\t \n" }],
  ["long name", { ...setupInput, displayName: "x".repeat(61) }],
  ["zero budget", { ...setupInput, monthlyBudget: 0 }],
  ["negative budget", { ...setupInput, monthlyBudget: -1 }],
  ["infinite budget", { ...setupInput, monthlyBudget: Infinity }],
  ["NaN budget", { ...setupInput, monthlyBudget: NaN }],
  ["oversized budget", { ...setupInput, monthlyBudget: 1_000_000_000_001 }],
  ["excess budget decimals", { ...setupInput, monthlyBudget: 90000.001 }],
  ["negative limit", { ...setupInput, categoryLimits: { ...setupInput.categoryLimits, food: -1 } }],
  ["excess limit decimals", { ...setupInput, categoryLimits: { ...setupInput.categoryLimits, food: 1.001 } }],
  ["tiny fractional limit", { ...setupInput, categoryLimits: { ...setupInput.categoryLimits, food: 0.000000001 } }],
  ["overallocated limits", { ...setupInput, monthlyBudget: 79999.99 }],
  ["extra category", { ...setupInput, categoryLimits: { ...setupInput.categoryLimits, extra: 0 } }],
  ["missing category", { ...setupInput, categoryLimits: { food: 1 } }],
])("rejects %s without writing partial setup", async (_label, input) => {
  const { repository, storage } = fixture();
  await expect(repository.completeOnboarding(input)).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("allows zero limits, exact decimal allocation and unallocated money", () => {
  const decimalInput = { displayName: "Sam", monthlyBudget: 0.3, categoryLimits: { food: 0.1, transport: 0.2, study: 0, leisure: 0, other: 0 } };
  expect(onboardingSchema.parse(decimalInput)).toEqual(decimalInput);
  expect(onboardingSchema.parse({ ...decimalInput, monthlyBudget: 1000 }).monthlyBudget).toBe(1000);
});
