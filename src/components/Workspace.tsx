import { ReactNode, useEffect, useMemo } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  createFinanceStore,
  FinanceStoreContext,
  useFinanceStore,
} from "../store/useFinanceStore";
import { useAuthStore } from "../store/useAuthStore";
import { LocalFinanceRepository } from "../services/financeRepository";
import { ApiFinanceRepository } from "../services/apiFinanceRepository";
import { StorageAdapter } from "../services/storage";
import { PeriodProvider } from "./PeriodContext";
import AppShell from "./AppShell";
import OnboardingPage from "../pages/OnboardingPage";

function accountDraftStorage(userId: string): StorageAdapter {
  const prefix = `tengeflow.account.${userId}.`;
  return {
    getItem: (key) => sessionStorage.getItem(prefix + key),
    setItem: (key, value) => sessionStorage.setItem(prefix + key, value),
    removeItem: (key) => sessionStorage.removeItem(prefix + key),
  };
}

function FinanceSession({
  userId,
  demo,
  children,
}: {
  userId: string;
  demo: boolean;
  children: ReactNode;
}) {
  // A new store per identity isolates old requests and drafts from the next account.
  const store = useMemo(
    () =>
      createFinanceStore(
        demo
          ? { repository: new LocalFinanceRepository() }
          : {
              repository: new ApiFinanceRepository(userId),
              storage: accountDraftStorage(userId),
            },
      ),
    [userId, demo],
  );
  return (
    <FinanceStoreContext.Provider value={store}>
      {children}
    </FinanceStoreContext.Provider>
  );
}

function FinanceReady() {
  const {
    initialized,
    initialize,
    error,
    profile,
    categories,
    completeOnboarding,
  } = useFinanceStore();
  const { demo, leaveWorkspace } = useAuthStore();
  const { pathname } = useLocation();
  useEffect(() => {
    void initialize();
  }, [initialize]);
  if (!initialized)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="card max-w-md p-7 text-center">
          <p className="text-4xl text-brand-600">₸</p>
          <h1 className="mt-5 text-xl font-semibold">
            {error
              ? "Couldn’t open your workspace"
              : "Getting your workspace ready…"}
          </h1>
          {error && (
            <>
              <p
                role="alert"
                className="mt-3 text-sm leading-relaxed text-slate-500"
              >
                {error}
              </p>
              <button
                className="btn-primary mt-5 w-full"
                onClick={() => {
                  void initialize();
                }}
              >
                Try again
              </button>
              <Link className="btn-secondary mt-3 w-full" to="/">
                Back to home
              </Link>
            </>
          )}
        </div>
      </main>
    );
  if (!demo && !profile.onboardingCompleted) {
    if (pathname !== "/onboarding")
      return <Navigate to="/onboarding" replace />;
    return (
      <OnboardingPage
        profile={profile}
        categories={categories}
        onComplete={completeOnboarding}
        onSignOut={leaveWorkspace}
      />
    );
  }
  if (pathname === "/onboarding") return <Navigate to="/app" replace />;
  return (
    <PeriodProvider>
      <AppShell />
    </PeriodProvider>
  );
}

export default function Workspace() {
  const { ready, demo, session } = useAuthStore();
  if (!ready && !demo)
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-slate-500"
      >
        Opening your workspace…
      </div>
    );
  if (!demo && !session) return <Navigate to="/login" replace />;
  const identity = demo ? "demo" : session!.user.id;
  return (
    <FinanceSession key={identity} userId={identity} demo={demo}>
      <FinanceReady />
    </FinanceSession>
  );
}
