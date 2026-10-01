import { LocalFinanceRepository } from "../services/financeRepository";
import {
  DRAFT_STORAGE_KEY,
  FINANCE_STORAGE_KEY,
  StorageAdapter,
} from "../services/storage";
import { ExpenseInput } from "../types/finance";
import { getMonthTransactions, totalSpent } from "../utils/analytics";
import { createFinanceStore } from "./useFinanceStore";

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();
  failWrites = false;
  failReads = false;
  getItem(key: string): string | null {
    if (this.failReads) throw new Error("Storage is blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failWrites) throw new Error("Storage is blocked");
    this.values.delete(key);
  }
}

const fixedDate = () => new Date("2026-09-30T12:00:00.000Z");
const input: ExpenseInput = {
  amount: 3500,
  categoryId: "food",
  paymentMethod: "card",
  note: "Lunch",
  occurredAt: "2026-09-30",
};

function makeStore(storage: MemoryStorage, online = true) {
  return createFinanceStore({
    repository: new LocalFinanceRepository(storage, fixedDate),
    storage,
    networkOnline: () => online,
  });
}

it("saves, edits, reloads and deletes an expense while keeping totals consistent", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  const originalTotal = totalSpent(
    getMonthTransactions(store.getState().transactions, "2026-09"),
  );
  const saved = await store.getState().addExpense(input);
  expect(saved.syncStatus).toBe("synced");
  expect(
    totalSpent(getMonthTransactions(store.getState().transactions, "2026-09")),
  ).toBe(originalTotal + 3500);

  await store.getState().updateExpense(saved.id, {
    ...input,
    amount: 1250,
    categoryId: "transport",
  });
  const reloaded = makeStore(storage);
  await reloaded.getState().initialize();
  expect(
    reloaded.getState().transactions.find((item) => item.id === saved.id),
  ).toMatchObject({ amount: 1250, categoryId: "transport" });
  expect(
    totalSpent(
      getMonthTransactions(reloaded.getState().transactions, "2026-09"),
    ),
  ).toBe(originalTotal + 1250);

  await reloaded.getState().deleteExpense(saved.id);
  expect(
    totalSpent(
      getMonthTransactions(reloaded.getState().transactions, "2026-09"),
    ),
  ).toBe(originalTotal);
  expect(
    (
      await new LocalFinanceRepository(storage, fixedDate).loadSnapshot()
    ).transactions.some((item) => item.id === saved.id),
  ).toBe(false);
});

it("validates again at the repository boundary before saving", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  const before = storage.getItem(FINANCE_STORAGE_KEY);
  await expect(
    store.getState().addExpense({ ...input, amount: 0 }),
  ).rejects.toThrow();
  await expect(
    store.getState().addExpense({ ...input, categoryId: "missing" }),
  ).rejects.toThrow("available categories");
  expect(storage.getItem(FINANCE_STORAGE_KEY)).toBe(before);
});

it("keeps offline expenses pending through refresh and simulates sync only after reconnecting", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  store.getState().setDemoOffline(true);
  const saved = await store.getState().addExpense(input);
  expect(saved.syncStatus).toBe("pending");
  await store.getState().syncPending();
  expect(
    store.getState().transactions.find((item) => item.id === saved.id)
      ?.syncStatus,
  ).toBe("pending");

  const reloaded = makeStore(storage);
  await reloaded.getState().initialize();
  expect(
    reloaded.getState().transactions.find((item) => item.id === saved.id)
      ?.syncStatus,
  ).toBe("pending");
  await reloaded.getState().syncPending();
  expect(
    reloaded.getState().transactions.find((item) => item.id === saved.id)
      ?.syncStatus,
  ).toBe("synced");
  expect(
    (
      await new LocalFinanceRepository(storage, fixedDate).loadSnapshot()
    ).transactions.find((item) => item.id === saved.id)?.syncStatus,
  ).toBe("synced");
});

it("also detects actual network unavailability", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage, false);
  const saved = await store.getState().addExpense(input);
  expect(saved.syncStatus).toBe("pending");
});

it("persists budget edits and the unfinished expense draft independently", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  await store.getState().setMonthlyBudget(140000);
  await store.getState().setCategoryLimit("food", 47000);
  store.getState().updateDraft({
    amount: "780.50",
    categoryId: "food",
    note: "Not saved yet",
  });

  const reloaded = makeStore(storage);
  await reloaded.getState().initialize();
  expect(reloaded.getState().profile.monthlyBudget).toBe(140000);
  expect(
    reloaded.getState().categories.find((category) => category.id === "food")
      ?.monthlyLimit,
  ).toBe(47000);
  expect(reloaded.getState().draft).toMatchObject({
    amount: "780.50",
    categoryId: "food",
    note: "Not saved yet",
  });
  reloaded.getState().clearDraft();
  expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

it("reports write failures without claiming an expense was saved or deleted", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  const before = store.getState().transactions;
  storage.failWrites = true;
  await expect(store.getState().addExpense(input)).rejects.toThrow(
    "Could not save",
  );
  expect(store.getState().transactions).toBe(before);
  await expect(store.getState().deleteExpense(before[0].id)).rejects.toThrow(
    "Could not save",
  );
  expect(store.getState().transactions).toBe(before);
  expect(store.getState().error).toContain("Could not save");
  expect(store.getState().loading).toBe(false);
});

it("keeps an unsaved draft open and visibly reports failed draft persistence", async () => {
  const storage = new MemoryStorage();
  const store = makeStore(storage);
  await store.getState().initialize();
  storage.failWrites = true;
  store.getState().updateDraft({ amount: "300" });
  expect(store.getState().draft.amount).toBe("300");
  expect(store.getState().error).toContain(
    "Draft stays open, but was not saved for reload",
  );
});

it("does not silently overwrite malformed saved data with demo data", async () => {
  const storage = new MemoryStorage();
  storage.setItem(FINANCE_STORAGE_KEY, "{broken");
  const store = makeStore(storage);
  await store.getState().initialize();
  expect(store.getState().initialized).toBe(false);
  expect(store.getState().error).toContain("Saved data could not be read");
  expect(storage.getItem(FINANCE_STORAGE_KEY)).toBe("{broken");
});

it("does not confuse a stored null with an empty storage slot", async () => {
  const storage = new MemoryStorage();
  storage.setItem(FINANCE_STORAGE_KEY, "null");
  const store = makeStore(storage);
  await store.getState().initialize();
  expect(store.getState().initialized).toBe(false);
  expect(store.getState().error).toContain("unsupported format");
  expect(storage.getItem(FINANCE_STORAGE_KEY)).toBe("null");
});

it("reports blocked storage and allows retry after it becomes available", async () => {
  const storage = new MemoryStorage();
  storage.failReads = true;
  const store = makeStore(storage);
  await store.getState().initialize();
  expect(store.getState().initialized).toBe(false);
  expect(store.getState().error).toContain("Could not read");
  storage.failReads = false;
  await store.getState().initialize();
  expect(store.getState().initialized).toBe(true);
  expect(store.getState().error).toBeNull();
});

it("opens a newly configured account only after the repository confirms the complete setup", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalFinanceRepository(storage, fixedDate);
  const initial = await repository.loadSnapshot();
  initial.profile.onboardingCompleted = false;
  initial.transactions = [];
  storage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(initial));
  const store = createFinanceStore({ repository, storage });
  await store.getState().initialize();
  const setup = {
    displayName: "Dana",
    monthlyBudget: 100000,
    categoryLimits: {
      food: 40000,
      transport: 15000,
      study: 15000,
      leisure: 20000,
      other: 10000,
    },
  };
  const committed = {
    ...initial,
    profile: {
      ...initial.profile,
      displayName: "Dana",
      monthlyBudget: 100000,
      onboardingCompleted: true,
    },
    categories: initial.categories.map((category) => ({
      ...category,
      monthlyLimit:
        setup.categoryLimits[category.id as keyof typeof setup.categoryLimits],
    })),
  };
  let confirm!: (value: typeof committed) => void;
  jest.spyOn(repository, "completeOnboarding").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  const saving = store.getState().completeOnboarding(setup);
  expect(store.getState().profile.onboardingCompleted).toBe(false);
  expect(store.getState().loading).toBe(true);
  confirm(committed);
  await saving;
  expect(store.getState().profile).toMatchObject({
    displayName: "Dana",
    monthlyBudget: 100000,
    onboardingCompleted: true,
  });
  expect(
    store.getState().categories.find((category) => category.id === "food")
      ?.monthlyLimit,
  ).toBe(40000);
  expect(store.getState().transactions).toEqual([]);
  expect(store.getState().loading).toBe(false);
});

it("retains unfinished onboarding when the server cannot confirm the save", async () => {
  const storage = new MemoryStorage();
  const repository = new LocalFinanceRepository(storage, fixedDate);
  const initial = await repository.loadSnapshot();
  initial.profile.onboardingCompleted = false;
  storage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(initial));
  const store = createFinanceStore({ repository, storage });
  await store.getState().initialize();
  jest
    .spyOn(repository, "completeOnboarding")
    .mockRejectedValueOnce(new Error("Connection lost. Please retry."));
  await expect(
    store.getState().completeOnboarding({
      displayName: "Dana",
      monthlyBudget: 100000,
      categoryLimits: {
        food: 40000,
        transport: 15000,
        study: 15000,
        leisure: 20000,
        other: 10000,
      },
    }),
  ).rejects.toThrow("Connection lost");
  expect(store.getState().profile).toEqual(initial.profile);
  expect(store.getState().categories).toEqual(initial.categories);
  expect(store.getState().loading).toBe(false);
  expect(store.getState().error).toContain("Connection lost");
});
