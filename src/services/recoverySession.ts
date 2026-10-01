const KEY = "tengeflow.verified-recovery";
let memoryProof: { userId: string; expiresAt: number } | null = null;
export function rememberRecoverySession(userId: string) {
  memoryProof = { userId, expiresAt: Date.now() + 15 * 60 * 1000 };
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify(memoryProof),
    );
  } catch {
    /* Recovery still works until this page is refreshed. */
  }
}
export function clearRecoverySession() {
  memoryProof = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* No persistent marker to clear. */
  }
}
export function hasRecoverySession(userId: string): boolean {
  if (memoryProof?.userId === userId && memoryProof.expiresAt > Date.now()) return true;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    return (
      typeof value === "object" &&
      value !== null &&
      "userId" in value &&
      "expiresAt" in value &&
      value.userId === userId &&
      typeof value.expiresAt === "number" &&
      value.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}
