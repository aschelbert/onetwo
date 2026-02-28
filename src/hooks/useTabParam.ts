import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Persist tab/view state in URL search params so it survives page refresh.
 * Default values are omitted from the URL to keep it clean.
 * Uses `replace: true` to avoid polluting browser history with tab switches.
 */
export function useTabParam<T extends string>(
  key: string,
  defaultValue: T,
  validValues?: T[],
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(key);
  let value: T;
  if (raw !== null) {
    if (validValues && !validValues.includes(raw as T)) {
      value = defaultValue;
    } else {
      value = raw as T;
    }
  } else {
    value = defaultValue;
  }

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (next === defaultValue) {
            updated.delete(key);
          } else {
            updated.set(key, next);
          }
          return updated;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}
