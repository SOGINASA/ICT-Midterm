import { useMemo } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Lightbulb,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
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
import CategoryIcon, {
  chartColors as sharedChartColors,
} from "../components/CategoryIcon";
import { usePeriod } from "../components/PeriodContext";
import { useFinanceStore } from "../store/useFinanceStore";
import { formatMoney } from "../utils/money";
import {
  categoryTotals,
  getMonthTransactions,
  remainingBudget,
  totalSpent,
} from "../utils/analytics";
import { parseCalendarDate } from "../utils/dates";
import AnimatedDetails from "../components/AnimatedDetails";
import ChartTooltipContent from "../components/ChartTooltipContent";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e7ebef",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  fontSize: 12,
};

export default function InsightsPage() {
  const { transactions, categories, profile } = useFinanceStore();
  const { month, label } = usePeriod();
  const chartColors = Object.fromEntries(
    categories.map((category, index) => [
      category.id,
      sharedChartColors[index % sharedChartColors.length],
    ]),
  );
  const monthlyTransactions = useMemo(
    () => getMonthTransactions(transactions, month),
    [transactions, month],
  );
  const spent = totalSpent(monthlyTransactions);
  const totals = categoryTotals(monthlyTransactions, categories).sort(
    (a, b) => b.spent - a.spent,
  );
  const largest = totals[0];
  const average = monthlyTransactions.length
    ? spent / monthlyTransactions.length
    : 0;
  const activeDays = new Set(
    monthlyTransactions.map((transaction) =>
      parseCalendarDate(transaction.occurredAt).getDate(),
    ),
  ).size;
  const chartData = totals.filter((category) => category.spent > 0);
  const dailyData = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const days = new Date(year, monthNumber, 0).getDate();
    const dailyTotals = Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      amount: 0,
    }));
    monthlyTransactions.forEach((transaction) => {
      dailyTotals[
        parseCalendarDate(transaction.occurredAt).getDate() - 1
      ].amount += transaction.amount;
    });
    return dailyTotals;
  }, [month, monthlyTransactions]);
  const busiestDay = dailyData.reduce(
    (highest, day) => (day.amount > highest.amount ? day : highest),
    dailyData[0],
  );
  const largestPercent =
    spent && largest ? Math.round((largest.spent / spent) * 100) : 0;
  const remaining = remainingBudget(profile.monthlyBudget, monthlyTransactions);

  return (
    <div className="space-y-7">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">
            Insights
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            A clearer picture of where your money goes.
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
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total spent",
            value: formatMoney(spent),
            helper: label,
            icon: Wallet,
          },
          {
            label: "Average expense",
            value: formatMoney(average),
            helper: `Across ${monthlyTransactions.length} transactions`,
            icon: ReceiptText,
          },
          {
            label: "Days with spending",
            value: String(activeDays),
            helper: `Of ${dailyData.length} days this month`,
            icon: CalendarDays,
          },
        ].map((stat) => (
          <section
            className="card p-5 sm:p-6"
            key={stat.label}
            aria-label={stat.label}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{stat.label}</span>
              <stat.icon size={18} className="text-slate-400" />
            </div>
            <p className="mt-5 text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-slate-500">{stat.helper}</p>
          </section>
        ))}
      </div>
      {spent > 0 ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
            <section
              className="card min-w-0 p-5 sm:p-6"
              aria-labelledby="category-chart-heading"
            >
              <h2 id="category-chart-heading" className="section-title">
                Spending by category
              </h2>
              <p className="mt-1.5 text-xs text-slate-500">
                Your month, broken down.
              </p>
              <div
                className="relative mx-auto mt-3 h-[245px] max-w-[300px]"
                role="img"
                aria-label={`Category breakdown: ${totals.map((category) => `${category.name} ${formatMoney(category.spent)}`).join(", ")}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="spent"
                      nameKey="name"
                      innerRadius={75}
                      outerRadius={102}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {chartData.map((category) => (
                        <Cell
                          key={category.id}
                          fill={chartColors[category.id] || chartColors.other}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltipContent />}
                      formatter={(value) => formatMoney(Number(value))}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-500">Total spent</span>
                  <strong className="mt-1.5 text-[23px] font-semibold tracking-tight text-slate-900">
                    {formatMoney(spent)}
                  </strong>
                </div>
              </div>
              <ul className="space-y-3.5">
                {totals.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2.5 text-slate-600">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            chartColors[category.id] || chartColors.other,
                        }}
                      />
                      {category.name}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium tabular-nums text-slate-800">
                        {formatMoney(category.spent)}
                      </span>
                      <span className="w-8 text-right text-xs tabular-nums text-slate-500">
                        {Math.round((category.spent / spent) * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section
              className="card min-w-0 p-5 sm:p-6"
              aria-labelledby="trend-heading"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="trend-heading" className="section-title">
                    Daily spending
                  </h2>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Small purchases. The bigger picture.
                  </p>
                </div>
                <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
                  KZT (₸)
                </span>
              </div>
              <div
                className="mt-8 h-[260px] w-full"
                role="img"
                aria-label={`Daily spending in ${label}. Highest spending was ${formatMoney(busiestDay.amount)} on day ${busiestDay.day}. A detailed table follows.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dailyData}
                    margin={{ top: 10, right: 8, left: -17, bottom: 3 }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 5"
                      vertical={false}
                      stroke="#e7ebef"
                    />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      ticks={[1, 5, 10, 15, 20, 25, dailyData.length]}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickMargin={12}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickFormatter={(value: number) =>
                        value >= 1000 ? `${value / 1000}k` : String(value)
                      }
                      tickMargin={8}
                    />
                    <Tooltip
                      content={<ChartTooltipContent />}
                      formatter={(value) => [
                        formatMoney(Number(value)),
                        "Spent",
                      ]}
                      labelFormatter={(day) =>
                        new Date(
                          `${month}-${String(day).padStart(2, "0")}T12:00:00`,
                        ).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                        })
                      }
                      contentStyle={tooltipStyle}
                    />
                    <Area
                      type="linear"
                      dataKey="amount"
                      stroke="#187451"
                      strokeWidth={2.5}
                      fill="#e8f3ed"
                      isAnimationActive={false}
                      dot={false}
                      activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-5 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-500">
                Your busiest spending day was{" "}
                <span className="font-medium text-slate-800">
                  {new Date(
                    `${month}-${String(busiestDay.day).padStart(2, "0")}T12:00:00`,
                  ).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
                , with {formatMoney(busiestDay.amount)} recorded.
              </p>
              <AnimatedDetails className="mt-3 text-xs text-slate-500"
                summary="View daily amounts"
                summaryClassName="min-h-[44px] w-fit cursor-pointer py-3 font-medium text-emerald-800">
                <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100">
                  <table className="w-full text-left">
                    <caption className="sr-only">
                      Daily spending for {label}
                    </caption>
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 font-medium" scope="col">
                          Day
                        </th>
                        <th
                          className="px-3 py-2 text-right font-medium"
                          scope="col"
                        >
                          Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyData.map((day) => (
                        <tr key={day.day} className="border-t border-slate-100">
                          <th scope="row" className="px-3 py-2 font-normal">
                            {day.day}
                          </th>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(day.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AnimatedDetails>
            </section>
          </div>
          <section className="grid gap-5 md:grid-cols-2">
            <article className="card flex items-start gap-4 p-5 sm:p-6">
              <CategoryIcon categoryId={largest.id} />
              <div className="min-w-0">
                <p className="eyebrow">Your largest category</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {largest.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  <span className="font-medium text-slate-800">
                    {formatMoney(largest.spent)}
                  </span>{" "}
                  went to {largest.name.toLowerCase()}, making up{" "}
                  {largestPercent}% of your spending this month.
                </p>
                <Link
                  className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-emerald-800 hover:underline"
                  to="/app/transactions"
                >
                  Review transactions <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
            <article className="flex items-start gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 sm:p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700">
                <Lightbulb size={21} />
              </div>
              <div>
                <p className="eyebrow !text-emerald-800">
                  A little perspective
                </p>
                <h2 className="mt-2 text-xl font-semibold text-emerald-950">
                  {remaining >= 0
                    ? "Your plan has room."
                    : "Time to check your plan."}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {remaining >= 0
                    ? `You have ${formatMoney(remaining)} left in your monthly budget. Keeping track of the little things helps you see the whole picture.`
                    : `You are ${formatMoney(Math.abs(remaining))} above your monthly budget. Review your biggest categories and set limits that fit your routine.`}
                </p>
                <Link
                  className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-emerald-800 hover:underline"
                  to="/app/budgets"
                >
                  View your budgets <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="card flex flex-col items-center px-6 py-20 text-center">
          <div className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
            <ChartNoAxesCombined size={28} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Your story starts with one expense
          </h2>
          <p className="mb-6 mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Add an expense for {label} and your category breakdown and daily
            spending will appear here.
          </p>
          <Link className="btn-primary" to="/app/add">
            Add expense
          </Link>
        </section>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Insights reflect the expenses you recorded for {label}. Card and cash
        payments are included.
      </p>
    </div>
  );
}
