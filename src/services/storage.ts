export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export const FINANCE_STORAGE_KEY = "tengeflow.finance.v1";
export const DRAFT_STORAGE_KEY = "tengeflow.expense-draft.v1";

export function resolveStorage(storage?: StorageAdapter): StorageAdapter {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch {
    throw new RepositoryError(
      "Device storage is unavailable. Allow local storage in your browser and try again.",
    );
  }
}

export function readStoredValue(
  key: string,
  storage?: StorageAdapter,
): unknown {
  let raw: string | null;
  try {
    raw = resolveStorage(storage).getItem(key);
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(
      "Could not read device storage. Check your browser’s storage settings and try again.",
    );
  }
  // undefined means absent; a stored JSON null still goes through schema validation.
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RepositoryError(
      "Saved data could not be read. Your existing data has been kept; restore a valid backup or clear this site’s storage to restart the demo.",
    );
  }
}

export function writeStoredValue(
  key: string,
  value: unknown,
  storage?: StorageAdapter,
): void {
  try {
    resolveStorage(storage).setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(
      "Could not save on this device. Free some browser storage or allow local storage, then try again.",
    );
  }
}

export function removeStoredValue(key: string, storage?: StorageAdapter): void {
  try {
    resolveStorage(storage).removeItem(key);
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError(
      "Could not clear the saved draft. Check your browser’s storage settings and try again.",
    );
  }
}
