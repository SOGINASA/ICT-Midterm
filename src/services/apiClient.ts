import { z } from "zod";

export const authSessionSchema = z.object({
  access_token: z.string().min(1),
  user: z.object({ id: z.string().uuid(), email: z.string().email() }),
  recovery: z.boolean(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

const configuredUrl = process.env.PENIS_APP_API_URL?.trim() || "/api";
function validApiUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !/[?#\\]/.test(value)) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export const isApiConfigured = validApiUrl(configuredUrl);
const apiUrl = configuredUrl.replace(/\/$/, "");
export const developmentInboxUrl = process.env.NODE_ENV === "development" &&
  isApiConfigured && (configuredUrl.startsWith("/") || ["localhost", "127.0.0.1"].includes(new URL(configuredUrl).hostname))
    ? "http://127.0.0.1:8000/api/dev/inbox" : null;
export const backendUnavailableMessage =
  "Account services are not connected yet. You can explore TengeFlow in demo mode.";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = "request_failed") {
    super(message);
    this.name = "ApiError";
  }
}
export class SessionChangedError extends Error {
  constructor() {
    super("Your session changed. Sign in again before saving this change.");
    this.name = "SessionChangedError";
  }
}

// Access tokens stay in this module's memory. Only the server owns the HttpOnly refresh cookie.
let session: AuthSession | null = null;
let revision = 0;
let refreshing: { revision: number; promise: Promise<AuthSession | null> } | null = null;
const SIGNED_OUT_KEY = "tengeflow.signed-out";
let signedOutInMemory = false;
export function isExplicitlySignedOut() {
  try { return signedOutInMemory || localStorage.getItem(SIGNED_OUT_KEY) === "true"; }
  catch { return signedOutInMemory; }
}
export function markSignedOut() {
  signedOutInMemory = true;
  try { localStorage.setItem(SIGNED_OUT_KEY, "true"); } catch { /* Memory still blocks restoration in this tab. */ }
}
function clearSignedOutMarker() {
  signedOutInMemory = false;
  try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* No marker can be stored in this browser. */ }
}
const listeners = new Set<(value: AuthSession | null) => void>();
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("tengeflow.auth") : null;
function notify() { listeners.forEach(listener => listener(session)); }
export function getApiSession() { return session; }
export function getAuthRevision() { return revision; }
export function subscribeToSession(listener: (value: AuthSession | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setApiSession(value: AuthSession) {
  session = authSessionSchema.parse(value);
  clearSignedOutMarker();
  revision += 1;
  notify();
}
export function clearApiSession(broadcast = false) {
  revision += 1;
  session = null;
  notify();
  if (broadcast) channel?.postMessage({ type: "signed-out" });
}
if (channel) channel.onmessage = event => {
  if (event.data?.type === "signed-out") { markSignedOut(); clearApiSession(); }
};
// Beginning another explicit sign-in invalidates in-flight work for the previous identity.
export function beginAuthOperation() { revision += 1; return revision; }
export function assertAuthRevision(expected: number) {
  if (revision !== expected) throw new SessionChangedError();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
}
async function fetchJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  if (!isApiConfigured) throw new Error(backendUnavailableMessage);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let data: unknown;
  if (response.status !== 204) {
    try { data = await response.json(); }
    catch {
      if (response.ok) throw new ApiError("The account service returned an unsupported response. Please try again.", response.status);
    }
  }
  if (!response.ok) {
    const envelope = data as { error?: { code?: string; message?: string } | string; code?: string; message?: string } | undefined;
    const detail = typeof envelope?.error === "object" ? envelope.error : envelope;
    throw new ApiError(
      detail?.message || (typeof envelope?.error === "string" ? envelope.error : "Your account could not confirm this request. Please try again."),
      response.status,
      detail?.code,
    );
  }
  return data;
}
export function publicApiRequest(path: string, options: RequestOptions = {}) {
  return fetchJson(path, options);
}

let cookieMutation: Promise<unknown> | null = null;
export function withAuthCookieLock<T>(work: () => Promise<T>): Promise<T> {
  // Serialize cookie rotation across tabs without sharing access tokens.
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("tengeflow.auth.refresh", work);
  // Older browsers still serialize cookie writes within this tab.
  const result = cookieMutation ? cookieMutation.catch(() => undefined).then(work) : work();
  cookieMutation = result;
  void result.then(() => { if (cookieMutation === result) cookieMutation = null; }, () => { if (cookieMutation === result) cookieMutation = null; });
  return result;
}

export function refreshSession(): Promise<AuthSession | null> {
  if (isExplicitlySignedOut()) {
    if (session) clearApiSession();
    return Promise.resolve(null);
  }
  const startedAt = revision;
  if (refreshing?.revision === startedAt) return refreshing.promise;
  const previousUser = session?.user.id;
  const promise = withAuthCookieLock(async () => {
    try {
      assertAuthRevision(startedAt);
      const value = authSessionSchema.parse(await fetchJson("/auth/refresh", { method: "POST", body: {} }));
      assertAuthRevision(startedAt);
      // A cookie can be replaced by another tab. Never replay a write for a different account.
      if (previousUser && value.user.id !== previousUser) {
        clearApiSession();
        throw new SessionChangedError();
      }
      session = value;
      notify();
      return value;
    } catch (error) {
      assertAuthRevision(startedAt);
      if (error instanceof ApiError && error.status === 401) {
        clearApiSession();
        return null;
      }
      throw error;
    }
  });
  refreshing = { revision: startedAt, promise };
  void promise.then(() => { if (refreshing?.promise === promise) refreshing = null; }, () => { if (refreshing?.promise === promise) refreshing = null; });
  return promise;
}

function requireIdentity(expectedUserId: string, startedAt: number, allowRecovery: boolean): AuthSession {
  if (isExplicitlySignedOut() && session) clearApiSession();
  assertAuthRevision(startedAt);
  if (!session || session.user.id !== expectedUserId || (session.recovery && !allowRecovery)) throw new SessionChangedError();
  return session;
}
export async function authenticatedApiRequest(
  path: string,
  options: Omit<RequestOptions, "token"> & { expectedUserId: string; allowRecovery?: boolean },
): Promise<unknown> {
  const startedAt = revision;
  const allowRecovery = options.allowRecovery === true;
  const original = requireIdentity(options.expectedUserId, startedAt, allowRecovery);
  try {
    const data = await fetchJson(path, { ...options, token: original.access_token });
    requireIdentity(options.expectedUserId, startedAt, allowRecovery);
    return data;
  } catch (error) {
    requireIdentity(options.expectedUserId, startedAt, allowRecovery);
    if (!(error instanceof ApiError) || error.status !== 401 || allowRecovery) throw error;
    if (session?.access_token === original.access_token) await refreshSession();
    const renewed = requireIdentity(options.expectedUserId, startedAt, allowRecovery);
    try {
      const data = await fetchJson(path, { ...options, token: renewed.access_token });
      requireIdentity(options.expectedUserId, startedAt, allowRecovery);
      return data;
    } catch (retryError) {
      requireIdentity(options.expectedUserId, startedAt, allowRecovery);
      if (retryError instanceof ApiError && retryError.status === 401) clearApiSession(true);
      throw retryError;
    }
  }
}

/** Keep a failed logout logged out locally, then retry cookie revocation when connectivity returns. */
export async function revokeSignedOutSession(token?: string): Promise<void> {
  await withAuthCookieLock(async () => {
    if (!isExplicitlySignedOut()) return;
    await publicApiRequest("/auth/logout", { method: "POST", body: {}, token });
  });
}
if (typeof window !== "undefined") window.addEventListener("online", () => {
  if (isExplicitlySignedOut()) void revokeSignedOutSession().catch(() => undefined);
});

if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === SIGNED_OUT_KEY && event.newValue === "true" && isExplicitlySignedOut()) {
    markSignedOut();
    clearApiSession();
  }
});
