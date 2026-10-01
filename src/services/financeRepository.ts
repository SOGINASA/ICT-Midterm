import { createSeedSnapshot } from "../data/seed";
import {
  Category,
  ExpenseInput,
  FinanceSnapshot,
  OnboardingInput,
  Transaction,
  UserProfile,
} from "../types/finance";
import {
  budgetSchema,
  expenseSchema,
  onboardingSchema,
  snapshotSchema,
} from "../utils/validation";
import {
  FINANCE_STORAGE_KEY,
  readStoredValue,
  RepositoryError,
  StorageAdapter,
  writeStoredValue,
} from "./storage";

export { RepositoryError } from "./storage";

/** The UI only talks to this boundary. A future HTTP adapter can implement the same contract. */
export interface FinanceRepository {
  loadSnapshot(): Promise<FinanceSnapshot>;
  completeOnboarding(input: OnboardingInput): Promise<FinanceSnapshot>;
  addExpense(input: ExpenseInput, pending: boolean): Promise<Transaction>;
  updateExpense(
    id: string,
    input: ExpenseInput,
    pending: boolean,
  ): Promise<Transaction>;
  deleteExpense(id: string): Promise<void>;
  updateMonthlyBudget(amount: number): Promise<UserProfile>;
  updateCategoryLimit(id: string, amount: number): Promise<Category>;
  syncPending(): Promise<Transaction[]>;
}

export class LocalFinanceRepository implements FinanceRepository {
  constructor(
    private readonly storage?: StorageAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private readSnapshot(): FinanceSnapshot {
    const saved = readStoredValue(FINANCE_STORAGE_KEY, this.storage);
    if (saved === undefined) {
      const seed = createSeedSnapshot(this.now());
      this.persist(seed);
      return seed;
    }
    const result = snapshotSchema.safeParse(saved);
    if (!result.success) {
      throw new RepositoryError(
        "Saved data has an unsupported format. Your existing data has been kept; restore a valid backup or clear this site’s storage to restart the demo.",
      );
    }
    return result.data;
  }

  private persist(snapshot: FinanceSnapshot): void {
    writeStoredValue(FINANCE_STORAGE_KEY, snapshot, this.storage);
  }

  private validateExpense(
    input: ExpenseInput,
    snapshot: FinanceSnapshot,
  ): ExpenseInput {
    const parsed = expenseSchema.parse(input);
    if (
      !snapshot.categories.some((category) => category.id === parsed.categoryId)
    ) {
      throw new RepositoryError("Choose one of the available categories.");
    }
    return parsed;
  }

  async loadSnapshot(): Promise<FinanceSnapshot> {
    return this.readSnapshot();
  }

  async completeOnboarding(input: OnboardingInput): Promise<FinanceSnapshot> {
    const snapshot = this.readSnapshot();
    // A retried first-run request cannot overwrite settings changed afterwards.
    if (snapshot.profile.onboardingCompleted) return snapshot;
    const validated = onboardingSchema.parse(input);
    const limits: Record<string, number> = validated.categoryLimits;
    if (
      snapshot.categories.some(
        (category) => !Object.prototype.hasOwnProperty.call(limits, category.id),
      )
    ) {
      throw new RepositoryError("Your categories are not ready. Refresh and try again.");
    }
    const next: FinanceSnapshot = {
      ...snapshot,
      profile: {
        ...snapshot.profile,
        displayName: validated.displayName,
        monthlyBudget: validated.monthlyBudget,
        onboardingCompleted: true,
      },
      categories: snapshot.categories.map((category) => ({
        ...category,
        monthlyLimit: limits[category.id],
      })),
    };
    // One storage write commits the profile, all limits and completion together.
    this.persist(next);
    return next;
  }

  async addExpense(
    input: ExpenseInput,
    pending: boolean,
  ): Promise<Transaction> {
    const snapshot = this.readSnapshot();
    const validated = this.validateExpense(input, snapshot);
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `expense-${this.now().getTime()}-${Math.random().toString(36).slice(2, 11)}`;
    const transaction: Transaction = {
      ...validated,
      id,
      createdAt: this.now().toISOString(),
      syncStatus: pending ? "pending" : "synced",
    };
    this.persist({
      ...snapshot,
      transactions: [transaction, ...snapshot.transactions],
    });
    return transaction;
  }

  async updateExpense(
    id: string,
    input: ExpenseInput,
    pending: boolean,
  ): Promise<Transaction> {
    const snapshot = this.readSnapshot();
    const previous = snapshot.transactions.find(
      (transaction) => transaction.id === id,
    );
    if (!previous)
      throw new RepositoryError(
        "This expense no longer exists. Refresh your history and try again.",
      );
    const validated = this.validateExpense(input, snapshot);
    const transaction: Transaction = {
      ...previous,
      ...validated,
      syncStatus:
        pending || previous.syncStatus === "pending" ? "pending" : "synced",
    };
    this.persist({
      ...snapshot,
      transactions: snapshot.transactions.map((item) =>
        item.id === id ? transaction : item,
      ),
    });
    return transaction;
  }

  async deleteExpense(id: string): Promise<void> {
    const snapshot = this.readSnapshot();
    if (!snapshot.transactions.some((transaction) => transaction.id === id)) {
      throw new RepositoryError(
        "This expense no longer exists. Refresh your history and try again.",
      );
    }
    this.persist({
      ...snapshot,
      transactions: snapshot.transactions.filter(
        (transaction) => transaction.id !== id,
      ),
    });
  }

  async updateMonthlyBudget(amount: number): Promise<UserProfile> {
    const validated = budgetSchema.parse(amount);
    const snapshot = this.readSnapshot();
    const profile = { ...snapshot.profile, monthlyBudget: validated };
    this.persist({ ...snapshot, profile });
    return profile;
  }

  async updateCategoryLimit(id: string, amount: number): Promise<Category> {
    const validated = budgetSchema.parse(amount);
    const snapshot = this.readSnapshot();
    const previous = snapshot.categories.find((category) => category.id === id);
    if (!previous)
      throw new RepositoryError(
        "This category no longer exists. Refresh the page and try again.",
      );
    const category = { ...previous, monthlyLimit: validated };
    this.persist({
      ...snapshot,
      categories: snapshot.categories.map((item) =>
        item.id === id ? category : item,
      ),
    });
    return category;
  }

  /** Demo only: this acknowledges the local queue; it never contacts a server. */
  async syncPending(): Promise<Transaction[]> {
    const snapshot = this.readSnapshot();
    const transactions = snapshot.transactions.map((transaction) => ({
      ...transaction,
      syncStatus: "synced" as const,
    }));
    if (
      snapshot.transactions.some(
        (transaction) => transaction.syncStatus === "pending",
      )
    ) {
      this.persist({ ...snapshot, transactions });
    }
    return transactions;
  }
}
