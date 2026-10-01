import { z } from "zod";

const hasCurrencyPrecision = (value: number): boolean =>
  Number(value.toFixed(2)) === value;

function isCalendarDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    (value.length === 10 || !Number.isNaN(Date.parse(value)))
  );
}

export const budgetSchema = z
  .number({ invalid_type_error: "Enter a valid budget." })
  .finite("Enter a valid budget.")
  .min(0, "Budget cannot be negative.")
  .max(1_000_000_000_000, "Enter a budget below ₸1 trillion.")
  .refine(hasCurrencyPrecision, "Use no more than 2 decimal places.");

export const onboardingSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Enter at least 2 characters.")
      .max(60, "Keep your name under 60 characters."),
    monthlyBudget: budgetSchema.refine(
      (value) => value > 0,
      "Enter a monthly budget greater than ₸0.",
    ),
    categoryLimits: z
      .object({
        food: budgetSchema,
        transport: budgetSchema,
        study: budgetSchema,
        leisure: budgetSchema,
        other: budgetSchema,
      })
      .strict(),
  })
  .superRefine((input, context) => {
    // Compare integer tiyn, so 0.10 + 0.20 is never greater than a 0.30 budget.
    const allocated = Object.values(input.categoryLimits).reduce(
      (sum, value) => sum + Math.round(value * 100),
      0,
    );
    if (allocated > Math.round(input.monthlyBudget * 100)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryLimits"],
        message: "Category limits must fit within your monthly budget.",
      });
    }
  });

export const expenseSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Enter an amount greater than ₸0." })
    .finite("Enter a valid amount.")
    .positive("Enter an amount greater than ₸0.")
    .max(1_000_000_000_000, "Enter an amount below ₸1 trillion.")
    .refine(hasCurrencyPrecision, "Use no more than 2 decimal places."),
  categoryId: z.string().min(1, "Choose a category."),
  paymentMethod: z.enum(["card", "cash"]),
  occurredAt: z.string().refine(isCalendarDate, "Choose a valid date."),
  note: z
    .string()
    .trim()
    .max(120, "Keep your note under 120 characters.")
    .optional(),
});

export const draftSchema = z.object({
  amount: z.string(),
  categoryId: z.string(),
  paymentMethod: z.enum(["card", "cash"]),
  occurredAt: z.string(),
  note: z.string(),
});

export const snapshotSchema = z
  .object({
    version: z.literal(1),
    profile: z.object({
      id: z.string().min(1),
      displayName: z.string().min(1),
      currency: z.literal("KZT"),
      monthlyBudget: budgetSchema,
      // Existing demo snapshots predate onboarding. Account responses are separately
      // validated with a required boolean before reaching this migration seam.
      onboardingCompleted: z.boolean().default(true),
    }),
    categories: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.enum(["Food", "Transport", "Study", "Leisure", "Other"]),
          icon: z.string(),
          monthlyLimit: budgetSchema,
          color: z.string().optional(),
        }),
      )
      .length(5),
    transactions: z.array(
      expenseSchema.extend({
        id: z.string().min(1),
        createdAt: z.string().datetime(),
        syncStatus: z.enum(["synced", "pending"]),
      }),
    ),
  })
  .superRefine((snapshot, context) => {
    const categoryIds = new Set(
      snapshot.categories.map((category) => category.id),
    );
    const categoryNames = new Set(
      snapshot.categories.map((category) => category.name),
    );
    if (
      categoryIds.size !== snapshot.categories.length ||
      categoryNames.size !== snapshot.categories.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Categories must be unique.",
      });
    }
    const transactionIds = new Set(
      snapshot.transactions.map((transaction) => transaction.id),
    );
    if (transactionIds.size !== snapshot.transactions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Transaction IDs must be unique.",
      });
    }
    if (
      snapshot.transactions.some(
        (transaction) => !categoryIds.has(transaction.categoryId),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A transaction has an unknown category.",
      });
    }
  });
