/**
 * GOBERNA — useAsync Hook
 * Generic hook for async operations with loading/error states.
 */

import { useState, useCallback } from "react";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type UseAsyncReturn<T, Args extends unknown[]> = AsyncState<T> & {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
};

export function useAsync<T, Args extends unknown[] = []>(
  asyncFn: (...args: Args) => Promise<T>,
): UseAsyncReturn<T, Args> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await asyncFn(...args);
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setState((s) => ({ ...s, loading: false, error: message }));
        return null;
      }
    },
    [asyncFn],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const setData = useCallback((data: T | null) => {
    setState((s) => ({ ...s, data }));
  }, []);

  return { ...state, execute, reset, setData };
}
