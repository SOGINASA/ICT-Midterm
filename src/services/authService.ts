import { hasRecoverySession } from "./recoverySession";
import {
  ApiError, AuthSession, assertAuthRevision, authenticatedApiRequest,
  authSessionSchema, beginAuthOperation, clearApiSession, getApiSession, getAuthRevision, markSignedOut, revokeSignedOutSession,
  publicApiRequest, withAuthCookieLock,
} from "./apiClient";

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "invalid_credentials") return "The email or password is incorrect. Please try again.";
    if (error.code === "email_not_confirmed") return "Confirm your email before signing in. Check your inbox for the confirmation link.";
    if (error.status === 429) return "Too many attempts. Please wait a little and try again.";
    if (error.code === "weak_password") return "Choose a stronger password with at least 8 characters.";
    return error.message;
  }
  if (error instanceof TypeError) return "Couldn’t reach the account service. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

const codeExchanges = new Map<string, Promise<AuthSession>>();
export const authService = {
  exchangeCode(code: string, purpose: "signup" | "recovery"): Promise<AuthSession> {
    const key = `${purpose}:${code}`;
    const existing = codeExchanges.get(key);
    if (existing) return existing;
    const revision = beginAuthOperation();
    const exchange = (async () => {
      const value = authSessionSchema.parse(await withAuthCookieLock(() => {
        assertAuthRevision(revision);
        return publicApiRequest("/auth/exchange-code", { method: "POST", body: { code, purpose } });
      }));
      assertAuthRevision(revision);
      if (value.recovery !== (purpose === "recovery")) throw new Error("This link could not be verified. Request a new one.");
      return value;
    })();
    codeExchanges.set(key, exchange);
    void exchange.then(() => codeExchanges.delete(key), () => codeExchanges.delete(key));
    return exchange;
  },
  async signIn(email: string, password: string): Promise<AuthSession> {
    const revision = beginAuthOperation();
    const value = authSessionSchema.parse(await withAuthCookieLock(() => {
      assertAuthRevision(revision);
      return publicApiRequest("/auth/login", { method: "POST", body: { email, password } });
    }));
    assertAuthRevision(revision);
    if (value.recovery) throw new Error("Sign in again to open your workspace.");
    return value;
  },
  async signUp(displayName: string, email: string, password: string): Promise<null> {
    await publicApiRequest("/auth/register", { method: "POST", body: { displayName, email, password } });
    return null;
  },
  async requestPasswordReset(email: string) {
    await publicApiRequest("/auth/forgot-password", { method: "POST", body: { email } });
  },
  async updatePassword(password: string, expectedUserId: string): Promise<AuthSession> {
    const session = getApiSession();
    const revision = getAuthRevision();
    if (!hasRecoverySession(expectedUserId) || !session?.recovery) throw new Error("This reset session has expired. Request a new reset link.");
    const result = authSessionSchema.parse(await withAuthCookieLock(() => {
      assertAuthRevision(revision);
      return authenticatedApiRequest("/auth/password", {
        method: "POST", body: { password }, expectedUserId, allowRecovery: true,
      });
    }));
    if (result.user.id !== expectedUserId || result.recovery) throw new Error("Your session changed. Open a new reset link before changing your password.");
    return result;
  },
  async signOut() {
    const token = getApiSession()?.access_token;
    // Clear immediately, including other tabs, so an outstanding refresh cannot restore a logged-out account.
    markSignedOut();
    clearApiSession(true);
    await revokeSignedOutSession(token);
  },
};
