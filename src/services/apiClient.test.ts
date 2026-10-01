import { AuthSession, authenticatedApiRequest, clearApiSession, getApiSession, refreshSession, setApiSession, subscribeToSession } from "./apiClient";
const account: AuthSession = { access_token: "old-access", user: { id: "c58f5f21-920f-43a1-8f1b-9e28937cf001", email: "ayan@example.com" }, recovery: false };
const refreshed = { ...account, access_token: "new-access" };
const other = { ...account, access_token: "other-access", user: { id: "c58f5f21-920f-43a1-8f1b-9e28937cf002", email: "other@example.com" } };
const options = { method: "POST" as const, expectedUserId: account.user.id, body: { amount: 100 } };
const fetchMock = jest.fn();
function response(body: unknown, status = 200): Response { return { ok: status >= 200 && status < 300, status, json: async () => body } as Response; }
const expired = () => response({ error: { code: "token_expired", message: "Expired" } }, 401);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { clearApiSession(); setApiSession(account); global.fetch = fetchMock; fetchMock.mockReset(); });

test("refreshes once for concurrent expired requests and retries with the renewed token", async () => {
  const refresh = deferred<Response>();
  fetchMock.mockImplementation((path, init) => {
    if (path === "/api/auth/refresh") return refresh.promise;
    return Promise.resolve(init.headers.Authorization === "Bearer old-access" ? expired() : response({ saved: true }));
  });
  const first = authenticatedApiRequest("/transactions", options);
  const second = authenticatedApiRequest("/profile/budget", options);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  refresh.resolve(response(refreshed));
  await expect(Promise.all([first, second])).resolves.toEqual([{ saved: true }, { saved: true }]);
  expect(fetchMock.mock.calls.filter(([path]) => path === "/api/auth/refresh")).toHaveLength(1);
  expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
});
test("never retries a previous user's pending write after an account switch", async () => {
  const request = deferred<Response>();
  fetchMock.mockReturnValueOnce(request.promise);
  const pending = authenticatedApiRequest("/transactions", options);
  setApiSession(other);
  request.resolve(expired());
  await expect(pending).rejects.toThrow("session changed");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getApiSession()?.user.id).toBe(other.user.id);
});
test("rejects late successful data after signing out", async () => {
  const request = deferred<Response>();
  fetchMock.mockReturnValueOnce(request.promise);
  const pending = authenticatedApiRequest("/transactions", options);
  clearApiSession(); request.resolve(response({ saved: true }));
  await expect(pending).rejects.toThrow("session changed");
  expect(getApiSession()).toBeNull();
});
test("does not restore a logged-out session from an outstanding refresh", async () => {
  const request = deferred<Response>();
  fetchMock.mockReturnValueOnce(request.promise);
  const pending = refreshSession();
  clearApiSession(); request.resolve(response(refreshed));
  await expect(pending).rejects.toThrow("session changed");
  expect(getApiSession()).toBeNull();
});
test("rejects a changed refresh-cookie identity without replaying the write", async () => {
  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response(other));
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("session changed");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getApiSession()).toBeNull();
});
test("expires the account UI after the refresh cookie is rejected", async () => {
  const listener = jest.fn(); const unsubscribe = subscribeToSession(listener);
  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("session changed");
  expect(getApiSession()).toBeNull(); expect(listener).toHaveBeenLastCalledWith(null);
  unsubscribe();
});
test("retries no more than once when the renewed token is also rejected", async () => {
  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response(refreshed)).mockResolvedValueOnce(expired());
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("Expired");
  expect(fetchMock).toHaveBeenCalledTimes(3); expect(getApiSession()).toBeNull();
});
test("preserves the account during network failure without pretending to enter demo", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("Failed to fetch");
  expect(getApiSession()?.user.id).toBe(account.user.id);
});
test("a recovery token cannot access finance endpoints or silently refresh into normal scope", async () => {
  setApiSession({ ...account, recovery: true });
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(expired());
  await expect(authenticatedApiRequest("/auth/password", { ...options, allowRecovery: true })).rejects.toThrow("Expired");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("never persists access or refresh tokens in browser storage", async () => {
  localStorage.clear(); sessionStorage.clear();
  fetchMock.mockResolvedValueOnce(response(refreshed));
  await refreshSession();
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
});
test("honors a sign-out in another tab before sending a pending account write", async () => {
  localStorage.setItem("tengeflow.signed-out", "true");
  await expect(authenticatedApiRequest("/transactions", options)).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(getApiSession()).toBeNull();
});
