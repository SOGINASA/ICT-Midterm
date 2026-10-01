import { create } from "zustand";
import { AuthSession, isApiConfigured, isExplicitlySignedOut, refreshSession, revokeSignedOutSession, setApiSession, subscribeToSession } from "../services/apiClient";
import { clearRecoverySession, rememberRecoverySession } from "../services/recoverySession";
import { authService, authErrorMessage } from "../services/authService";

const DEMO_KEY = "tengeflow.demo-session";
function readDemo() {
  try { return sessionStorage.getItem(DEMO_KEY) === "true"; } catch { return false; }
}
function persistDemo(value: boolean) {
  try {
    if (value) sessionStorage.setItem(DEMO_KEY, "true");
    else sessionStorage.removeItem(DEMO_KEY);
  } catch { /* An in-memory demo is still usable. */ }
}
function clearAccountDrafts(userId: string) {
  try {
    sessionStorage.removeItem(`tengeflow.account.${userId}.tengeflow.expense-draft.v1`);
    sessionStorage.removeItem(`tengeflow.account.${userId}.onboarding.v1`);
  } catch { /* No cached finance snapshot is kept. */ }
}
interface AuthState {
  session: AuthSession | null;
  ready: boolean;
  demo: boolean;
  recovery: boolean;
  error: string | null;
  initialize(): Promise<void>;
  enterDemo(): void;
  acceptSession(session: AuthSession): void;
  beginRecovery(session: AuthSession): void;
  clearRecovery(): void;
  leaveWorkspace(): Promise<void>;
}
let initialization: Promise<void> | null = null;
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null, ready: false, demo: readDemo(), recovery: false, error: null,
  initialize: () => {
    if (initialization) return initialization;
    initialization = (async () => {
      const path = window.location.pathname;
      const localDemoPage = get().demo && (path === "/app" || path.startsWith("/app/"));
      if (!isApiConfigured || localDemoPage || path === "/demo") { set({ ready: true }); return; }
      try {
        if (isExplicitlySignedOut()) await revokeSignedOutSession();
        else await refreshSession();
        set({ ready: true, error: null });
      } catch (error) {
        set({ ready: true, error: authErrorMessage(error) });
      }
    })();
    return initialization;
  },
  enterDemo: () => {
    persistDemo(true);
    set({ demo: true, recovery: false, error: null });
  },
  acceptSession: value => {
    if (value.recovery) throw new Error("Finish resetting your password before opening your workspace.");
    clearRecoverySession();
    persistDemo(false);
    setApiSession(value);
    set({ session: value, ready: true, demo: false, recovery: false, error: null });
  },
  beginRecovery: value => {
    if (!value.recovery) throw new Error("This link is not a password reset link.");
    rememberRecoverySession(value.user.id);
    persistDemo(false);
    setApiSession(value);
    set({ session: value, ready: true, demo: false, recovery: true, error: null });
  },
  clearRecovery: () => {
    clearRecoverySession();
    set({ recovery: false });
  },
  leaveWorkspace: async () => {
    const { demo, session } = get();
    if (!demo && session) {
      clearAccountDrafts(session.user.id);
      try { await authService.signOut(); }
      catch (error) {
        set({ error: `You’re signed out on this device. We couldn’t finish closing the server session. ${authErrorMessage(error)}` });
        throw error;
      }
    }
    clearRecoverySession();
    persistDemo(false);
    set({ demo: false, recovery: false, error: null });
  },
}));

// Refresh expiry and sign-out (including another tab) remove the account UI immediately.
subscribeToSession(session => {
  const previous = useAuthStore.getState().session;
  if (previous && (!session || previous.user.id !== session.user.id)) clearAccountDrafts(previous.user.id);
  if (!session || !session.recovery) clearRecoverySession();
  else rememberRecoverySession(session.user.id);
  useAuthStore.setState({ session, recovery: !!session?.recovery });
});
