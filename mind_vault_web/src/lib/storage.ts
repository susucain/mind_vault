/** Reads JSON only; the generic type is compile-time guidance, not runtime validation. */
export function readStoredValue<T>(key: string): T | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const value = localStorage.getItem(key);

    if (value === null) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Stores JSON when browser storage is available; quota and access errors are ignored. */
export function writeStoredValue<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage can be unavailable or over quota.
  }
}

/** Removes a stored value when possible; storage access errors are ignored. */
export function removeStoredValue(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable.
  }
}
