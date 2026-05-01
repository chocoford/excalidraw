import { sendMessage } from "./message";

/**
 * Get the excalidraw imperative API reference.
 * Set via App.tsx after excalidrawAPI is ready.
 */
const getAPI = () => {
  const api = window.excalidrawZHelper?._api;
  if (!api) {
    console.warn("[elements] excalidrawAPI not ready yet");
  }
  return api;
};

/**
 * CaptureUpdateAction values for controlling undo/redo behavior.
 * - IMMEDIATELY: change is captured immediately to undo stack
 * - EVENTUALLY: change is grouped with the next IMMEDIATELY action
 * - NEVER: change is never captured (use for remote/sync updates)
 */
export const CaptureUpdate = {
  IMMEDIATELY: "IMMEDIATELY",
  EVENTUALLY: "EVENTUALLY",
  NEVER: "NEVER",
};

/**
 * Get all non-deleted scene elements.
 * @returns {readonly ExcalidrawElement[]}
 */
export const getElements = () => {
  const api = getAPI();
  if (!api) {
    return [];
  }
  return api.getSceneElements();
};

/**
 * Get all elements including deleted ones.
 * @returns {readonly ExcalidrawElement[]}
 */
export const getElementsIncludingDeleted = () => {
  const api = getAPI();
  if (!api) {
    return [];
  }
  return api.getSceneElementsIncludingDeleted();
};

/**
 * Get a single element by ID.
 * @param {string} id
 * @returns {ExcalidrawElement | null}
 */
export const getElementById = (id) => {
  const api = getAPI();
  if (!api) {
    return null;
  }
  return api.getSceneElements().find((el) => el.id === id) || null;
};

/**
 * Get multiple elements by IDs.
 * @param {string[]} ids
 * @returns {ExcalidrawElement[]}
 */
export const getElementsByIds = (ids) => {
  const api = getAPI();
  if (!api) {
    return [];
  }
  const idSet = new Set(ids);
  return api.getSceneElements().filter((el) => idSet.has(el.id));
};

/**
 * Update a single element by ID with partial property updates.
 * Uses mutateElement under the hood — only listed fields are changed,
 * version/versionNonce/updated are bumped automatically.
 *
 * @param {string} id
 * @param {Partial<ExcalidrawElement>} updates
 * @returns {boolean} true if the element was found and updated
 */
export const updateElement = (id, updates) => {
  const api = getAPI();
  if (!api) {
    return false;
  }
  const element = api
    .getSceneElementsIncludingDeleted()
    .find((el) => el.id === id);
  if (!element) {
    console.warn("[elements] updateElement: not found", id);
    return false;
  }
  api.mutateElement(element, updates);
  return true;
};

/**
 * Update multiple elements in one batch.
 * @param {Array<{ id: string, updates: Partial<ExcalidrawElement> }>} patches
 * @returns {number} number of elements actually updated
 */
export const updateElements = (patches) => {
  const api = getAPI();
  if (!api) {
    return 0;
  }
  const all = api.getSceneElementsIncludingDeleted();
  const map = new Map(all.map((el) => [el.id, el]));
  let count = 0;
  for (const { id, updates } of patches) {
    const element = map.get(id);
    if (element) {
      api.mutateElement(element, updates);
      count++;
    }
  }
  return count;
};

/**
 * Append new elements to the scene (preserves existing).
 * @param {ExcalidrawElement[]} newElements
 * @param {{ captureUpdate?: keyof typeof CaptureUpdate }} opts
 */
export const addElements = (newElements, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const { captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  const current = api.getSceneElementsIncludingDeleted();
  api.updateScene({
    elements: [...current, ...newElements],
    captureUpdate,
  });
};

/**
 * Remove elements by IDs (marks them as deleted in the scene).
 * @param {string[]} ids
 * @param {{ captureUpdate?: keyof typeof CaptureUpdate }} opts
 * @returns {number} number of elements removed
 */
export const removeElements = (ids, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return 0;
  }
  const { captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  const idSet = new Set(ids);
  const current = api.getSceneElementsIncludingDeleted();
  let count = 0;
  const next = current.map((el) => {
    if (idSet.has(el.id) && !el.isDeleted) {
      count++;
      return { ...el, isDeleted: true };
    }
    return el;
  });
  if (count > 0) {
    api.updateScene({
      elements: next,
      captureUpdate,
    });
  }
  return count;
};

/**
 * Replace all elements in the scene.
 * @param {ExcalidrawElement[]} elements
 * @param {{ captureUpdate?: keyof typeof CaptureUpdate }} opts
 */
export const replaceAllElements = (elements, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const { captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  api.updateScene({
    elements,
    captureUpdate,
  });
};

/**
 * Get currently selected element IDs.
 * @returns {string[]}
 */
export const getSelectedElementIds = () => {
  const api = getAPI();
  if (!api) {
    return [];
  }
  const appState = api.getAppState();
  return Object.keys(appState.selectedElementIds || {}).filter(
    (id) => appState.selectedElementIds[id],
  );
};

/**
 * Set selected elements by IDs.
 * @param {string[]} ids
 */
export const setSelectedElementIds = (ids) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const selectedElementIds = {};
  for (const id of ids) {
    selectedElementIds[id] = true;
  }
  api.updateScene({
    appState: {
      selectedElementIds,
    },
  });
};

/**
 * Start broadcasting element changes to the native client.
 * Emits `onElementsChanged` whenever the scene elements change.
 * Should be called once after excalidrawAPI is ready.
 */
export const startElementsTracking = () => {
  const api = getAPI();
  if (!api || typeof api.onChange !== "function") {
    return;
  }
  let lastVersion = null;
  api.onChange((elements) => {
    // cheap version fingerprint to avoid spamming
    const version = elements.length
      ? `${elements.length}:${elements[elements.length - 1].version}:${
          elements[elements.length - 1].versionNonce
        }`
      : "0";
    if (version === lastVersion) {
      return;
    }
    lastVersion = version;
    sendMessage({
      event: "onElementsChanged",
      data: {
        count: elements.length,
      },
    });
  });
};
