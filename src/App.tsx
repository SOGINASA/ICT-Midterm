import { useEffect } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Workspace from "./components/Workspace";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import DashboardPage from "./pages/DashboardPage";
import AddExpensePage from "./pages/AddExpensePage";
import TransactionsPage from "./pages/TransactionsPage";
import BudgetsPage from "./pages/BudgetsPage";
import InsightsPage from "./pages/InsightsPage";
import { useAuthStore } from "./store/useAuthStore";

function BrowserEffects() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const recovery = useAuthStore((state) => state.recovery);
  useEffect(() => {
    if (recovery) navigate("/reset-password", { replace: true });
  }, [recovery, navigate]);
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Know where your money goes",
      "/login": "Sign in",
      "/register": "Create account",
      "/forgot-password": "Reset password",
      "/reset-password": "New password",
      "/onboarding": "Set up your workspace",
      "/app": "Overview",
      "/app/add": "Add expense",
      "/app/transactions": "Transactions",
      "/app/budgets": "Budgets",
      "/app/insights": "Insights",
    };
    document.title = `TengeFlow · ${titles[pathname] || "Your personal workspace"}`;
    if (hash)
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function DemoEntry() {
  const enterDemo = useAuthStore((state) => state.enterDemo);
  const demo = useAuthStore((state) => state.demo);
  useEffect(() => {
    enterDemo();
  }, [enterDemo]);
  return demo ? (
    <Navigate to="/app" replace />
  ) : (
    <div role="status">Opening demo…</div>
  );
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <BrowserEffects />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route
          path="/register"
          element={<AuthPage key="register" mode="register" />}
        />
        <Route
          path="/forgot-password"
          element={<AuthPage key="forgot" mode="forgot" />}
        />
        <Route path="/reset-password" element={<AuthCallbackPage recovery />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/demo" element={<DemoEntry />} />
        <Route path="/onboarding" element={<Workspace />} />
        <Route path="/app" element={<Workspace />}>
          <Route index element={<DashboardPage />} />
          <Route path="add" element={<AddExpensePage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="insights" element={<InsightsPage />} />
        </Route>
        {["add", "transactions", "budgets", "insights"].map((path) => (
          <Route
            key={path}
            path={`/${path}`}
            element={<Navigate to={`/app/${path}`} replace />}
          />
        ))}
        <Route
          path="*"
          element={
            <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
              <p className="eyebrow">404</p>
              <h1 className="page-heading">This page isn’t here.</h1>
              <Link to="/" className="btn-primary">
                Back to home
              </Link>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
