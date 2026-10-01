import { authService } from "./authService";
import { AuthSession, clearApiSession, setApiSession } from "./apiClient";
import { clearRecoverySession, rememberRecoverySession } from "./recoverySession";
const userId = "c58f5f21-920f-43a1-8f1b-9e28937cf001";
const session: AuthSession = { user: { id: userId, email: "ayan@example.com" }, access_token: "verified-token", recovery: false };
function response(body: unknown, status = 200): Response { return { ok: status >= 200 && status < 300, status, json: async () => body } as Response; }
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset(); global.fetch = fetchMock;
  clearApiSession(); clearRecoverySession(); sessionStorage.clear();
});
afterEach(() => jest.restoreAllMocks());
it("shares an in-flight code exchange but never reuses it after completion", async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(value => { resolve = value; }));
  const first = authService.exchangeCode("single-use", "signup");
  expect(authService.exchangeCode("single-use", "signup")).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(response(session));
  await expect(first).resolves.toEqual(session);
  fetchMock.mockResolvedValueOnce(response({ error: { message: "Code already consumed" } }, 400));
  await expect(authService.exchangeCode("single-use", "signup")).rejects.toThrow("Code already consumed");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("does not permanently cache a failed exchange", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Temporary network failure"));
  await expect(authService.exchangeCode("retry", "signup")).rejects.toThrow("Temporary network failure");
  fetchMock.mockResolvedValueOnce(response(session));
  await expect(authService.exchangeCode("retry", "signup")).resolves.toEqual(session);
});
it("sends the route's explicit purpose and rejects a mismatched session scope", async () => {
  fetchMock.mockResolvedValueOnce(response(session));
  await expect(authService.exchangeCode("recovery-code", "recovery")).rejects.toThrow("could not be verified");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: "recovery-code", purpose: "recovery" });
});
it("refuses an expired recovery proof before requesting a password change", async () => {
  setApiSession({ ...session, recovery: true });
  const now = Date.UTC(2026, 8, 30, 12);
  const clock = jest.spyOn(Date, "now").mockReturnValue(now);
  rememberRecoverySession(userId);
  clock.mockReturnValue(now + 15 * 60 * 1000);
  await expect(authService.updatePassword("A new secure password", userId)).rejects.toThrow("expired");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("requires a server-issued recovery scope even if a browser proof was forged", async () => {
  setApiSession(session);
  rememberRecoverySession(userId);
  await expect(authService.updatePassword("A new secure password", userId)).rejects.toThrow("expired");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("refuses a password change after switching to another user", async () => {
  rememberRecoverySession(userId);
  setApiSession({ ...session, recovery: true, user: { ...session.user, id: "c58f5f21-920f-43a1-8f1b-9e28937cf002" } });
  await expect(authService.updatePassword("A new secure password", userId)).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("returns the new normal session after a verified recovery password change", async () => {
  setApiSession({ ...session, recovery: true }); rememberRecoverySession(userId);
  fetchMock.mockResolvedValueOnce(response(session));
  await expect(authService.updatePassword("A new secure password", userId)).resolves.toEqual(session);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/password");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "A new secure password" });
});
it("ignores an old login response after sign-out", async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise(value => { resolve = value; }));
  const pending = authService.signIn("ayan@example.com", "password");
  clearApiSession(); resolve(response(session));
  await expect(pending).rejects.toThrow("session changed");
});
it("keeps a failed logout signed out until an explicit new login is accepted", async () => {
  setApiSession(session);
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(authService.signOut()).rejects.toThrow("Failed to fetch");
  const { getApiSession, refreshSession } = await import("./apiClient");
  expect(getApiSession()).toBeNull();
  await expect(refreshSession()).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("tengeflow.signed-out")).toBe("true");
  setApiSession(session);
  expect(localStorage.getItem("tengeflow.signed-out")).toBeNull();
});
it("does not dispatch a queued login after logout invalidates it", async () => {
  const { withAuthCookieLock } = await import("./apiClient");
  let release!: () => void;
  const holding = withAuthCookieLock(() => new Promise<void>(resolve => { release = resolve; }));
  const pending = authService.signIn("ayan@example.com", "password");
  clearApiSession(); release(); await holding;
  await expect(pending).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not dispatch a queued password change after the recovery identity changes", async () => {
  const { withAuthCookieLock } = await import("./apiClient");
  setApiSession({ ...session, recovery: true }); rememberRecoverySession(userId);
  let release!: () => void;
  const holding = withAuthCookieLock(() => new Promise<void>(resolve => { release = resolve; }));
  const pending = authService.updatePassword("A new secure password", userId);
  setApiSession(session); release(); await holding;
  await expect(pending).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
});
