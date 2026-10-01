import { create, useStore } from "zustand";
import { createContext, useContext } from "react";
import { ZodError } from "zod";
import { createSeedSnapshot } from "../data/seed";
import {
  FinanceRepository,
  LocalFinanceRepository,
} from "../services/financeRepository";
import {
  DRAFT_STORAGE_KEY,
  readStoredValue,
  removeStoredValue,
  RepositoryError,
  StorageAdapter,
  writeStoredValue,
} from "../services/storage";
import {
  Category,
  ExpenseDraft,
  ExpenseInput,
  OnboardingInput,
  Transaction,
  UserProfile,
} from "../types/finance";
import { todayISO } from "../utils/dates";
import { draftSchema } from "../utils/validation";

export interface FinanceState {
  transactions: Transaction[];
  categories: Category[];
  profile: UserProfile;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  demoOffline: boolean;
  draft: ExpenseDraft;
  initialize(): Promise<void>;
  completeOnboarding(input: OnboardingInput): Promise<void>;
  addExpense(input: ExpenseInput): Promise<Transaction>;
  updateExpense(id: string, input: ExpenseInput): Promise<Transaction>;
  deleteExpense(id: string): Promise<void>;
  setMonthlyBudget(amount: number): Promise<void>;
  setCategoryLimit(id: string, amount: number): Promise<void>;
  setDemoOffline(offline: boolean): void;
  syncPending(): Promise<void>;
  updateDraft(partial: Partial<ExpenseDraft>): void;
  clearDraft(): void;
  clearError(): void;
}

export interface FinanceStoreOptions {
  repository?: FinanceRepository;
  storage?: StorageAdapter;
  networkOnline?: () => boolean;
}

export const emptyDraft = (
  paymentMethod: ExpenseDraft["paymentMethod"] = "card",
): ExpenseDraft => ({
  amount: "",
  categoryId: "",
  paymentMethod,
  occurredAt: todayISO(),
  note: "",
});

function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return (
      error.issues[0]?.message || "Check the entered values and try again."
    );
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function createFinanceStore(options: FinanceStoreOptions = {}) {
  const repository =
    options.repository || new LocalFinanceRepository(options.storage);
  const networkOnline =
    options.networkOnline ||
    (() => typeof navigator === "undefined" || navigator.onLine !== false);
  let initializing: Promise<void> | null = null;
  let runningOperations = 0;
  const seed = createSeedSnapshot();

  return create<FinanceState>((set, get) => {
    const offline = () => get().demoOffline || !networkOnline();

    async function run<T>(operation: () => Promise<T>): Promise<T> {
      if (!get().initialized) await get().initialize();
      if (!get().initialized)
        throw new RepositoryError(
          get().error || "Device storage could not be loaded.",
        );
      runningOperations += 1;
      set({ loading: true, error: null });
      try {
        return await operation();
      } catch (error) {
        set({ error: errorMessage(error) });
        throw error;
      } finally {
        runningOperations -= 1;
        set({ loading: runningOperations > 0 });
      }
    }

    return {
      transactions: [],
      categories: seed.categories,
      profile: seed.profile,
      initialized: false,
      loading: false,
      error: null,
      demoOffline: false,
      draft: emptyDraft(),
      initialize: async () => {
        if (get().initialized) return;
        if (initializing) return initializing;
        set({ loading: true, error: null });
        initializing = (async () => {
          try {
            const snapshot = await repository.loadSnapshot();
            let draft = get().draft;
            let draftError: string | null = null;
            try {
              const savedDraft = readStoredValue(
                DRAFT_STORAGE_KEY,
                options.storage,
              );
              if (savedDraft !== undefined) {
                const parsed = draftSchema.safeParse(savedDraft);
                if (parsed.success) draft = parsed.data;
                else
                  draftError =
                    "Your saved draft could not be restored. You can start a new expense.";
              }
            } catch (error) {
              draftError = errorMessage(error);
            }
            set({ ...snapshot, draft, initialized: true, error: draftError });
          } catch (error) {
            set({ error: errorMessage(error) });
          } finally {
            set({ loading: false });
            initializing = null;
          }
        })();
        return initializing;
      },
      completeOnboarding: (input) =>
        run(async () => {
          const snapshot = await repository.completeOnboarding(input);
          set({ ...snapshot });
        }),
      addExpense: (input) =>
        run(async () => {
          const transaction = await repository.addExpense(input, offline());
          set((state) => ({
            transactions: [transaction, ...state.transactions],
          }));
          return transaction;
        }),
      updateExpense: (id, input) =>
        run(async () => {
          const transaction = await repository.updateExpense(
            id,
            input,
            offline(),
          );
          set((state) => ({
            transactions: state.transactions.map((item) =>
              item.id === id ? transaction : item,
            ),
          }));
          return transaction;
        }),
      deleteExpense: (id) =>
        run(async () => {
          await repository.deleteExpense(id);
          set((state) => ({
            transactions: state.transactions.filter(
              (transaction) => transaction.id !== id,
            ),
          }));
        }),
      setMonthlyBudget: (amount) =>
        run(async () => {
          const profile = await repository.updateMonthlyBudget(amount);
          set({ profile });
        }),
      setCategoryLimit: (id, amount) =>
        run(async () => {
          const category = await repository.updateCategoryLimit(id, amount);
          set((state) => ({
            categories: state.categories.map((item) =>
              item.id === id ? category : item,
            ),
          }));
        }),
      setDemoOffline: (demoOffline) => set({ demoOffline }),
      syncPending: () =>
        run(async () => {
          if (offline()) return;
          const transactions = await repository.syncPending();
          set({ transactions });
        }),
      updateDraft: (partial) => {
        const draft = { ...get().draft, ...partial };
        set({ draft });
        try {
          writeStoredValue(DRAFT_STORAGE_KEY, draft, options.storage);
        } catch (error) {
          set({
            error: `Draft stays open, but was not saved for reload. ${errorMessage(error)}`,
          });
        }
      },
      clearDraft: () => {
        set({ draft: emptyDraft(get().draft.paymentMethod) });
        try {
          removeStoredValue(DRAFT_STORAGE_KEY, options.storage);
        } catch (error) {
          set({ error: errorMessage(error) });
        }
      },
      clearError: () => set({ error: null }),
    };
  });
}

const defaultDemoStore = createFinanceStore();
export const FinanceStoreContext = createContext<ReturnType<
  typeof createFinanceStore
> | null>(null);

export function useFinanceStore(): FinanceState;
export function useFinanceStore<T>(selector: (state: FinanceState) => T): T;
export function useFinanceStore<T>(selector?: (state: FinanceState) => T) {
  const store = useContext(FinanceStoreContext) || defaultDemoStore;
  const select: (state: FinanceState) => T | FinanceState =
    selector || ((state) => state);
  return useStore(store, select);
}
