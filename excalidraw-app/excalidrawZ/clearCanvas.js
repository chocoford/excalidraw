const getAPI = () => window.excalidrawZHelper?._api;

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
 * Clear the live scene without resetting canvas preferences or viewport state.
 *
 * @param {{ clearHistory?: boolean }} options
 * @returns {Promise<{
 *   cleared: true,
 *   historyCleared: boolean,
 * }>}
 */
export const clearCanvas = async (options = {}) => {
  if (!isObject(options)) {
    throw new TypeError("clearCanvas options must be an object");
  }

  const api = getAPI();
  if (!api) {
    throw new Error("Excalidraw API is not ready");
  }

  const shouldClearHistory = options.clearHistory === true;

  api.updateScene({
    elements: [],
    appState: {
      selectedElementIds: {},
      previousSelectedElementIds: {},
      selectedGroupIds: {},
      selectedLinearElement: null,
      editingGroupId: null,
      editingTextElement: null,
      selectionElement: null,
      selectedElementsAreBeingDragged: false,
      activeEmbeddable: null,
    },
    captureUpdate: shouldClearHistory ? "NEVER" : "IMMEDIATELY",
  });

  if (shouldClearHistory) {
    api.history.clear();
  }

  await waitForNextPaint();

  return {
    cleared: true,
    historyCleared: shouldClearHistory,
  };
};
