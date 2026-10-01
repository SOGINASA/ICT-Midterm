import { FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Plus,
  ReceiptText,
} from "lucide-react";
import CategoryIcon from "../components/CategoryIcon";
import Modal from "../components/Modal";
import Presence from "../components/Presence";
import { usePeriod } from "../components/PeriodContext";
import { useAuthStore } from "../store/useAuthStore";
import { useFinanceStore } from "../store/useFinanceStore";
import { Transaction } from "../types/finance";
import { expenseSchema } from "../utils/validation";
import { getMonthTransactions, remainingBudget } from "../utils/analytics";
import { formatMoney } from "../utils/money";
import { monthLabel, monthKey } from "../utils/dates";

export default function AddExpensePage() {
  const demo = useAuthStore((state) => state.demo);
  const {
    draft,
    updateDraft,
    clearDraft,
    categories,
    transactions,
    profile,
    addExpense,
    demoOffline,
  } = useFinanceStore();
  const { setMonth } = usePeriod();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Transaction | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const afterClose = useRef<"overview" | "another">("overview");
  const navigate = useNavigate();
  const expenseMonth = /^\d{4}-\d{2}-\d{2}$/.test(draft.occurredAt)
    ? draft.occurredAt.slice(0, 7)
    : monthKey();
  const remaining = remainingBudget(
    profile.monthlyBudget,
    getMonthTransactions(transactions, expenseMonth),
  );
  const amount = Number(draft.amount.replace(",", "."));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = expenseSchema.safeParse({ ...draft, amount });
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        nextErrors[String(issue.path[0])] = issue.message;
      });
      setErrors(nextErrors);
      if (nextErrors.amount) inputRef.current?.focus();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const transaction = await addExpense(result.data);
      setSaved(transaction);
      clearDraft();
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Couldn’t save this expense. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };
  const done = () => {
    if (saved) setMonth(saved.occurredAt.slice(0, 7));
    afterClose.current = "overview";
    setSaved(null);
  };
  const afterSavedClose = () => {
    if (afterClose.current === "overview") navigate("/app");
    else inputRef.current?.focus({ preventScroll: true });
  };
  const savedStatus = transactions.find(
    (transaction) => transaction.id === saved?.id,
  )?.syncStatus;
  const savedRemaining = saved
    ? remainingBudget(
        profile.monthlyBudget,
        getMonthTransactions(transactions, saved.occurredAt.slice(0, 7)),
      )
    : 0;
  return (
    <div>
      <Link
        to="/app"
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs text-slate-500 hover:text-brand-700"
      >
        <ArrowLeft size={15} /> Back to overview
      </Link>
      <div className="mb-7">
        <h1 className="page-heading">Add expense</h1>
        <p className="mt-2 text-[13px] text-slate-500">
          A few seconds now. A clearer picture later.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.55fr_1fr]">
        <form onSubmit={submit} noValidate className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-[#fcfdfb] px-5 py-7 md:px-8">
            <label htmlFor="amount" className="label !text-xs !text-slate-500">
              How much did you spend?
            </label>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-medium text-brand-600">₸</span>
              <input
                ref={inputRef}
                id="amount"
                type="text"
                inputMode="decimal"
                autoFocus
                autoComplete="off"
                placeholder="0"
                value={draft.amount}
                onChange={(e) => updateDraft({ amount: e.target.value })}
                aria-invalid={!!errors.amount}
                aria-describedby={
                  errors.amount ? "amount-error" : "currency-hint"
                }
                className="number min-w-0 flex-1 rounded-lg border-0 bg-transparent py-3 text-5xl font-semibold leading-none text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
              />
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500">
                KZT
              </span>
            </div>
            {errors.amount ? (
              <p
                id="amount-error"
                role="alert"
                className="mt-2 text-xs text-red-600"
              >
                {errors.amount}
              </p>
            ) : (
              <p id="currency-hint" className="mt-2 text-xs text-slate-400">
                Kazakhstani tenge
              </p>
            )}
          </div>
          <div className="space-y-6 p-5 md:p-8">
            <fieldset>
              <legend className="label">Choose a category</legend>
              <div className="grid grid-cols-3 gap-2 min-[375px]:grid-cols-5 min-[375px]:gap-1.5 sm:gap-2">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-0.5 py-3.5 text-[10px] sm:text-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 ${draft.categoryId === category.id ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={category.id}
                      checked={draft.categoryId === category.id}
                      onChange={() => updateDraft({ categoryId: category.id })}
                      className="sr-only"
                    />
                    <CategoryIcon categoryId={category.id} size={21} />
                    <span>{category.name}</span>
                    {draft.categoryId === category.id && (
                      <Check className="absolute right-1.5 top-1.5" size={12} />
                    )}
                  </label>
                ))}
              </div>
              {errors.categoryId && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {errors.categoryId}
                </p>
              )}
            </fieldset>
            <div className="grid gap-6 sm:grid-cols-2">
              <fieldset>
                <legend className="label">Payment method</legend>
                <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {(["card", "cash"] as const).map((method) => (
                    <label
                      key={method}
                      className={`flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 ${draft.paymentMethod === method ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method}
                        checked={draft.paymentMethod === method}
                        onChange={() => updateDraft({ paymentMethod: method })}
                        className="sr-only"
                      />
                      {method === "card" ? (
                        <CreditCard size={16} />
                      ) : (
                        <Banknote size={16} />
                      )}
                      {method === "card" ? "Card" : "Cash"}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="expense-date" className="label">
                  Date
                </label>
                <input
                  id="expense-date"
                  type="date"
                  className="field"
                  value={draft.occurredAt}
                  onChange={(e) => updateDraft({ occurredAt: e.target.value })}
                  aria-invalid={!!errors.occurredAt}
                />
                {errors.occurredAt && (
                  <p role="alert" className="mt-2 text-xs text-red-600">
                    {errors.occurredAt}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="expense-note" className="label">
                Note{" "}
                <span className="ml-1 font-normal text-slate-400">
                  (optional)
                </span>
              </label>
              <textarea
                id="expense-note"
                value={draft.note}
                onChange={(e) => updateDraft({ note: e.target.value })}
                rows={2}
                maxLength={120}
                placeholder="Lunch with friends, a taxi home…"
                className="field resize-none"
              />
              <p className="mt-1 text-right text-[10px] text-slate-400">
                {draft.note.length} / 120
              </p>
              {errors.note && (
                <p role="alert" className="text-xs text-red-600">
                  {errors.note}
                </p>
              )}
            </div>
            {errors.form && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {errors.form}
              </p>
            )}
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? "Saving expense…" : "Save expense"}
                <ArrowRight size={17} />
              </button>
              <Link to="/app" className="btn-secondary sm:min-w-[115px]">
                Cancel
              </Link>
            </div>
          </div>
        </form>
        <aside className="space-y-5">
          <div className="card p-6">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ReceiptText size={21} strokeWidth={1.6} />
            </div>
            <h2 className="section-title">See the bigger picture</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Every expense gives your budget a little more clarity.
            </p>
            <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-slate-500">
                  {monthLabel(`${expenseMonth}-01`)} budget
                </span>
                <span className="font-medium">
                  {formatMoney(profile.monthlyBudget)}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-slate-500">Currently available</span>
                <span className="font-medium">{formatMoney(remaining)}</span>
              </div>
              <div className="flex justify-between gap-3 rounded-lg bg-brand-50 p-3 text-xs">
                <span className="text-brand-700">After this expense</span>
                <span
                  className={`font-semibold ${remaining - (Number.isFinite(amount) && amount > 0 ? amount : 0) < 0 ? "text-red-700" : "text-brand-700"}`}
                >
                  {formatMoney(
                    remaining -
                      (Number.isFinite(amount) && amount > 0 ? amount : 0),
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-2 text-xs leading-relaxed text-slate-500">
            <LockKeyhole size={17} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              {demo
                ? demoOffline || !navigator.onLine
                  ? "No connection needed. Your demo expense will be saved on this device as pending."
                  : "Just your numbers. No bank accounts or card details needed. This demo saves data in your browser."
                : "Your expense is saved to your account after the server confirms it. An internet connection is required."}
            </p>
          </div>
        </aside>
      </div>
      <Presence present={!!saved} variant="modal" onExitComplete={afterSavedClose}>
        {saved && (
          <Modal title="Expense added" onClose={done}>
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <CheckCircle2 size={32} strokeWidth={1.7} />
              </span>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">
                All accounted for.
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {
                  categories.find((category) => category.id === saved.categoryId)
                    ?.name
                }{" "}
                · {formatMoney(saved.amount)}
              </p>
              <div className="my-6 rounded-xl bg-slate-50 px-4 py-5">
                <p className="text-xs text-slate-500">
                  {savedRemaining < 0 ? "Over budget" : "Left to spend"} in{" "}
                  {monthLabel(saved.occurredAt)}
                </p>
                <p
                  className={`number mt-2 text-3xl font-semibold ${savedRemaining < 0 ? "text-red-700" : "text-brand-700"}`}
                >
                  {formatMoney(Math.abs(savedRemaining))}
                </p>
              </div>
              {savedStatus === "pending" && (
                <p
                  role="status"
                  className="mb-5 text-xs leading-relaxed text-amber-800"
                >
                  Saved on this device — pending demo sync when the connection
                  returns.
                </p>
              )}
              <button className="btn-primary w-full" onClick={done}>
                Done <Check size={17} />
              </button>
              <button
                className="btn-secondary mt-3 w-full"
                onClick={() => {
                  afterClose.current = "another";
                  setSaved(null);
                }}
              >
                <Plus size={16} /> Add another
              </button>
            </div>
          </Modal>
        )}
      </Presence>
    </div>
  );
}
