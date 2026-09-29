export function readStoredValue<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(key);

  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function writeStoredValue<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeStoredValue(key: string): void {
  localStorage.removeItem(key);
}
