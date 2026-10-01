import ChartTooltipContent from "../components/ChartTooltipContent";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  Plus,
  ReceiptText,
  Target,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinanceStore } from "../store/useFinanceStore";
import { usePeriod } from "../components/PeriodContext";
import CategoryIcon, { chartColors } from "../components/CategoryIcon";
import {
  categoryTotals,
  getMonthTransactions,
  remainingBudget,
  totalSpent,
} from "../utils/analytics";
import { formatMoney } from "../utils/money";
import { formatDate, monthKey } from "../utils/dates";

export default function DashboardPage() {
  const { transactions, categories, profile } = useFinanceStore();
  const { month, label } = usePeriod();
  const current = getMonthTransactions(transactions, month);
  const spent = totalSpent(current);
  const remaining = remainingBudget(profile.monthlyBudget, current);
  const percentage =
    profile.monthlyBudget > 0
      ? (spent / profile.monthlyBudget) * 100
      : spent > 0
        ? 100
        : 0;
  const totals = categoryTotals(current, categories);
  const chartData = totals.filter((category) => category.spent > 0);
  const recent = [...current]
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 4);
  const monthDate = new Date(`${month}-01T12:00:00`);
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();
  const lastExpenseDay = Math.max(
    1,
    ...current.map((t) => Number(t.occurredAt.slice(8, 10))),
  );
  const dayCount =
    month === monthKey()
      ? Math.max(new Date().getDate(), lastExpenseDay)
      : daysInMonth;
  const daily = Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    amount: totalSpent(
      current.filter((t) => Number(t.occurredAt.slice(8, 10)) === index + 1),
    ),
  }));
  const average = dayCount ? spent / dayCount : 0;
  const topCategory = [...totals].sort((a, b) => b.spent - a.spent)[0];
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="eyebrow">A clearer picture</span>
          </div>
          <h1 className="page-heading">Overview</h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Welcome back, {profile.displayName}. Here’s where you stand this
            month.
          </p>
        </div>
        <Link to="/app/add" className="btn-primary">
          <Plus size={18} /> Add expense
        </Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:gap-5">
        <section className="relative col-span-2 overflow-hidden rounded-2xl md:col-span-1 border border-[#dceadd] bg-[#eaf3e8] p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-[13px] font-medium text-[#4b6452]">
              Left to spend
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 text-[#55735a]">
              <Wallet size={18} strokeWidth={1.6} />
            </span>
          </div>
          <p
            className={`number text-[37px] font-semibold leading-none xl:text-[40px] ${remaining < 0 ? "text-red-800" : "text-[#214c35]"}`}
          >
            {formatMoney(remaining)}
          </p>
          <div className="mb-3 mt-6 h-1.5 overflow-hidden rounded-full bg-white/75">
            <div
              className={`h-full rounded-full ${remaining < 0 ? "bg-red-500" : "bg-[#719574]"}`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-[#54705b]">
            {remaining >= 0 ? <Check size={13} /> : <Target size={13} />}
            {profile.monthlyBudget === 0 && spent === 0
              ? "Set a monthly budget to start your plan"
              : remaining >= 0
                ? `${Math.round(100 - Math.min(100, percentage))}% of your monthly budget is still available`
                : "You’re over your monthly budget"}
          </p>
        </section>
        <section className="card p-4 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-[13px] font-medium text-slate-500">
              Total spent
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fcf1e8] text-[#b57c50]">
              <ArrowUpRight size={19} strokeWidth={1.6} />
            </span>
          </div>
          <p className="number text-[25px] font-semibold leading-none md:text-[37px] xl:text-[40px]">
            {formatMoney(spent)}
          </p>
          <p className="mt-6 text-xs text-slate-500">
            <span className="mr-1.5 inline-block rounded-md bg-slate-50 px-1 py-1 md:px-2 font-medium text-slate-700">
              {current.length} transactions
            </span>{" "}
            this month
          </p>
          <p className="mt-3 hidden text-[11px] text-slate-400 md:block">
            Every little expense, all in one place.
          </p>
        </section>
        <section className="card p-4 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-[13px] font-medium text-slate-500">
              Monthly budget
            </p>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf2fa] text-[#6b86af]">
              <Target size={18} strokeWidth={1.6} />
            </span>
          </div>
          <p className="number text-[25px] font-semibold leading-none md:text-[37px] xl:text-[40px]">
            {formatMoney(profile.monthlyBudget)}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 md:mt-5">
            <p className="text-xs text-slate-500">
              Plan for {label.split(" ")[0]}
            </p>
            <Link
              to="/app/budgets"
              className="flex min-h-11 items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Manage <ArrowUpRight size={14} />
            </Link>
          </div>
          <p className="hidden text-[11px] text-slate-400 md:block">
            A little structure. More peace of mind.
          </p>
        </section>
      </div>
      <div className="mb-6 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="card min-w-0 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Spending over time</h2>
              <p className="mt-1 text-xs text-slate-500">
                Your daily expenses, at a glance
              </p>
            </div>
            <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-600">
              Daily
            </span>
          </div>
          <div className="mb-2 mt-5 flex items-baseline gap-2">
            <span className="number text-2xl font-semibold">
              {formatMoney(average)}
            </span>
            <span className="text-xs text-slate-500">daily average</span>
          </div>
          <div
            className="h-[205px] w-full"
            role="img"
            aria-label={`Daily spending during ${label}. ${formatMoney(spent)} total; ${formatMoney(average)} per day on average.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={daily}
                margin={{ top: 12, right: 6, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5eab86" stopOpacity={0.2} />
                    <stop
                      offset="100%"
                      stopColor="#5eab86"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#edf0f3"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={26}
                  tick={{ fontSize: 10, fill: "#89939e" }}
                  tickFormatter={(day) => `${label.slice(0, 3)} ${day}`}
                  dy={7}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#89939e" }}
                  tickFormatter={(value) =>
                    value >= 1000 ? `${value / 1000}k` : `${value}`
                  }
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  contentStyle={{
                    border: "1px solid #e7ebef",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatMoney(Number(value)), "Spent"]}
                  labelFormatter={(day) => `${label.split(" ")[0]} ${day}`}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#328b63"
                  strokeWidth={2}
                  fill="url(#spendingFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card min-w-0 p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="section-title">Where it all goes</h2>
              <p className="mt-1 text-xs text-slate-500">
                Spending by category
              </p>
            </div>
            <Link
              to="/app/insights"
              className="icon-button !h-8 !w-8"
              aria-label="View spending insights"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row xl:gap-0">
            <div
              className="relative h-[185px] w-[185px] shrink-0"
              role="img"
              aria-label={
                spent
                  ? `Category spending: ${totals.map((c) => `${c.name} ${formatMoney(c.spent)}`).join(", ")}`
                  : "No spending for this month"
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spent ? chartData : [{ spent: 1 }]}
                    dataKey="spent"
                    innerRadius={65}
                    outerRadius={84}
                    paddingAngle={spent ? 3 : 0}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {(spent ? chartData : [{ id: "empty" }]).map((category) => (
                      <Cell
                        key={category.id}
                        fill={
                          spent
                            ? chartColors[
                                categories.findIndex(
                                  (c) => c.id === category.id,
                                )
                              ]
                            : "#edf1ed"
                        }
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-500">Total spent</span>
                <span className="number mt-1 text-xl font-semibold">
                  {formatMoney(spent)}
                </span>
              </div>
            </div>
            <div className="w-full flex-1 space-y-3.5 px-2">
              {totals.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        chartColors[
                          categories.findIndex((c) => c.id === category.id)
                        ] || "#e5eade",
                    }}
                  />
                  <span className="text-slate-500">{category.name}</span>
                  <span className="ml-auto font-medium">
                    {spent ? Math.round((category.spent / spent) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <ArrowDownLeft
              className="mt-0.5 shrink-0 text-brand-600"
              size={14}
            />
            {spent > 0 ? (
              <p>
                <span className="font-medium text-slate-700">
                  {topCategory.name}
                </span>{" "}
                is your biggest category, making up{" "}
                {Math.round((topCategory.spent / spent) * 100)}% of this month’s
                spending.
              </p>
            ) : (
              <p>Add your first expense to see your spending habits.</p>
            )}
          </div>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-3 pt-5 md:px-6">
            <div>
              <h2 className="section-title">Recent transactions</h2>
              <p className="mt-1 text-xs text-slate-500">
                The little things add up
              </p>
            </div>
            <Link
              to="/app/transactions"
              className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-brand-700"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            <div>
              {recent.map((transaction) => {
                const category = categories.find(
                  (c) => c.id === transaction.categoryId,
                );
                return (
                  <Link
                    key={transaction.id}
                    to={`/app/transactions?edit=${transaction.id}`}
                    className="flex min-h-[79px] items-center gap-3 border-t border-slate-100 px-5 py-3 transition-colors hover:bg-slate-50 md:px-6"
                  >
                    <CategoryIcon categoryId={transaction.categoryId} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">
                        {transaction.note || category?.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {category?.name}
                        <span>·</span>
                        {formatDate(transaction.occurredAt)}
                        {transaction.syncStatus === "pending" && (
                          <span className="text-amber-700">· Pending</span>
                        )}
                      </p>
                    </div>
                    <span className="ml-auto hidden items-center gap-1.5 text-[11px] capitalize text-slate-500 sm:flex">
                      {transaction.paymentMethod === "card" ? (
                        <CreditCard size={13} />
                      ) : (
                        <Wallet size={13} />
                      )}
                      {transaction.paymentMethod}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[13px] font-semibold sm:ml-4">
                      −{formatMoney(transaction.amount)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <ReceiptText className="mx-auto mb-3 text-slate-400" size={30} />
              <p className="font-medium">A fresh start</p>
              <p className="muted mt-2">No expenses recorded for {label}.</p>
              <Link to="/app/add" className="btn-secondary mt-5">
                <Plus size={16} /> Add your first expense
              </Link>
            </div>
          )}
        </section>
        <section className="card p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="section-title">Your budgets</h2>
              <p className="mt-1 text-xs text-slate-500">
                A plan for every part of life
              </p>
            </div>
            <Link
              to="/app/budgets"
              className="icon-button !h-8 !w-8"
              aria-label="View all budgets"
            >
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="space-y-5">
            {totals.slice(0, 3).map((category) => (
              <div key={category.id}>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">{category.name}</span>
                  <span className="text-slate-400">
                    <span
                      className={
                        category.remaining < 0
                          ? "font-medium text-red-700"
                          : "text-slate-600"
                      }
                    >
                      {formatMoney(category.spent)}
                    </span>{" "}
                    / {formatMoney(category.monthlyLimit)}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className={`h-full rounded-full ${category.remaining < 0 ? "bg-red-400" : "bg-[#7aa78e]"}`}
                    style={{ width: `${Math.min(100, category.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/app/budgets"
            className="mt-6 flex min-h-11 items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-brand-700"
          >
            See all 5 category budgets <ChevronRight size={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}
