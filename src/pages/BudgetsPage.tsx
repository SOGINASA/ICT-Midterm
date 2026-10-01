import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Pencil,
  Plus,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import Modal from "../components/Modal";
import Presence from "../components/Presence";
import CategoryIcon from "../components/CategoryIcon";
import { usePeriod } from "../components/PeriodContext";
import { useFinanceStore } from "../store/useFinanceStore";
import { formatMoney, fromMinorUnits, toMinorUnits } from "../utils/money";
import {
  categoryTotals,
  getMonthTransactions,
  remainingBudget,
  totalSpent,
} from "../utils/analytics";
import { budgetSchema } from "../utils/validation";

interface BudgetEdit {
  id: string;
  name: string;
  value: number;
}

export default function BudgetsPage() {
  const {
    transactions,
    categories,
    profile,
    setMonthlyBudget,
    setCategoryLimit,
  } = useFinanceStore();
  const { month, label } = usePeriod();
  const [editing, setEditing] = useState<BudgetEdit | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const monthlyTransactions = useMemo(
    () => getMonthTransactions(transactions, month),
    [transactions, month],
  );
  const spent = totalSpent(monthlyTransactions);
  const remaining = remainingBudget(profile.monthlyBudget, monthlyTransactions);
  const percentage =
    profile.monthlyBudget > 0
      ? (spent / profile.monthlyBudget) * 100
      : spent > 0
        ? 100
        : 0;
  const totals = categoryTotals(monthlyTransactions, categories);
  const allocated = fromMinorUnits(
    categories.reduce(
      (sum, category) => sum + toMinorUnits(category.monthlyLimit),
      0,
    ),
  );
  const overCategories = totals.filter(
    (category) => category.spent > category.monthlyLimit,
  );

  function openEditor(target: BudgetEdit) {
    setEditing(target);
    setAmount(String(target.value));
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const result = budgetSchema.safeParse(
      amount.trim() === "" ? NaN : Number(amount),
    );
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing.id === "overall") await setMonthlyBudget(result.data);
      else await setCategoryLimit(editing.id, result.data);
      setStatus(`${editing.name} updated to ${formatMoney(result.data)}.`);
      setEditing(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save your budget. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">
            Budgets
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Give your money a plan. Leave room for life.
          </p>
        </div>
        <Link
          to="/app/add"
          className="btn-primary hidden shrink-0 sm:inline-flex"
        >
          <Plus size={18} />
          Add expense
        </Link>
      </header>
      <Presence present={!!status} variant="collapse">
        {status && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="flex-1">{status}</span>
            <button
              className="flex min-h-[44px] min-w-[44px] items-center justify-center"
              aria-label="Dismiss notification"
              onClick={() => setStatus("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </Presence>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section
          className="card p-5 sm:p-6"
          aria-labelledby="monthly-budget-heading"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                <Wallet size={21} />
              </div>
              <div>
                <h2 id="monthly-budget-heading" className="section-title">
                  Monthly budget
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Your overall spending limit
                </p>
              </div>
            </div>
            <button
              className="btn-secondary gap-2 !px-3 !py-2"
              onClick={() =>
                openEditor({
                  id: "overall",
                  name: "Monthly budget",
                  value: profile.monthlyBudget,
                })
              }
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
          </div>
          <p className="mt-7 text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
            {formatMoney(profile.monthlyBudget)}
          </p>
          <div className="mb-2.5 mt-6 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{formatMoney(spent)} spent</span>
            <span
              className={`font-medium ${remaining < 0 ? "text-red-700" : "text-slate-700"}`}
            >
              {Math.round(percentage)}% used
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Monthly budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.round(percentage), 100)}
            aria-valuetext={`${formatMoney(spent)} spent of ${formatMoney(profile.monthlyBudget)}`}
            className="h-2.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className={`h-full rounded-full ${remaining < 0 ? "bg-red-500" : "bg-emerald-700"}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Spending for {label}
          </div>
        </section>
        <section
          className={`card flex flex-col justify-between p-5 sm:p-6 ${remaining < 0 ? "!border-red-100 !bg-red-50/40" : "!border-emerald-100 !bg-emerald-50/40"}`}
          aria-label="Remaining budget"
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${remaining < 0 ? "text-red-800" : "text-emerald-900"}`}
            >
              {remaining < 0 ? "Over your monthly budget" : "Room to spend"}
            </span>
            {remaining < 0 ? (
              <AlertCircle size={20} className="text-red-700" />
            ) : (
              <ArrowUpRight size={20} className="text-emerald-700" />
            )}
          </div>
          <div className="my-7">
            <p
              className={`text-4xl font-semibold tracking-tight tabular-nums ${remaining < 0 ? "text-red-800" : "text-emerald-900"}`}
            >
              {formatMoney(Math.abs(remaining))}
            </p>
            <p
              className={`mt-2 text-sm ${remaining < 0 ? "text-red-700" : "text-emerald-800"}`}
            >
              {remaining < 0
                ? "above your planned spending"
                : "left in your monthly budget"}
            </p>
          </div>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            {remaining < 0
              ? "Review your expenses or adjust your limit to make a plan that works for you."
              : "A little awareness goes a long way. Keep tracking to stay close to your plan."}
          </p>
        </section>
      </div>
      <section aria-labelledby="category-budgets-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="category-budgets-heading" className="section-title">
              Category budgets
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              A little structure for your everyday spending.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {categories.length} categories · {formatMoney(allocated)} allocated
          </span>
        </div>
        <Presence present={overCategories.length > 0} variant="collapse" className="mb-5">
          {overCategories.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
            >
              <AlertCircle size={19} className="mt-0.5 shrink-0" />
              <p>
                <strong>
                  {overCategories.map((category) => category.name).join(", ")}
                </strong>{" "}
                {overCategories.length === 1 ? "is" : "are"} over budget this
                month. You can review spending or adjust a category limit below.
              </p>
            </div>
          )}
        </Presence>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {totals.map((category) => {
            const over = category.spent > category.monthlyLimit;
            const used =
              category.monthlyLimit > 0
                ? (category.spent / category.monthlyLimit) * 100
                : category.spent > 0
                  ? 100
                  : 0;
            const near = !over && used >= 85;
            return (
              <article key={category.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CategoryIcon categoryId={category.id} />
                    <h3 className="text-sm font-semibold text-slate-900">
                      {category.name}
                    </h3>
                  </div>
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-emerald-700"
                    aria-label={`Edit ${category.name} budget`}
                    onClick={() =>
                      openEditor({
                        id: category.id,
                        name: `${category.name} budget`,
                        value: category.monthlyLimit,
                      })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="mt-6 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                    {formatMoney(category.spent)}
                  </span>
                  <span className="text-xs text-slate-500">
                    of {formatMoney(category.monthlyLimit)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${category.name} budget used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(Math.round(used), 100)}
                  aria-valuetext={`${formatMoney(category.spent)} spent of ${formatMoney(category.monthlyLimit)}`}
                  className="mb-3 mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={`h-full rounded-full ${over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{ width: `${Math.min(used, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`flex items-center gap-1.5 ${over ? "text-red-700" : near ? "text-amber-700" : "text-slate-500"}`}
                  >
                    {over && <AlertCircle size={13} />}
                    {formatMoney(
                      Math.abs(category.monthlyLimit - category.spent),
                    )}{" "}
                    {over ? "over budget" : "left"}
                  </span>
                  <span className="text-slate-500">{Math.round(used)}%</span>
                </div>
              </article>
            );
          })}
          <article className="flex flex-col justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6">
            <Target size={23} className="mb-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-800">
              Small plans. Better habits.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Each expense belongs to one category, so your spending is always
              counted once.
            </p>
          </article>
        </div>
      </section>
      <div className="flex items-start gap-2.5 text-xs leading-5 text-slate-500">
        <Info className="mt-0.5 shrink-0" size={16} />
        <p>
          Your limits apply to every month.{" "}
          {allocated > profile.monthlyBudget
            ? `Category limits are ${formatMoney(allocated - profile.monthlyBudget)} above the overall budget. Adjust them if you want your plan to balance.`
            : allocated < profile.monthlyBudget
              ? `${formatMoney(profile.monthlyBudget - allocated)} of your overall budget is not allocated to a category.`
              : "Your category limits add up to your overall budget."}
        </p>
      </div>
      <Presence present={!!editing} variant="modal">
        {editing && (
          <Modal
            title={`Edit ${editing.name.toLowerCase()}`}
            onClose={() => {
              if (!busy) setEditing(null);
            }}
          >
            <form onSubmit={save} noValidate className="space-y-5">
              <p className="text-sm leading-6 text-slate-500">
                Choose a monthly limit that feels realistic. You can change it at
                any time.
              </p>
              <div>
                <label className="label" htmlFor="budget-limit">
                  Monthly limit (₸)
                </label>
                <input
                  id="budget-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="field"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? "budget-limit-error" : "budget-limit-hint"
                  }
                />
                <p id="budget-limit-hint" className="mt-2 text-xs text-slate-500">
                  Applies to every month. Enter 0 for a zero-spend budget.
                </p>
                {error && (
                  <p
                    id="budget-limit-error"
                    role="alert"
                    className="mt-2 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save budget"}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </Presence>
    </div>
  );
}
