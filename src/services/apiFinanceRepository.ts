import { z } from "zod";
import { Category, ExpenseInput, FinanceSnapshot, OnboardingInput, Transaction, UserProfile } from "../types/finance";
import { budgetSchema, expenseSchema, onboardingSchema, snapshotSchema } from "../utils/validation";
import { FinanceRepository, RepositoryError } from "./financeRepository";
import { ApiError, authenticatedApiRequest } from "./apiClient";

const categoryIds = ["food", "transport", "study", "leisure", "other"] as const;
const profileSchema = z.object({
  id: z.string().uuid(), displayName: z.string().min(1), currency: z.literal("KZT"),
  monthlyBudget: budgetSchema, onboardingCompleted: z.boolean(),
});
const categorySchema = z.object({
  id: z.enum(categoryIds), name: z.enum(["Food", "Transport", "Study", "Leisure", "Other"]),
  icon: z.string(), monthlyLimit: budgetSchema, color: z.string().optional(),
});
const transactionSchema = expenseSchema.extend({
  id: z.string().uuid(), categoryId: z.enum(categoryIds),
  createdAt: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()),
  syncStatus: z.literal("synced"),
});

/** Own API adapter. Account data is always server-confirmed and never copied to demo storage. */
export class ApiFinanceRepository implements FinanceRepository {
  constructor(private readonly userId: string) { z.string().uuid().parse(userId); }
  private requireConnection(pending = false) {
    if (pending || (typeof navigator !== "undefined" && !navigator.onLine)) throw new RepositoryError(
      "Your account needs an internet connection. Reconnect before saving; this change has not been saved.",
    );
  }
  private async request(path: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", body?: unknown) {
    try { return await authenticatedApiRequest(path, { method, body, expectedUserId: this.userId }); }
    catch (error) {
      if (error instanceof TypeError) throw new RepositoryError("Could not reach your account. Check your connection and refresh before trying again.");
      if (error instanceof ApiError) throw new RepositoryError(error.message);
      throw error;
    }
  }
  private parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new RepositoryError("Your account returned an unsupported data format. Refresh the page or check the backend setup.");
    return parsed.data;
  }
  private profile(value: unknown): UserProfile {
    const profile = this.parse(profileSchema, value);
    if (profile.id !== this.userId) throw new RepositoryError("This data does not belong to the signed-in account.");
    return profile;
  }
  private snapshot(value: unknown): FinanceSnapshot {
    // Remote completion is required; only historical demo snapshots may default it to true.
    const raw = this.parse(z.object({
      version: z.literal(1), profile: profileSchema,
      categories: z.array(categorySchema).length(5), transactions: z.array(transactionSchema),
    }), value);
    this.profile(raw.profile);
    return this.parse(snapshotSchema, raw);
  }
  private expense(input: ExpenseInput) {
    const validated = expenseSchema.parse(input);
    if (!categoryIds.includes(validated.categoryId as typeof categoryIds[number])) throw new RepositoryError("Choose one of the available categories.");
    return { ...validated, note: validated.note ?? "", occurredAt: validated.occurredAt.slice(0, 10) };
  }
  async loadSnapshot(): Promise<FinanceSnapshot> {
    this.requireConnection();
    return this.snapshot(await this.request("/snapshot"));
  }
  async completeOnboarding(input: OnboardingInput): Promise<FinanceSnapshot> {
    this.requireConnection();
    const snapshot = this.snapshot(await this.request("/onboarding", "POST", onboardingSchema.parse(input)));
    if (!snapshot.profile.onboardingCompleted) throw new RepositoryError("Your setup has not been confirmed. Keep this page open and try again.");
    return snapshot;
  }
  async addExpense(input: ExpenseInput, pending: boolean): Promise<Transaction> {
    this.requireConnection(pending);
    return this.parse(transactionSchema, await this.request("/transactions", "POST", this.expense(input)));
  }
  async updateExpense(id: string, input: ExpenseInput, pending: boolean): Promise<Transaction> {
    this.requireConnection(pending);
    z.string().uuid().parse(id);
    const transaction = this.parse(transactionSchema, await this.request(`/transactions/${encodeURIComponent(id)}`, "PATCH", this.expense(input)));
    if (transaction.id !== id) throw new RepositoryError("The server returned a different expense. Refresh your history.");
    return transaction;
  }
  async deleteExpense(id: string): Promise<void> {
    this.requireConnection();
    z.string().uuid().parse(id);
    await this.request(`/transactions/${encodeURIComponent(id)}`, "DELETE");
  }
  async updateMonthlyBudget(amount: number): Promise<UserProfile> {
    this.requireConnection();
    return this.profile(await this.request("/profile/budget", "PATCH", { amount: budgetSchema.parse(amount) }));
  }
  async updateCategoryLimit(id: string, amount: number): Promise<Category> {
    this.requireConnection();
    z.enum(categoryIds).parse(id);
    const category = this.parse(categorySchema, await this.request(`/categories/${encodeURIComponent(id)}/limit`, "PATCH", { amount: budgetSchema.parse(amount) }));
    if (category.id !== id) throw new RepositoryError("The server returned a different category. Refresh your account.");
    return category;
  }
  async syncPending(): Promise<Transaction[]> { return (await this.loadSnapshot()).transactions; }
}
