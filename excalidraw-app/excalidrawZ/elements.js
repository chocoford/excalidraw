import { restoreElements } from "@excalidraw/excalidraw/data/restore";

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
 * Run host-supplied elements through Excalidraw's `restoreElements` with
 * `repairBindings: true` so dangling containerId / boundElements / arrow
 * bindings get cleaned up before they hit the scene.
 *
 * Default-on for every host mutation entry — host treats Excalidraw as a
 * black box and shouldn't have to know about its binding rules. Performance-
 * sensitive callers can opt out with `{ sanitize: false }`.
 */
const sanitizeForScene = (elements, existing) =>
  restoreElements(elements, existing, { repairBindings: true });

/**
 * For `removeElements`: clear bindings on remaining elements that point to
 * any of the just-removed IDs. We do this manually because removed elements
 * are kept in the array with `isDeleted: true` (to preserve undo history),
 * and `restoreElements`'s repair logic only clears refs to elements that
 * are *missing from the map* — not refs to deleted-but-still-present ones.
 *
 * Sweeps:
 *   - text.containerId → null if container is being removed
 *   - element.boundElements → drop entries pointing to removed IDs
 *   - arrow.startBinding / endBinding → null if target is being removed
 */
const sweepDependentBindings = (elements, removedIds) => {
  return elements.map((el) => {
    if (removedIds.has(el.id)) {
      return el;
    }

    let next = el;

    if (
      el.type === "text" &&
      el.containerId &&
      removedIds.has(el.containerId)
    ) {
      next = { ...next, containerId: null };
    }

    if (el.boundElements && el.boundElements.length) {
      const filtered = el.boundElements.filter((b) => !removedIds.has(b.id));
      if (filtered.length !== el.boundElements.length) {
        next = { ...next, boundElements: filtered };
      }
    }

    if (el.startBinding && removedIds.has(el.startBinding.elementId)) {
      next = { ...next, startBinding: null };
    }
    if (el.endBinding && removedIds.has(el.endBinding.elementId)) {
      next = { ...next, endBinding: null };
    }

    return next;
  });
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
 * If `sanitize` is true (default), runs the post-mutation scene through
 * `restoreElements({ repairBindings: true })` to clean up any bindings
 * the patch might have orphaned.
 *
 * @param {string} id
 * @param {Partial<ExcalidrawElement>} updates
 * @param {{
 *   sanitize?: boolean,
 *   captureUpdate?: keyof typeof CaptureUpdate,
 * }} [opts]
 * @returns {boolean} true if the element was found and updated
 */
export const updateElement = (id, updates, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return false;
  }
  const { sanitize = true, captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  const element = api
    .getSceneElementsIncludingDeleted()
    .find((el) => el.id === id);
  if (!element) {
    console.warn("[elements] updateElement: not found", id);
    return false;
  }
  api.mutateElement(element, updates);
  if (sanitize) {
    const fresh = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: sanitizeForScene(fresh, fresh),
      captureUpdate,
    });
  }
  return true;
};

/**
 * Update multiple elements in one batch.
 *
 * @param {Array<{ id: string, updates: Partial<ExcalidrawElement> }>} patches
 * @param {{
 *   sanitize?: boolean,
 *   captureUpdate?: keyof typeof CaptureUpdate,
 * }} [opts]
 * @returns {number} number of elements actually updated
 */
export const updateElements = (patches, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return 0;
  }
  const { sanitize = true, captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
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
  if (count > 0 && sanitize) {
    const fresh = api.getSceneElementsIncludingDeleted();
    api.updateScene({
      elements: sanitizeForScene(fresh, fresh),
      captureUpdate,
    });
  }
  return count;
};

/**
 * Append new elements to the scene (preserves existing).
 *
 * @param {ExcalidrawElement[]} newElements
 * @param {{
 *   sanitize?: boolean,
 *   captureUpdate?: keyof typeof CaptureUpdate,
 * }} [opts]
 */
export const addElements = (newElements, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const { sanitize = true, captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  const current = api.getSceneElementsIncludingDeleted();
  let next = [...current, ...newElements];
  if (sanitize) {
    next = sanitizeForScene(next, current);
  }
  api.updateScene({ elements: next, captureUpdate });
};

/**
 * Remove elements by IDs (marks them as deleted in the scene).
 *
 * Always sweeps dependent bindings on the remaining elements — removing a
 * container without clearing the bound text's `containerId` would otherwise
 * leave the scene in an inconsistent state (orphan bindings, broken
 * select-all, etc.). Not opt-out-able by design.
 *
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
  let next = current.map((el) => {
    if (idSet.has(el.id) && !el.isDeleted) {
      count++;
      return { ...el, isDeleted: true };
    }
    return el;
  });
  if (count > 0) {
    next = sweepDependentBindings(next, idSet);
    api.updateScene({ elements: next, captureUpdate });
  }
  return count;
};

/**
 * Replace all elements in the scene.
 *
 * @param {ExcalidrawElement[]} elements
 * @param {{
 *   sanitize?: boolean,
 *   captureUpdate?: keyof typeof CaptureUpdate,
 * }} [opts]
 */
export const replaceAllElements = (elements, opts = {}) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  const { sanitize = true, captureUpdate = CaptureUpdate.IMMEDIATELY } = opts;
  const current = api.getSceneElementsIncludingDeleted();
  const next = sanitize ? sanitizeForScene(elements, current) : elements;
  api.updateScene({ elements: next, captureUpdate });
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
