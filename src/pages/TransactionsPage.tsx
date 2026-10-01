import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import Modal from "../components/Modal";
import Presence from "../components/Presence";
import CategoryIcon from "../components/CategoryIcon";
import { usePeriod } from "../components/PeriodContext";
import { useFinanceStore } from "../store/useFinanceStore";
import { formatMoney } from "../utils/money";
import { getMonthTransactions, totalSpent } from "../utils/analytics";
import { expenseSchema } from "../utils/validation";
import { formatDate } from "../utils/dates";

type Expense = import("../types/finance").Transaction;

const dateValue = (iso: string) => iso.slice(0, 10);

function EditExpense({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { categories, updateExpense, deleteExpense } = useFinanceStore();
  const [amount, setAmount] = useState(String(expense.amount));
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">(
    expense.paymentMethod,
  );
  const [date, setDate] = useState(dateValue(expense.occurredAt));
  const [note, setNote] = useState(expense.note || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = expenseSchema.safeParse({
      amount: Number(amount),
      categoryId,
      paymentMethod,
      note,
      occurredAt: date,
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        nextErrors[String(issue.path[0])] = issue.message;
      });
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await updateExpense(expense.id, parsed.data);
      onSaved("Expense updated. Your totals are up to date.");
      onClose();
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Could not update the expense. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      onSaved("Expense deleted. Your totals are up to date.");
      onClose();
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Could not delete the expense. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={confirmDelete ? "Delete this expense?" : "Edit expense"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {confirmDelete ? (
        <div key="delete" className="motion-content-enter space-y-5">
          <p className="text-sm leading-6 text-slate-600">
            {expense.note ||
              categories.find((category) => category.id === expense.categoryId)
                ?.name}{" "}
            ·{" "}
            <strong className="text-slate-900">
              {formatMoney(expense.amount)}
            </strong>{" "}
            will be removed. Your budget and insights will update automatically.
          </p>
          <p className="text-sm text-slate-600">
            This action cannot be undone.
          </p>
          {errors.form && (
            <p role="alert" className="text-sm text-red-700">
              {errors.form}
            </p>
          )}
          <div className="flex gap-3">
            <button
              className="btn-secondary flex-1"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              Keep expense
            </button>
            <button
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              onClick={remove}
              disabled={busy}
            >
              <Trash2 size={16} />
              {busy ? "Deleting…" : "Delete expense"}
            </button>
          </div>
        </div>
      ) : (
        <form key="edit" onSubmit={save} noValidate className="motion-content-enter space-y-5">
          <div>
            <label className="label" htmlFor="edit-amount">
              Amount (₸)
            </label>
            <input
              id="edit-amount"
              className="field"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "edit-amount-error" : undefined}
            />
            {errors.amount && (
              <p
                id="edit-amount-error"
                role="alert"
                className="mt-2 text-sm text-red-700"
              >
                {errors.amount}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="edit-category">
              Category
            </label>
            <select
              id="edit-category"
              className="field"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {errors.categoryId}
              </p>
            )}
          </div>
          <fieldset>
            <legend className="label">Payment method</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["card", "cash"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border text-sm font-medium ${paymentMethod === method ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {method === "card" ? (
                    <CreditCard size={17} />
                  ) : (
                    <Wallet size={17} />
                  )}
                  {method === "card" ? "Card" : "Cash"}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="edit-date">
              Date
            </label>
            <input
              id="edit-date"
              type="date"
              className="field"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={Boolean(errors.occurredAt)}
            />
            {errors.occurredAt && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {errors.occurredAt}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="edit-note">
              Note{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="edit-note"
              className="field"
              value={note}
              maxLength={120}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was it for?"
            />
            {errors.note && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {errors.note}
              </p>
            )}
          </div>
          {errors.form && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {errors.form}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 size={17} />
              Delete
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function TransactionsPage() {
  const { transactions, categories } = useFinanceStore();
  const { month, label } = usePeriod();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [payment, setPayment] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [status, setStatus] = useState("");
  const monthTransactions = useMemo(
    () => getMonthTransactions(transactions, month),
    [transactions, month],
  );
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId) return;
    const selectedExpense = monthTransactions.find(
      (transaction) => transaction.id === editId,
    );
    if (selectedExpense) setEditing(selectedExpense);
  }, [editId, monthTransactions]);
  function closeEditor() {
    setEditing(null);
    if (editId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("edit");
      setSearchParams(nextParams, { replace: true });
    }
  }
  const filtered = useMemo(
    () =>
      monthTransactions
        .filter((transaction) => {
          const categoryName =
            categories.find(
              (category) => category.id === transaction.categoryId,
            )?.name || "";
          const matchesSearch =
            `${transaction.note || ""} ${categoryName} ${transaction.amount}`
              .toLowerCase()
              .includes(search.toLowerCase().trim());
          const day = dateValue(transaction.occurredAt);
          return (
            matchesSearch &&
            (categoryId === "all" || transaction.categoryId === categoryId) &&
            (payment === "all" || transaction.paymentMethod === payment) &&
            (!dateFrom || day >= dateFrom) &&
            (!dateTo || day <= dateTo)
          );
        })
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [
      monthTransactions,
      categories,
      search,
      categoryId,
      payment,
      dateFrom,
      dateTo,
    ],
  );
  const hasFilters = Boolean(
    search || categoryId !== "all" || payment !== "all" || dateFrom || dateTo,
  );
  const resetFilters = () => {
    setSearch("");
    setCategoryId("all");
    setPayment("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">
            Transactions
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Every little expense, all in one place.
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
            <CheckCircle2 className="shrink-0" size={18} />
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
      <section
        className="card overflow-hidden"
        aria-label="Transaction history"
      >
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Your expenses</h2>
              <p className="mt-1 text-sm text-slate-500">
                {label} · {monthTransactions.length} transactions
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Total spent</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {formatMoney(totalSpent(monthTransactions))}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="transaction-search">
                Search transactions
              </label>
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="field !pl-11"
                id="transaction-search"
                placeholder="Search transactions…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button
              className={`btn-secondary gap-2 ${showFilters ? "!border-emerald-300 !bg-emerald-50 !text-emerald-800" : ""}`}
              aria-expanded={showFilters}
              aria-label="Filter transactions"
              aria-controls="transaction-filters"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={17} />
              <span className="hidden sm:inline">Filters</span>
              {(payment !== "all" || dateFrom || dateTo) && (
                <span
                  className="h-2 w-2 rounded-full bg-emerald-700"
                  aria-label="Filters active"
                />
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Filter by category">
            {[{ id: "all", name: "All expenses" }, ...categories].map(
              (category) => (
                <button
                  key={category.id}
                  aria-pressed={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`min-h-[44px] rounded-lg px-3.5 text-xs font-semibold transition-colors sm:text-sm ${categoryId === category.id ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                >
                  {category.name}
                </button>
              ),
            )}
          </div>
          <Presence present={showFilters} variant="collapse">
            {showFilters && (
              <div
                id="transaction-filters"
                className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"
              >
                <div>
                  <label className="label" htmlFor="filter-payment">
                    Payment
                  </label>
                  <select
                    id="filter-payment"
                    className="field"
                    value={payment}
                    onChange={(event) => setPayment(event.target.value)}
                  >
                    <option value="all">All methods</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="filter-from">
                    From date
                  </label>
                  <input
                    type="date"
                    id="filter-from"
                    className="field"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="filter-to">
                    To date
                  </label>
                  <input
                    type="date"
                    id="filter-to"
                    className="field"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </div>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-3">
                  Date filters apply within {label}. Use the month selector to
                  browse other months.
                </p>
              </div>
            )}
          </Presence>
        </div>
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] gap-4 border-y border-slate-100 bg-slate-50/70 px-6 py-3 text-xs font-medium text-slate-500 md:grid">
          <span>Transaction</span>
          <span>Category</span>
          <span>Date</span>
          <span>Payment</span>
          <span className="text-right">Amount</span>
        </div>
        {filtered.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {filtered.map((transaction) => {
              const category = categories.find(
                (item) => item.id === transaction.categoryId,
              );
              const dateLabel = formatDate(transaction.occurredAt);
              return (
                <li key={transaction.id}>
                  <button
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] sm:px-6"
                    onClick={() => setEditing(transaction)}
                    aria-label={`Edit ${transaction.note || category?.name || "expense"}, ${formatMoney(transaction.amount)}, ${dateLabel}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <CategoryIcon categoryId={transaction.categoryId} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {transaction.note || category?.name || "Expense"}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 md:hidden">
                          {category?.name} · {dateLabel} ·{" "}
                          {transaction.paymentMethod === "card"
                            ? "Card"
                            : "Cash"}
                        </span>
                        {transaction.syncStatus === "pending" && (
                          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Pending sync
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="hidden text-sm text-slate-600 md:block">
                      {category?.name}
                    </span>
                    <span className="hidden text-sm text-slate-500 md:block">
                      {dateLabel}
                    </span>
                    <span className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
                      {transaction.paymentMethod === "card" ? (
                        <CreditCard size={15} />
                      ) : (
                        <Wallet size={15} />
                      )}
                      {transaction.paymentMethod === "card" ? "Card" : "Cash"}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                      −{formatMoney(transaction.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 rounded-2xl bg-slate-50 p-4">
              <Search size={24} className="text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-900">
              {hasFilters
                ? "No matching expenses"
                : "A fresh start for this month"}
            </h3>
            <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-slate-500">
              {hasFilters
                ? "Try a different search or clear your filters to see more transactions."
                : "Add your first expense to start seeing where your money goes."}
            </p>
            {hasFilters ? (
              <button className="btn-secondary" onClick={resetFilters}>
                Clear filters
              </button>
            ) : (
              <Link className="btn-primary" to="/app/add">
                Add expense
              </Link>
            )}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:px-6">
            <span>
              {filtered.length} {filtered.length === 1 ? "expense" : "expenses"}
              {hasFilters
                ? ` · ${formatMoney(totalSpent(filtered))} shown`
                : " · Select a transaction to edit"}
            </span>
            {hasFilters && (
              <button
                className="min-h-[44px] font-medium text-emerald-800 hover:underline"
                onClick={resetFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
      <Presence present={!!editing} variant="modal">
        {editing && (
          <EditExpense
            key={editing.id}
            expense={editing}
            onClose={closeEditor}
            onSaved={setStatus}
          />
        )}
      </Presence>
    </div>
  );
}
