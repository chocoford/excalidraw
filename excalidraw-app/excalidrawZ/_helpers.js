/**
 * Shared utilities for the excalidrawZ bridge modules.
 */

/**
 * Get the excalidraw imperative API reference. Set on the helper by App.tsx
 * after `excalidrawAPI` is ready.
 *
 * @returns {object | null}
 */
export const getAPI = () => window.excalidrawZHelper?._api ?? null;

/**
 * Get the live appState directly from Excalidraw's React state, with null
 * safety. Avoids the latency of reading from localStorage.
 *
 * @returns {object | null}
 */
export const getAppState = () => {
  const api = getAPI();
  return api?.getAppState?.() ?? null;
};

/**
 * Standard leading + trailing throttle. The first call fires immediately;
 * subsequent calls within `ms` are coalesced into a single trailing call
 * scheduled at the end of the throttle window.
 *
 * @param {(...args: any[]) => void} fn
 * @param {number} ms
 */
export const throttle = (fn, ms) => {
  let last = 0;
  let timer = null;
  let pendingArgs = null;

  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      pendingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          const a = pendingArgs;
          pendingArgs = null;
          if (a) fn(...a);
        }, remaining);
      }
    }
  };
};
