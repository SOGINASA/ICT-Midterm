export type CategoryName = "Food" | "Transport" | "Study" | "Leisure" | "Other";
export type PaymentMethod = "card" | "cash";

export interface UserProfile {
  id: string;
  displayName: string;
  currency: "KZT";
  monthlyBudget: number;
  onboardingCompleted: boolean;
}

export interface OnboardingInput {
  displayName: string;
  monthlyBudget: number;
  categoryLimits: Record<string, number>;
}

export interface Category {
  id: string;
  name: CategoryName;
  icon: string;
  monthlyLimit: number;
  color?: string;
}

export interface ExpenseInput {
  amount: number;
  categoryId: string;
  paymentMethod: PaymentMethod;
  note?: string;
  occurredAt: string;
}

export interface Transaction extends ExpenseInput {
  id: string;
  createdAt: string;
  syncStatus: "synced" | "pending";
}

export interface ExpenseDraft {
  amount: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  note: string;
}

export interface FinanceSnapshot {
  version: 1;
  profile: UserProfile;
  categories: Category[];
  transactions: Transaction[];
}
