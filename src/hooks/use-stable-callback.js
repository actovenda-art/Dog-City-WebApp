import { useCallback, useRef } from "react";

export function useStableCallback(callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args) => callbackRef.current(...args), []);
}
