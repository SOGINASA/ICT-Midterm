import { seedCategories } from "../data/seed";
import { ExpenseInput, OnboardingInput } from "../types/finance";
import { ApiFinanceRepository } from "./apiFinanceRepository";
import { clearApiSession, setApiSession } from "./apiClient";

const userId = "c58f5f21-920f-43a1-8f1b-9e28937cf001";
const otherUserId = "c58f5f21-920f-43a1-8f1b-9e28937cf002";
const transactionId = "cd8c010b-673a-4d4f-913f-8851c69aa001";
const input: ExpenseInput = { amount: 1500, categoryId: "food", paymentMethod: "card", note: "Lunch", occurredAt: "2026-09-30" };
const profile = { id: userId, displayName: "Ayan", currency: "KZT", monthlyBudget: 120000, onboardingCompleted: true };
const transaction = { ...input, id: transactionId, createdAt: "2026-09-30T07:10:00+00:00", syncStatus: "synced" };
const snapshot = { version: 1, profile, categories: seedCategories, transactions: [transaction] };
function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
let repository: ApiFinanceRepository;
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset().mockResolvedValue(response(transaction));
  clearApiSession();
  setApiSession({ user: { id: userId, email: "ayan@example.com" }, access_token: "account-token", recovery: false });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  repository = new ApiFinanceRepository(userId);
});
afterEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));

test("loads only the authenticated server snapshot, with no demo data or browser persistence", async () => {
  localStorage.setItem("demo-only", "unchanged");
  const before = { ...localStorage };
  fetchMock.mockResolvedValueOnce(response(snapshot));
  const result = await repository.loadSnapshot();
  expect(result.profile.displayName).toBe("Ayan");
  expect(result.transactions).toEqual([{ ...transaction, createdAt: "2026-09-30T07:10:00.000Z" }]);
  expect(result.categories).toEqual(seedCategories);
  expect(fetchMock).toHaveBeenCalledWith("/api/snapshot", expect.objectContaining({ credentials: "include", headers: expect.objectContaining({ Authorization: "Bearer account-token" }) }));
  expect({ ...localStorage }).toEqual(before);
});
test("saves an expense only after acknowledgement and lets the server derive the owner", async () => {
  const saved = await repository.addExpense(input, false);
  expect(saved.syncStatus).toBe("synced");
  expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input);
});
test("refuses offline or simulated pending account writes without sending requests", async () => {
  await expect(repository.addExpense(input, true)).rejects.toThrow("has not been saved");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await expect(repository.updateExpense(transactionId, input, false)).rejects.toThrow("internet connection");
  await expect(repository.deleteExpense(transactionId)).rejects.toThrow("internet connection");
  expect(fetchMock).not.toHaveBeenCalled();
});
test("uses authenticated expense update/delete endpoints", async () => {
  await repository.updateExpense(transactionId, input, false);
  fetchMock.mockResolvedValueOnce(response(undefined, 204));
  await repository.deleteExpense(transactionId);
  expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [`/api/transactions/${transactionId}`, "PATCH"], [`/api/transactions/${transactionId}`, "DELETE"],
  ]);
});
test("rejects invalid money and unknown categories before sending requests", async () => {
  await expect(repository.addExpense({ ...input, amount: 1.234 }, false)).rejects.toThrow();
  await expect(repository.addExpense({ ...input, categoryId: "unknown" }, false)).rejects.toThrow("available categories");
  await expect(repository.updateMonthlyBudget(-1)).rejects.toThrow();
  await expect(repository.updateCategoryLimit("food", -1)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
test("rejects a snapshot belonging to another account", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...snapshot, profile: { ...profile, id: otherUserId } }));
  await expect(repository.loadSnapshot()).rejects.toThrow("does not belong");
});
test("rejects stale repositories after the signed-in identity changes", async () => {
  setApiSession({ user: { id: otherUserId, email: "other@example.com" }, access_token: "other-token", recovery: false });
  await expect(repository.addExpense(input, false)).rejects.toThrow("session changed");
  expect(fetchMock).not.toHaveBeenCalled();
});
test("surfaces server and network rejection without claiming a write succeeded", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: { code: "forbidden", message: "This data is unavailable." } }, 403));
  await expect(repository.addExpense(input, false)).rejects.toThrow("unavailable");
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(repository.addExpense(input, false)).rejects.toThrow("refresh before trying again");
});
test("refreshes all transactions from the server without inventing a pending queue", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...snapshot, transactions: Array.from({ length: 501 }, (_, i) => ({ ...transaction, id: `cd8c010b-673a-4d4f-913f-${String(i).padStart(12, "0")}` })) }));
  const result = await repository.syncPending();
  expect(result).toHaveLength(501);
  expect(result.every(item => item.syncStatus === "synced")).toBe(true);
});
test("rejects missing expense deletion instead of reporting success", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: { code: "not_found", message: "This expense no longer exists." } }, 404));
  await expect(repository.deleteExpense(transactionId)).rejects.toThrow("no longer exists");
});
test.each([
  { ...transaction, amount: -1 }, { ...transaction, syncStatus: "pending" }, { ...transaction, categoryId: "unknown" },
])("rejects malformed transaction responses", async value => {
  fetchMock.mockResolvedValueOnce(response(value));
  await expect(repository.addExpense(input, false)).rejects.toThrow("unsupported data format");
});
const onboarding: OnboardingInput = { displayName: "  Sam  ", monthlyBudget: 150000, categoryLimits: { food: 50000, transport: 25000, study: 15000, leisure: 20000, other: 10000 } };
test("completes onboarding through one owner-free request and accepts confirmed settings", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...snapshot, profile: { ...profile, displayName: "Sam", monthlyBudget: 150000 }, categories: seedCategories.map(item => ({ ...item, monthlyLimit: onboarding.categoryLimits[item.id] })), transactions: [] }));
  const result = await repository.completeOnboarding(onboarding);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/onboarding");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ ...onboarding, displayName: "Sam" });
  expect(result.profile).toMatchObject({ displayName: "Sam", monthlyBudget: 150000, onboardingCompleted: true });
  expect(result.categories[0].monthlyLimit).toBe(50000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("does not submit invalid or offline onboarding", async () => {
  await expect(repository.completeOnboarding({ ...onboarding, monthlyBudget: 1 })).rejects.toThrow("fit within");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await expect(repository.completeOnboarding(onboarding)).rejects.toThrow("internet connection");
  expect(fetchMock).not.toHaveBeenCalled();
});
test("a rejected setup remains unconfirmed", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: { code: "invalid_input", message: "Invalid setup" } }, 400));
  await expect(repository.completeOnboarding(onboarding)).rejects.toThrow("Invalid setup");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("a lost onboarding response can be retried, accepting only confirmed server data", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(repository.completeOnboarding(onboarding)).rejects.toThrow("refresh before trying again");
  fetchMock.mockResolvedValueOnce(response(snapshot));
  await expect(repository.completeOnboarding(onboarding)).resolves.toMatchObject({ profile: { onboardingCompleted: true } });
});
test.each([undefined, null, "true", false])("does not mistake an unconfirmed server marker (%s) for completed setup", async marker => {
  fetchMock.mockResolvedValueOnce(response({ ...snapshot, profile: { ...profile, onboardingCompleted: marker } }));
  await expect(repository.completeOnboarding(onboarding)).rejects.toThrow(marker === false ? "has not been confirmed" : "unsupported data format");
});
test("preserves a new account's false completion marker", async () => {
  fetchMock.mockResolvedValueOnce(response({ ...snapshot, profile: { ...profile, onboardingCompleted: false } }));
  expect((await repository.loadSnapshot()).profile.onboardingCompleted).toBe(false);
});
