import { TOOL_TYPE } from "@excalidraw/common";

import {
  isCanvasTransparent,
  setCanvasTransparent,
} from "./canvasPreferences";

const getAPI = () => window.excalidrawZHelper?._api;

const SUPPORTED_TOOLS = new Set(Object.values(TOOL_TYPE));

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const waitForNextPaint = () =>
  new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

/**
 * Prepare the live canvas for a host-controlled workflow.
 *
 * Initialization updates never enter Excalidraw's undo history. When
 * `clearHistory` is requested, history is cleared after all updates so the
 * prepared canvas becomes the new undo baseline.
 *
 * @param {{
 *   reset?: boolean,
 *   clearHistory?: boolean,
 *   transparent?: boolean,
 *   activeTool?: string,
 *   appState?: Record<string, unknown>,
 * }} options
 * @returns {Promise<{
 *   reset: boolean,
 *   historyCleared: boolean,
 *   transparent: boolean,
 *   activeTool: string | null,
 *   appliedAppStateKeys: string[],
 * }>}
 */
export const prepareCanvas = async (options = {}) => {
  if (!isObject(options)) {
    throw new TypeError("prepareCanvas options must be an object");
  }

  const api = getAPI();
  if (!api) {
    throw new Error("Excalidraw API is not ready");
  }

  const shouldReset = options.reset === true;
  const shouldClearHistory = options.clearHistory === true;
  const hasTransparentOption = "transparent" in options;
  const transparentBeforePrepare = isCanvasTransparent();

  if (
    options.appState !== undefined &&
    !isObject(options.appState)
  ) {
    throw new TypeError("prepareCanvas appState must be an object");
  }

  if (
    options.activeTool !== undefined &&
    !SUPPORTED_TOOLS.has(options.activeTool)
  ) {
    throw new TypeError(
      `Unsupported Excalidraw active tool: ${String(options.activeTool)}`,
    );
  }

  // Disable transparency before resetting/applying appState so a requested
  // viewBackgroundColor remains authoritative.
  if (hasTransparentOption && options.transparent === false) {
    setCanvasTransparent(false);
  }

  if (shouldReset) {
    api.resetScene({ resetLoadingState: true });
    await waitForNextPaint();
  }

  const appStateUpdate = options.appState
    ? { ...options.appState }
    : {};
  delete appStateUpdate.activeTool;

  const appliedAppStateKeys = Object.keys(appStateUpdate);
  if (appliedAppStateKeys.length > 0) {
    api.updateScene({
      appState: appStateUpdate,
      captureUpdate: "NEVER",
    });
  }

  const shouldEnableTransparency =
    options.transparent === true ||
    (!hasTransparentOption && transparentBeforePrepare);
  if (shouldEnableTransparency) {
    setCanvasTransparent(true, { force: true });
  }

  if (options.activeTool !== undefined) {
    api.setActiveTool({ type: options.activeTool });
  }

  if (
    shouldReset ||
    appliedAppStateKeys.length > 0 ||
    hasTransparentOption ||
    options.activeTool !== undefined
  ) {
    await waitForNextPaint();
  }

  if (shouldClearHistory) {
    api.history.clear();
  }

  const finalAppState = api.getAppState();
  const activeTool = finalAppState?.activeTool?.type ?? null;

  return {
    reset: shouldReset,
    historyCleared: shouldReset || shouldClearHistory,
    transparent: finalAppState?.viewBackgroundColor === "transparent",
    activeTool,
    appliedAppStateKeys,
  };
};
