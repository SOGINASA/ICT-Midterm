import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Plus,
  Target,
  UserRound,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useFinanceStore } from "../store/useFinanceStore";
import { useAuthStore } from "../store/useAuthStore";
import { usePeriod } from "./PeriodContext";
import Modal from "./Modal";
import Presence from "./Presence";
import Brand from "./Brand";
import { useMobileKeyboard } from "../hooks/useMobileKeyboard";
import { authErrorMessage } from "../services/authService";

const navigation = [
  { to: "/app", label: "Overview", mobile: "Home", icon: LayoutDashboard },
  {
    to: "/app/transactions",
    label: "Transactions",
    mobile: "History",
    icon: ListFilter,
  },
  { to: "/app/budgets", label: "Budgets", mobile: "Budgets", icon: Wallet },
  {
    to: "/app/insights",
    label: "Insights",
    mobile: "Insights",
    icon: BarChart3,
  },
];

export default function AppShell() {
  const keyboardOpen = useMobileKeyboard();
  const { month, setMonth, label } = usePeriod();
  const store = useFinanceStore();
  const { demo, session, leaveWorkspace } = useAuthStore();
  const syncPending = store.syncPending;
  const pendingCount = store.transactions.filter(
    (transaction) => transaction.syncStatus === "pending",
  ).length;
  const [online, setOnline] = useState(navigator.onLine);
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const offline = (demo && store.demoOffline) || !online;
  const initials = store.profile.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (demo && !offline && pendingCount > 0)
      void syncPending().catch(() => {});
  }, [demo, offline, pendingCount, syncPending]);
  const moveMonth = (delta: number) => {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + delta);
    setMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  async function signOut() {
    setLeaving(true);
    setAccountError("");
    try {
      await leaveWorkspace();
      navigate("/", { replace: true });
    } catch (error) {
      setAccountError(authErrorMessage(error));
    } finally {
      setLeaving(false);
    }
  }
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col overflow-y-auto border-r border-[#e7ebef] bg-white px-5 lg:flex">
        <div className="flex min-h-[94px] items-center px-3">
          <Brand />
        </div>
        <p className="eyebrow mb-3 mt-6 px-4">Your workspace</p>
        <nav aria-label="Main navigation" className="space-y-1.5">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex min-h-[47px] items-center gap-3 rounded-xl px-4 text-[13px] font-medium transition-colors ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`
              }
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pb-5 pt-8">
          <div className="mb-5 rounded-2xl bg-[#f5f8f2] p-4 [@media(max-height:760px)]:hidden">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-600">
              <Target size={20} strokeWidth={1.6} />
            </div>
            <p className="text-[13px] font-semibold">
              Small steps. Better habits.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              A little tracking today makes tomorrow feel more in control.
            </p>
            <Link
              to="/app/budgets"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-brand-700"
            >
              Check your budgets <ArrowUpRight size={14} />
            </Link>
          </div>
          <button
            onClick={() => setHelp(true)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-[13px] text-slate-500 hover:bg-slate-50"
          >
            <CircleHelp size={18} /> About TengeFlow
          </button>
          <button
            onClick={() => setAccount(true)}
            aria-label="Open account menu"
            className="mt-4 flex w-full items-center gap-3 border-t border-slate-100 px-2 pb-2 pt-5 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0eae0] text-xs font-semibold text-[#85765d]">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">
                {store.profile.displayName}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {demo ? "Demo workspace" : "Personal account"}
              </span>
            </span>
            <ChevronRight
              size={16}
              className="ml-auto shrink-0 text-slate-400"
            />
          </button>
        </div>
      </aside>
      <div className="lg:ml-[236px]">
        <header className="safe-top border-b border-[#e7ebef] bg-white">
          <div className="safe-gutters mx-auto flex max-w-[1510px] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 md:min-h-[79px]">
            <div className="flex min-h-11 flex-1 items-center gap-3">
              <span className="lg:hidden">
                <Brand compact />
              </span>
              <span className="hidden text-[13px] text-slate-500 lg:block">
                Your money, in perspective
              </span>
              <span className="rounded-md border border-[#e4e9e3] bg-[#f6f8f3] px-2 py-1 text-[10px] font-medium text-[#53694e]">
                {demo ? "DEMO" : "MY ACCOUNT"}
              </span>
            </div>
            <button
              className="icon-button lg:hidden"
              onClick={() => setAccount(true)}
              aria-label="Open account menu"
            >
              <UserRound size={20} />
            </button>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:gap-4">
              {demo ? (
                <button
                  type="button"
                  onClick={() => store.setDemoOffline(!store.demoOffline)}
                  aria-pressed={store.demoOffline}
                  aria-label={
                    store.demoOffline
                      ? "Turn off demo offline mode"
                      : "Local demo"
                  }
                  title={
                    store.demoOffline
                      ? "Turn off demo offline mode"
                      : "Try demo offline mode"
                  }
                  className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-xs ${offline ? "bg-amber-50 text-amber-800" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {offline ? <WifiOff size={16} /> : <Wifi size={16} />}
                  <span className="hidden sm:inline">
                    {offline ? "Offline mode" : "Local demo"}
                  </span>
                </button>
              ) : (
                <span
                  className={`flex min-h-11 items-center gap-2 text-xs ${offline ? "text-amber-800" : "text-slate-500"}`}
                >
                  {offline ? <WifiOff size={16} /> : <Cloud size={16} />}
                  <span className="hidden sm:inline">
                    {offline ? "Offline" : "Connected"}
                  </span>
                </span>
              )}
              <div className="flex items-center">
                <button
                  className="icon-button"
                  onClick={() => moveMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={17} />
                </button>
                <span className="flex min-w-[130px] items-center justify-center gap-2 text-xs font-medium md:text-[13px]">
                  <CalendarDays className="hidden sm:block" size={15} />
                  {label}
                </span>
                <button
                  className="icon-button"
                  onClick={() => moveMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="safe-gutters mobile-content-bottom mx-auto max-w-[1510px] pt-6 md:pt-9">
          <Presence present={offline} variant="collapse" className="mb-6">
            {offline && (
              <div
                role="status"
                className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                <WifiOff size={19} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {demo && store.demoOffline
                      ? "Demo offline mode is on"
                      : "You’re offline"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {demo
                      ? "Expenses stay on this device as pending. Reconnect to simulate sync; no data is sent to a server."
                      : "You can review loaded data and keep editing your draft. Reconnect before saving changes to your account."}
                  </p>
                </div>
                {demo && store.demoOffline && (
                  <button
                    className="min-h-11 px-2 text-xs font-semibold underline"
                    onClick={() => store.setDemoOffline(false)}
                  >
                    Go online
                  </button>
                )}
              </div>
            )}
          </Presence>
          <Presence present={!!store.error} variant="collapse" className="mb-5">
            {store.error && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <span className="min-w-0 flex-1">{store.error}</span>
                <button
                  className="icon-button"
                  onClick={store.clearError}
                  aria-label="Dismiss error"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </Presence>
          <main
            id="main-content"
            className="page-enter"
            key={location.pathname}
          >
            <Outlet />
          </main>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-x-4 border-t border-slate-200/70 pt-4 text-[11px] text-slate-500">
            <span>TengeFlow · Make room for what matters.</span>
            <button
              onClick={() => setHelp(true)}
              className="min-h-11 hover:text-brand-700"
            >
              {demo ? "Demo data" : "Your account"} · KZT (₸)
            </button>
          </footer>
        </div>
      </div>
      <Presence present={!keyboardOpen && location.pathname !== "/app/add"} variant="floating">
        {!keyboardOpen && location.pathname !== "/app/add" && (
          <Link
            to="/app/add"
            className="btn-primary mobile-action-bottom fixed z-20 !rounded-full shadow-lg lg:hidden"
            aria-label="Add expense"
          >
            <Plus size={19} /> Add expense
          </Link>
        )}
      </Presence>
      <Presence present={!keyboardOpen} variant="floating">
        {!keyboardOpen && (
          <nav
            aria-label="Mobile navigation"
            className="safe-bottom safe-gutters fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 pt-1 backdrop-blur-md lg:hidden"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `flex min-h-[59px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-brand-600" : "text-slate-500"}`
                }
              >
                <item.icon size={20} strokeWidth={1.8} />
                <span>{item.mobile}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </Presence>
      <Presence present={help} variant="modal">
        {help && (
          <Modal title="A little about TengeFlow" onClose={() => setHelp(false)}>
            <div className="space-y-4 text-sm leading-relaxed text-slate-600">
              <p>
                A personal expense tracker for everyday life. Add a purchase, give
                it a category, and see how it changes your budget.
              </p>
              <p>
                {demo
                  ? "You are using sample data stored only in this browser. The Wi-Fi control demonstrates offline entries and simulated sync."
                  : "Your account saves expenses and budget limits to your connected database. An internet connection is required to save changes."}
              </p>
              <p>We never ask for bank logins or card numbers.</p>
              <Link to="/" className="btn-secondary w-full">
                About the project
              </Link>
              <button
                className="btn-primary w-full"
                onClick={() => setHelp(false)}
              >
                Got it
              </button>
            </div>
          </Modal>
        )}
      </Presence>
      <Presence present={account} variant="modal">
        {account && (
          <Modal
            title={demo ? "Your demo workspace" : "Your account"}
            onClose={() => {
              if (!leaving) setAccount(false);
            }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {store.profile.displayName}
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  {demo
                    ? "Sample data · saved in this browser"
                    : session?.user.email}
                </p>
              </div>
            </div>
            {demo ? (
              <>
                <p className="mb-5 text-sm leading-relaxed text-slate-500">
                  Explore freely. Your demo expenses stay separate from a personal
                  account.
                </p>
                <Link className="btn-primary mb-3 w-full" to="/register">
                  Create my account
                  <ArrowUpRight size={16} />
                </Link>
                <Link className="btn-secondary mb-3 w-full" to="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <p className="mb-5 text-sm leading-relaxed text-slate-500">
                Your personal expenses are connected to this account. Signing out
                clears this workspace from the screen.
              </p>
            )}
            {accountError && (
              <p role="alert" className="mb-4 text-sm text-red-700">
                {accountError}
              </p>
            )}
            <button
              className="btn-secondary w-full"
              disabled={leaving}
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut size={16} />
              {leaving ? "Please wait…" : demo ? "Exit demo" : "Sign out"}
            </button>
          </Modal>
        )}
      </Presence>
    </div>
  );
}
