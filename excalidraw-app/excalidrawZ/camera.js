import { sendMessage } from "./message";

/**
 * Get the excalidraw imperative API reference.
 * Must be set via App.tsx after excalidrawAPI is ready.
 */
const getAPI = () => {
  const api = window.excalidrawZHelper?._api;
  if (!api) {
    console.warn("[camera] excalidrawAPI not ready yet");
  }
  return api;
};

const getViewportAnimation = (animate, duration) =>
  animate ? { duration } : false;

const getViewportOffsets = (canvasOffsets) => ({
  ui: true,
  ...(canvasOffsets || {}),
});

const getSceneViewportTarget = (api) => api.getSceneElements();

/**
 * Get current camera state.
 * @returns {{ scrollX: number, scrollY: number, zoom: number } | null}
 */
export const getCamera = () => {
  const api = getAPI();
  if (!api) {
    return null;
  }
  const appState = api.getAppState();
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
  };
};

/**
 * Set camera position and/or zoom directly (no animation).
 * @param {{ scrollX?: number, scrollY?: number, zoom?: number }} camera
 */
export const setCamera = ({ scrollX, scrollY, zoom }) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const update = {};
  if (scrollX !== undefined) {
    update.scrollX = scrollX;
  }
  if (scrollY !== undefined) {
    update.scrollY = scrollY;
  }
  if (zoom !== undefined) {
    update.zoom = { value: zoom };
  }
  api.updateScene({
    appState: {
      ...update,
    },
  });
};

/**
 * Fit all content into view.
 */
export const scrollToCenter = () => {
  const api = getAPI();
  if (!api) {
    return;
  }
  api.setViewport({
    target: getSceneViewportTarget(api),
    fit: "scale-down",
    animation: { duration: 300 },
    offsets: getViewportOffsets(),
  });
};

/**
 * Scroll to a specific element by ID.
 *
 * Three modes:
 *  - 'center'      — just center the element, keep current zoom unchanged
 *  - 'fitContent'  — zoom to fit element, capped at 100% (default)
 *  - 'fitViewport' — fit the element to the viewport
 *
 * @param {string} elementId
 * @param {{
 *   mode?: 'center' | 'fitContent' | 'fitViewport',
 *   animate?: boolean,
 *   duration?: number,
 *   canvasOffsets?: { top?: number, right?: number, bottom?: number, left?: number }
 * }} opts
 */
export const scrollToElement = (elementId, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const {
    mode = "fitContent",
    animate = true,
    duration = 300,
    canvasOffsets,
  } = opts;

  let target = elementId;
  if (mode === "center") {
    const elements = api
      .getSceneElements()
      .filter((el) => el.id === elementId || el.groupIds?.includes(elementId));
    if (elements.length === 0) {
      console.warn("[camera] scrollToElement: not found", elementId);
      return;
    }
    target = elements;
  }

  const baseOpts = {
    target,
    animation: getViewportAnimation(animate, duration),
    offsets: getViewportOffsets(canvasOffsets),
  };

  if (mode === "center") {
    api.setViewport({
      ...baseOpts,
      fit: "none",
    });
  } else if (mode === "fitViewport") {
    api.setViewport({
      ...baseOpts,
      fit: "contain",
    });
  } else {
    api.setViewport({
      ...baseOpts,
      fit: "scale-down",
    });
  }
};

/**
 * Zoom to fit all elements in the viewport.
 * @param {{ animate?: boolean, duration?: number, canvasOffsets?: { top?: number, right?: number, bottom?: number, left?: number } }} opts
 */
export const zoomToFit = (opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const { animate = true, duration = 300, canvasOffsets } = opts;
  api.setViewport({
    target: getSceneViewportTarget(api),
    fit: "contain",
    animation: getViewportAnimation(animate, duration),
    offsets: getViewportOffsets(canvasOffsets),
  });
};

/**
 * Focus specific elements by their IDs.
 *
 * Modes:
 *  - 'center'      — just center the elements, keep current zoom unchanged
 *  - 'fitContent'  — zoom to fit elements, capped by Excalidraw defaults
 *  - 'fitViewport' — fit the elements to the viewport
 *
 * @param {string[]} elementIds
 * @param {{
 *   mode?: 'center' | 'fitContent' | 'fitViewport',
 *   animate?: boolean,
 *   duration?: number,
 *   canvasOffsets?: { top?: number, right?: number, bottom?: number, left?: number }
 * }} opts
 */
export const focusElements = (elementIds, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }

  const {
    mode = "fitViewport",
    animate = true,
    duration = 300,
    canvasOffsets,
  } = opts;
  const allElements = api.getSceneElements();
  const targets = allElements.filter((el) => elementIds.includes(el.id));
  if (targets.length === 0) {
    console.warn("[camera] no elements found for IDs:", elementIds);
    return;
  }

  if (mode === "center") {
    api.setViewport({
      target: targets,
      fit: "none",
      animation: getViewportAnimation(animate, duration),
      offsets: getViewportOffsets(canvasOffsets),
    });
  } else if (mode === "fitContent") {
    api.setViewport({
      target: targets,
      fit: "scale-down",
      animation: getViewportAnimation(animate, duration),
      offsets: getViewportOffsets(canvasOffsets),
    });
  } else {
    api.setViewport({
      target: targets,
      fit: "contain",
      animation: getViewportAnimation(animate, duration),
      offsets: getViewportOffsets(canvasOffsets),
    });
  }
};

/**
 * Zoom to fit specific elements by their IDs.
 * @param {string[]} elementIds
 * @param {{ animate?: boolean, duration?: number, canvasOffsets?: { top?: number, right?: number, bottom?: number, left?: number } }} opts
 */
export const zoomToFitElements = (elementIds, opts = {}) => {
  return focusElements(elementIds, { ...opts, mode: "fitViewport" });
};

/**
 * Set zoom level, keeping the viewport center fixed.
 * @param {number} zoomValue
 */
export const zoomTo = (zoomValue) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const appState = api.getAppState();
  const centerX = appState.width / 2;
  const centerY = appState.height / 2;

  // Keep the same scene point at viewport center across zoom change.
  // Mapping: screenX = (sceneX + scrollX) * zoom  (ignoring offset)
  // So: sceneCenter = centerX / zoom - scrollX
  const currentZoom = appState.zoom.value;
  const sceneCenterX = centerX / currentZoom - appState.scrollX;
  const sceneCenterY = centerY / currentZoom - appState.scrollY;
  const newScrollX = centerX / zoomValue - sceneCenterX;
  const newScrollY = centerY / zoomValue - sceneCenterY;

  api.updateScene({
    appState: {
      scrollX: newScrollX,
      scrollY: newScrollY,
      zoom: { value: zoomValue },
    },
  });
};

/**
 * Subscribe to camera changes. Returns an unsubscribe function.
 * @param {(camera: { scrollX: number, scrollY: number, zoom: number }) => void} callback
 * @returns {(() => void) | null}
 */
export const onCameraChange = (callback) => {
  const api = getAPI();
  if (!api) {
    return null;
  }
  return api.onScrollChange((scrollX, scrollY, zoom) => {
    callback({ scrollX, scrollY, zoom: zoom.value });
  });
};

/**
 * Start broadcasting camera changes to the native client via sendMessage.
 * Should be called once after excalidrawAPI is ready.
 * Deduplicates consecutive equal values to avoid spam from unrelated re-renders.
 */
export const startCameraTracking = () => {
  const api = getAPI();
  if (!api) {
    return;
  }
  let lastX = null;
  let lastY = null;
  let lastZoom = null;
  api.onScrollChange((scrollX, scrollY, zoom) => {
    const z = zoom.value;
    if (scrollX === lastX && scrollY === lastY && z === lastZoom) {
      return;
    }
    lastX = scrollX;
    lastY = scrollY;
    lastZoom = z;
    sendMessage({
      event: "onCameraChanged",
      data: { scrollX, scrollY, zoom: z },
    });
  });
};
