import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, LogOut } from "lucide-react";
import Brand from "../components/Brand";
import CategoryIcon from "../components/CategoryIcon";
import { Category, OnboardingInput, UserProfile } from "../types/finance";
import { formatMoney, toMinorUnits } from "../utils/money";
import { onboardingSchema } from "../utils/validation";
import "./scopedOnboarding.css";

interface OnboardingPageProps {
  profile: UserProfile;
  categories: Category[];
  onComplete: (input: OnboardingInput) => Promise<void>;
  onSignOut: () => Promise<void>;
}

interface SetupDraft {
  version: 1;
  userId: string;
  step: number;
  displayName: string;
  monthlyBudget: string;
  categoryLimits: Record<string, string>;
  limitsInitialized: boolean;
}

const steps = ["About you", "Your month", "The little things"];
const categoryNotes: Record<string, string> = {
  Food: "Groceries, coffee & something good",
  Transport: "Your everyday A to B",
  Study: "Books, courses & new ideas",
  Leisure: "A little room for fun",
  Other: "Everything in between",
};
const categoryWeights: Record<string, number> = {
  Food: 40,
  Transport: 15,
  Study: 15,
  Leisure: 20,
  Other: 10,
};
const allocationColors = [
  "#2d624d",
  "#719080",
  "#a7b7a3",
  "#ba9e79",
  "#d4cbb8",
];
const maximumAmount = 1_000_000_000_000;

/** Keep the text intact while editing; accept either decimal separator. */
function readAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= maximumAmount ? amount : null;
}

function allocateBudget(
  budget: number,
  categories: Category[],
): Record<string, string> {
  const cents = toMinorUnits(budget);
  const totalWeight = categories.reduce(
    (sum, category) => sum + (categoryWeights[category.name] || 10),
    0,
  );
  let remaining = cents;
  return Object.fromEntries(
    categories.map((category, index) => {
      const amount =
        index === categories.length - 1
          ? remaining
          : Math.floor(
              (cents * (categoryWeights[category.name] || 10)) / totalWeight,
            );
      remaining -= amount;
      return [category.id, String(amount / 100)];
    }),
  );
}

function initialDraft(
  profile: UserProfile,
  categories: Category[],
): SetupDraft {
  const fallback: SetupDraft = {
    version: 1,
    userId: profile.id,
    step: 1,
    displayName: profile.displayName,
    monthlyBudget:
      profile.monthlyBudget > 0 ? String(profile.monthlyBudget) : "120000",
    categoryLimits: Object.fromEntries(
      categories.map((category) => [
        category.id,
        String(category.monthlyLimit),
      ]),
    ),
    limitsInitialized: false,
  };
  try {
    const text = window.sessionStorage.getItem(draftKey(profile.id));
    if (!text || text.length > 10000) return fallback;
    const saved: unknown = JSON.parse(text);
    if (!saved || typeof saved !== "object") return fallback;
    const candidate = saved as Partial<SetupDraft>;
    if (
      candidate.version !== 1 ||
      candidate.userId !== profile.id ||
      !Number.isInteger(candidate.step) ||
      Number(candidate.step) < 1 ||
      Number(candidate.step) > 3 ||
      typeof candidate.displayName !== "string" ||
      candidate.displayName.length > 60 ||
      typeof candidate.monthlyBudget !== "string" ||
      candidate.monthlyBudget.length > 30 ||
      !candidate.categoryLimits ||
      typeof candidate.categoryLimits !== "object" ||
      !categories.every(
        ({ id }) =>
          typeof candidate.categoryLimits?.[id] === "string" &&
          candidate.categoryLimits[id].length <= 30,
      )
    )
      return fallback;
    return {
      ...fallback,
      step: candidate.step!,
      displayName: candidate.displayName,
      monthlyBudget: candidate.monthlyBudget,
      categoryLimits: Object.fromEntries(
        categories.map(({ id }) => [id, candidate.categoryLimits![id]]),
      ),
      // Older saved drafts at step 3 may already contain the user's choices.
      limitsInitialized:
        typeof candidate.limitsInitialized === "boolean"
          ? candidate.limitsInitialized
          : candidate.step === 3,
    };
  } catch {
    // Setup remains usable when browser storage is unavailable or malformed.
    return fallback;
  }
}

function draftKey(userId: string) {
  return `tengeflow.account.${userId}.onboarding.v1`;
}

export default function OnboardingPage({
  profile,
  categories,
  onComplete,
  onSignOut,
}: OnboardingPageProps) {
  const [draft, setDraft] = useState(() => initialDraft(profile, categories));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<"save" | "signout" | null>(null);
  const [allocationNotice, setAllocationNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);
  const savedRef = useRef(false);
  const busy = operation !== null;
  const { step, displayName, monthlyBudget, categoryLimits } = draft;
  const budget = readAmount(monthlyBudget);
  const limitValues = categories.map(({ id }) =>
    readAmount(categoryLimits[id] || ""),
  );
  const limitsValid = limitValues.every((value) => value !== null);
  const allocatedCents = limitValues.reduce<number>(
    (total, value) => total + (value === null ? 0 : toMinorUnits(value)),
    0,
  );
  const remainingCents =
    budget === null ? 0 : toMinorUnits(budget) - allocatedCents;

  useEffect(() => {
    if (draft.userId !== profile.id) {
      savedRef.current = false;
      setDraft(initialDraft(profile, categories));
      setErrors({});
    }
  }, [categories, draft.userId, profile]);

  useEffect(() => {
    if (savedRef.current || draft.userId !== profile.id) return;
    try {
      window.sessionStorage.setItem(
        draftKey(profile.id),
        JSON.stringify(draft),
      );
    } catch {
      // Keeping the current form in memory still allows setup to finish.
    }
  }, [draft, profile.id]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (Object.keys(errors).length > 0) errorRef.current?.focus();
  }, [errors]);

  function changeField(key: "displayName" | "monthlyBudget", value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors({});
    setAllocationNotice("");
  }

  function validate(throughStep: number) {
    const next: Record<string, string> = {};
    if (displayName.trim().length < 2 || displayName.trim().length > 60) {
      next.displayName = "Enter a name between 2 and 60 characters.";
    }
    if (throughStep >= 2 && (budget === null || budget <= 0)) {
      next.monthlyBudget =
        "Enter an amount above 0, up to ₸1 trillion, with at most 2 decimal places.";
    }
    if (throughStep >= 3) {
      categories.forEach(({ id, name }, index) => {
        if (limitValues[index] === null) {
          next[id] =
            `Enter a ${name.toLowerCase()} limit of 0 or more, with at most 2 decimal places.`;
        }
      });
      if (budget !== null && limitsValid && remainingCents < 0) {
        next.allocation =
          "Your category limits add up to more than your monthly budget. Lower a limit or go back to adjust your budget.";
      }
    }
    return next;
  }

  function suggestLimits() {
    if (budget === null || budget <= 0) {
      setErrors({
        monthlyBudget:
          "Choose a monthly budget before dividing it into categories.",
      });
      setDraft((previous) => ({ ...previous, step: 2 }));
      return;
    }
    setDraft((previous) => ({
      ...previous,
      categoryLimits: allocateBudget(budget, categories),
      limitsInitialized: true,
    }));
    setErrors({});
    setAllocationNotice(
      "Suggested limits applied. Change any amount to make it yours.",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const next = validate(step);
    if (Object.keys(next).length > 0) {
      setErrors(next);
      if (next.displayName) setDraft((previous) => ({ ...previous, step: 1 }));
      else if (next.monthlyBudget)
        setDraft((previous) => ({ ...previous, step: 2 }));
      return;
    }
    setErrors({});
    if (step < 3) {
      setDraft((previous) => ({
        ...previous,
        step: previous.step + 1,
        ...(step === 2 && !previous.limitsInitialized
          ? {
              categoryLimits: allocateBudget(budget!, categories),
              limitsInitialized: true,
            }
          : {}),
      }));
      return;
    }
    const parsed = onboardingSchema.safeParse({
      displayName: displayName.trim(),
      monthlyBudget: budget!,
      categoryLimits: Object.fromEntries(
        categories.map(({ id }, index) => [id, limitValues[index]!]),
      ),
    });
    if (!parsed.success) {
      const schemaErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field =
          issue.path[0] === "categoryLimits"
            ? String(issue.path[1] || "allocation")
            : String(issue.path[0] || "form");
        schemaErrors[field] = issue.message;
      });
      setErrors(schemaErrors);
      return;
    }
    pendingRef.current = true;
    setOperation("save");
    try {
      await onComplete(parsed.data);
      savedRef.current = true;
      try {
        window.sessionStorage.removeItem(draftKey(profile.id));
      } catch {
        // A completed server profile is the source of truth on the next visit.
      }
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "We couldn’t save your setup. Your choices are still here. Please try again.",
      });
    } finally {
      pendingRef.current = false;
      setOperation(null);
    }
  }

  async function signOut() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setOperation("signout");
    setErrors({});
    try {
      await onSignOut();
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "We couldn’t sign you out. Please try again.",
      });
    } finally {
      pendingRef.current = false;
      setOperation(null);
    }
  }

  return (
    <div className="tf-setup">
      <a className="tf-setup-skip" href="#setup-form">
        Skip to setup
      </a>
      <header className="tf-setup-header">
        <Brand />
        <button
          type="button"
          className="tf-setup-signout"
          onClick={signOut}
          disabled={busy}
        >
          {operation === "signout" ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogOut size={17} aria-hidden="true" />
          )}
          {operation === "signout" ? "Signing out…" : "Sign out"}
        </button>
      </header>
      <main className="tf-setup-layout">
        <aside className="tf-setup-aside" aria-label="Getting started">
          <div className="tf-setup-aside-copy">
            <p className="tf-setup-eyebrow">
              A little planning. A fresh start.
            </p>
            <h2>
              Make room for
              <br />
              <em>your kind of life.</em>
            </h2>
            <p>
              A few small choices now.
              <br />A clearer picture of your month ahead.
            </p>
          </div>
          <img
            src="/images/landing/quiet-plans-640.webp"
            alt=""
            width="640"
            height="427"
            className="tf-setup-illustration"
          />
          <p className="tf-setup-aside-note">
            Your plans can change. Your budget can, too.
          </p>
        </aside>

        <section className="tf-setup-main" aria-labelledby="setup-title">
          <nav aria-label="Setup progress" className="tf-setup-progress">
            <ol>
              {steps.map((label, index) => (
                <li
                  key={label}
                  className={
                    step === index + 1
                      ? "is-current"
                      : step > index + 1
                        ? "is-complete"
                        : ""
                  }
                  aria-current={step === index + 1 ? "step" : undefined}
                >
                  {step > index + 1 ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Back to ${label}`}
                      onClick={() => {
                        setErrors({});
                        setDraft((previous) => ({
                          ...previous,
                          step: index + 1,
                        }));
                      }}
                    >
                      <span className="tf-setup-step-number">
                        <Check size={14} aria-hidden="true" />
                      </span>
                      <span>{label}</span>
                    </button>
                  ) : (
                    <span className="tf-setup-step-label">
                      <span className="tf-setup-step-number">{index + 1}</span>
                      <span>{label}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <form id="setup-form" noValidate onSubmit={submit} aria-busy={busy}>
            <div className="tf-setup-heading">
              <p className="tf-setup-eyebrow">Step {step} of 3</p>
              <h1 id="setup-title" tabIndex={-1} ref={headingRef}>
                {step === 1 ? (
                  <>
                    Let’s make this <em>yours.</em>
                  </>
                ) : step === 2 ? (
                  <>
                    Give your month
                    <br />
                    <em>a little direction.</em>
                  </>
                ) : (
                  <>
                    A place for
                    <br />
                    <em>the everyday things.</em>
                  </>
                )}
              </h1>
              <p>
                {step === 1
                  ? "Start with the basics. We’ll take it one step at a time."
                  : step === 2
                    ? "Choose an amount that feels right for your month. You can always change it later."
                    : "Here’s a suggested starting point. Adjust any limit, or leave some unallocated for later."}
              </p>
            </div>

            {Object.keys(errors).length > 0 && (
              <div
                className="tf-setup-error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {errors.form ||
                  errors.allocation ||
                  "A small adjustment is needed. Check the fields below."}
              </div>
            )}

            <fieldset disabled={busy} className="tf-setup-fields">
              <legend className="sr-only">{steps[step - 1]}</legend>
              {step === 1 && (
                <>
                  <div className="tf-setup-field-group">
                    <label htmlFor="setup-name">What should we call you?</label>
                    <input
                      id="setup-name"
                      type="text"
                      autoComplete="given-name"
                      maxLength={60}
                      value={displayName}
                      onChange={(event) =>
                        changeField("displayName", event.target.value)
                      }
                      aria-invalid={!!errors.displayName}
                      aria-describedby={
                        errors.displayName ? "setup-name-error" : undefined
                      }
                    />
                    {errors.displayName && (
                      <p className="tf-setup-field-error" id="setup-name-error">
                        {errors.displayName}
                      </p>
                    )}
                  </div>
                  <div className="tf-setup-currency">
                    <span
                      className="tf-setup-currency-symbol"
                      aria-hidden="true"
                    >
                      ₸
                    </span>
                    <div>
                      <span>Your currency</span>
                      <strong>
                        Kazakhstani tenge <span>· KZT</span>
                      </strong>
                    </div>
                    <Check size={19} aria-label="Selected" />
                  </div>
                  <p className="tf-setup-help">
                    TengeFlow currently works in KZT. No bank connection is
                    needed.
                  </p>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="tf-setup-field-group">
                    <label htmlFor="setup-budget">Your monthly budget</label>
                    <div className="tf-setup-money-input tf-setup-budget-input">
                      <span aria-hidden="true">₸</span>
                      <input
                        id="setup-budget"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={30}
                        value={monthlyBudget}
                        onChange={(event) =>
                          changeField("monthlyBudget", event.target.value)
                        }
                        aria-invalid={!!errors.monthlyBudget}
                        aria-describedby={
                          errors.monthlyBudget
                            ? "setup-budget-error"
                            : "setup-budget-help"
                        }
                      />
                      <span className="tf-setup-currency-code">KZT</span>
                    </div>
                    {errors.monthlyBudget && (
                      <p
                        className="tf-setup-field-error"
                        id="setup-budget-error"
                      >
                        {errors.monthlyBudget}
                      </p>
                    )}
                    <p id="setup-budget-help" className="tf-setup-help">
                      This is your spending plan, not an account balance.
                    </p>
                  </div>
                  <div
                    className="tf-setup-suggestions"
                    role="group"
                    aria-label="Budget suggestions"
                  >
                    {[60000, 120000, 200000].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        aria-pressed={budget === amount}
                        onClick={() =>
                          changeField("monthlyBudget", String(amount))
                        }
                      >
                        {formatMoney(amount)}
                      </button>
                    ))}
                  </div>
                  <p className="tf-setup-budget-note">
                    Pick a starting point above, or enter your own amount. Next,
                    you’ll decide how to split it.
                  </p>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="tf-setup-allocation-heading">
                    <span>Monthly category limits</span>
                    <button
                      type="button"
                      className="tf-setup-text-button"
                      onClick={suggestLimits}
                    >
                      Use suggested limits
                    </button>
                  </div>
                  <div className="tf-setup-categories">
                    {categories.map((category) => (
                      <div className="tf-setup-category" key={category.id}>
                        <div className="tf-setup-category-label">
                          <CategoryIcon categoryId={category.id} size={19} />
                          <label htmlFor={`setup-limit-${category.id}`}>
                            <strong>
                              {category.name}
                              <span className="sr-only"> monthly limit</span>
                            </strong>
                            <span aria-hidden="true">
                              {categoryNotes[category.name]}
                            </span>
                          </label>
                        </div>
                        <div className="tf-setup-money-input">
                          <span aria-hidden="true">₸</span>
                          <input
                            id={`setup-limit-${category.id}`}
                            aria-label={`${category.name} monthly limit`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            maxLength={30}
                            value={categoryLimits[category.id] || ""}
                            aria-invalid={!!errors[category.id]}
                            aria-describedby={
                              errors[category.id]
                                ? `setup-limit-${category.id}-error`
                                : undefined
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraft((previous) => ({
                                ...previous,
                                categoryLimits: {
                                  ...previous.categoryLimits,
                                  [category.id]: value,
                                },
                              }));
                              setErrors({});
                              setAllocationNotice("");
                            }}
                          />
                        </div>
                        {errors[category.id] && (
                          <p
                            className="tf-setup-field-error"
                            id={`setup-limit-${category.id}-error`}
                          >
                            {errors[category.id]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="tf-setup-allocation-notice" role="status">
                    {allocationNotice}
                  </p>
                  <div
                    className={`tf-setup-allocation ${remainingCents < 0 ? "is-over" : ""}`}
                  >
                    <div className="tf-setup-allocation-total">
                      <span>Allocated</span>
                      <strong>
                        {limitsValid
                          ? formatMoney(allocatedCents / 100)
                          : "Check your limits"}
                        <span> / {formatMoney(budget || 0)}</span>
                      </strong>
                    </div>
                    <div className="tf-setup-allocation-bar" aria-hidden="true">
                      {categories.map((category, index) => (
                        <span
                          key={category.id}
                          style={{
                            width: `${budget && limitValues[index] !== null ? Math.max(0, (limitValues[index]! / budget) * 100) : 0}%`,
                            backgroundColor:
                              allocationColors[index % allocationColors.length],
                          }}
                        />
                      ))}
                    </div>
                    <p>
                      {!limitsValid
                        ? "Enter valid amounts to see what’s left."
                        : remainingCents < 0
                          ? `${formatMoney(-remainingCents / 100)} over your monthly budget`
                          : remainingCents === 0
                            ? "Everything has a place. You’re ready to begin."
                            : `${formatMoney(remainingCents / 100)} left unallocated — a little room to decide later.`}
                    </p>
                  </div>
                </>
              )}
            </fieldset>

            <div className="tf-setup-actions">
              {step > 1 && (
                <button
                  type="button"
                  className="tf-setup-back"
                  disabled={busy}
                  onClick={() => {
                    setErrors({});
                    setAllocationNotice("");
                    setDraft((previous) => ({
                      ...previous,
                      step: previous.step - 1,
                    }));
                  }}
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  Back
                </button>
              )}
              <button
                type="submit"
                className="tf-setup-continue"
                disabled={busy}
              >
                {operation === "save" ? (
                  <>
                    Saving your setup…
                    <Loader2
                      size={18}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  </>
                ) : (
                  <>
                    {step === 3 ? "Open my workspace" : "Continue"}
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
            <p className="tf-setup-footnote">
              {step === 3
                ? "Your workspace starts fresh. You can add your first expense next."
                : "You can adjust your budget and limits later."}
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
