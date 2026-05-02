import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

const getAPI = () => window.excalidrawZHelper?._api;

const DEFAULT_LOAD_TIMEOUT_MS = 5000;

/**
 * Wait until the scene's element set actually changes (or a meaningful update
 * happens), with timeout. Used to bridge "drop event dispatched" → "scene
 * actually loaded".
 *
 * Detection: snapshot element IDs before, then on each onChange check if the
 * element set differs from the snapshot. Skips onChange calls that don't
 * change the element set (e.g. cursor moves, tool switches).
 *
 * @param {object} api  excalidrawAPI
 * @param {number} timeoutMs
 * @returns {Promise<readonly any[]>}  resolves with the new elements array
 */
const waitForSceneChange = (api, timeoutMs = DEFAULT_LOAD_TIMEOUT_MS) => {
  return new Promise((resolve, reject) => {
    if (!api || typeof api.onChange !== "function") {
      reject(new Error("excalidrawAPI not ready"));
      return;
    }

    const beforeElements = api.getSceneElementsIncludingDeleted();
    const beforeIds = new Set(beforeElements.map((el) => el.id));
    const beforeCount = beforeIds.size;

    let unsubscribe = null;
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(
        new Error(
          "load timed out — file may be invalid, rejected, or empty",
        ),
      );
    }, timeoutMs);

    unsubscribe = api.onChange((elements) => {
      // Compare element ID set to detect actual scene change
      if (elements.length === beforeCount) {
        let unchanged = true;
        for (const el of elements) {
          if (!beforeIds.has(el.id)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) {
          return;
        }
      }
      clearTimeout(timer);
      unsubscribe?.();
      resolve(elements);
    });
  });
};

/**
 *
 * @param {number[]} buffer
 * @param {string} [fileId] - Optional file identifier to track if loading the same file
 * @returns {Promise<{ fileId: string|undefined, elementCount: number, durationMs: number }>}
 * @throws if JSON parsing fails or the load times out
 */
export const loadFileBuffer = async (buffer, fileId) => {
  const startedAt = Date.now();
  const uint8Array = new Uint8Array(buffer);
  const jsonString = new TextDecoder("utf-8").decode(uint8Array);

  let content;
  try {
    content = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`loadFileBuffer: invalid JSON — ${e.message}`);
  }
  console.info("loadFileBuffer", buffer, jsonString, content);

  // Check if loading the same file to preserve viewport
  const isSameFile = fileId && window.excalidrawZHelper.currentFileId === fileId;

  if (isSameFile) {
    const state = JSON.parse(localStorage.getItem("excalidraw-state") || "{}");
    const savedViewport = {
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      zoom: state.zoom,
    };
    console.info("[ExcalidrawZ] Preserving viewport for same file:", {
      fileId,
      savedViewport,
      originalAppState: content.appState,
    });
    content.appState = {
      ...content.appState,
      ...savedViewport,
    };
  } else {
    console.info("[ExcalidrawZ] Loading different file:", {
      newFileId: fileId,
      currentFileId: window.excalidrawZHelper.currentFileId,
    });
  }

  window.excalidrawZHelper.currentFileId = fileId;

  const files = await getRelativeFiles(content.elements);
  content.files = { ...content.files, ...files };
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });

  return _dispatchAndWait(file, { startedAt, fileId });
};

/**
 *
 * @param {string} dataString
 * @returns {Promise<{ elementCount: number, durationMs: number }>}
 * @throws if JSON parsing fails or the load times out
 */
export const loadFileString = async (dataString) => {
  const startedAt = Date.now();
  let content;
  try {
    content = JSON.parse(dataString);
  } catch (e) {
    throw new Error(`loadFileString: invalid JSON — ${e.message}`);
  }
  const files = await getRelativeFiles(content.elements);
  content.files = { ...content.files, ...files };
  console.info("loadFileString", content);
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });

  return _dispatchAndWait(file, { startedAt });
};

/**
 * Internal: dispatch a fake drop event, then await the scene change.
 * Resolves with stats; rejects on timeout or container missing.
 */
const _dispatchAndWait = async (file, meta = {}) => {
  const node = document.querySelector(".excalidraw-container");
  if (!node) {
    throw new Error("loadFile: .excalidraw-container not found");
  }

  const api = getAPI();
  // Prepare the wait BEFORE dispatching so we don't miss the change
  const waitPromise = api ? waitForSceneChange(api) : null;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const fakeDropEvent = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(fakeDropEvent, "dataTransfer", {
    value: dataTransfer,
  });
  node.dispatchEvent(fakeDropEvent);

  if (waitPromise) {
    const elements = await waitPromise;
    return {
      ...meta,
      elementCount: elements.length,
      durationMs: Date.now() - (meta.startedAt || Date.now()),
    };
  }
  // Fallback when API isn't ready — return immediately with no stats
  console.warn("[loadFile] excalidrawAPI not ready, completion not awaited");
  return { ...meta, elementCount: 0, durationMs: 0 };
};

/**
 * @param {File} file
 * @returns {Promise<void>}  Kept for backward compat — internal use only.
 *                            External callers should use loadFileBuffer / loadFileString.
 */
export const loadFile = async (file) => {
  await _dispatchAndWait(file);
};

/**
 * @param {number[]} buffer
 * @param {string} type  e.g. "png", "jpeg"
 * @returns {Promise<{ elementCount: number, durationMs: number }>}
 */
export const loadImageBuffer = async (buffer, type) => {
  const startedAt = Date.now();
  const typedArray = new Uint8Array(buffer);
  const blob = new Blob([typedArray], { type: `image/${type}` });
  const file = new File([blob], `image.${type}`, { type: `image/${type}` });
  return loadImage(file, { startedAt });
};

/**
 * @param {File} image
 * @param {{ startedAt?: number }} [meta]
 * @returns {Promise<{ elementCount: number, durationMs: number }>}
 */
export const loadImage = async (image, meta = {}) => {
  const startedAt = meta.startedAt || Date.now();
  const node = document.querySelector(".excalidraw-container");
  if (!node) {
    throw new Error("loadImage: .excalidraw-container not found");
  }

  const api = getAPI();
  const waitPromise = api ? waitForSceneChange(api) : null;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(image);

  const { x: clientX, y: clientY } = (() => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })();
  const fakeDropEvent = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  fakeDropEvent.simulated = true;
  Object.defineProperty(fakeDropEvent, "dataTransfer", {
    value: dataTransfer,
  });
  node.dispatchEvent(fakeDropEvent);

  if (waitPromise) {
    const elements = await waitPromise;
    return {
      elementCount: elements.length,
      durationMs: Date.now() - startedAt,
    };
  }
  console.warn("[loadImage] excalidrawAPI not ready, completion not awaited");
  return { elementCount: 0, durationMs: 0 };
};

export const saveFile = () => {
  const elementsData = localStorage.getItem("excalidraw");
  const appStateData = localStorage.getItem("excalidraw-state");
  try {
    const elements = JSON.parse(elementsData);
    const appState = JSON.parse(appStateData);
    const completeData = JSON.stringify({
      elements,
      appState,
    });
    sendMessage({
      event: "saveFileDone",
      data: completeData,
    });
  } catch (error) {
    console.error("Failed to save file:", error);
  }
};

export const loadLibraryItem = (json) => {
  const mineType = "application/vnd.excalidrawlib+json";
  const dataTransfer = new DataTransfer();
  dataTransfer.setData(mineType, JSON.stringify(json));
  const positionX = window.innerWidth / 2;
  const positionY = window.innerHeight / 2;
  const dropEvent = new DragEvent("drop", {
    dataTransfer,
    bubbles: true,
    cancelable: true,
    clientX: positionX,
    clientY: positionY,
  });
  const node = document.querySelector(".excalidraw-container");
  node.dispatchEvent(dropEvent);
};

export const onLoadLibrary = (libraryData) => {
  sendMessage({
    event: "onLoadLibrary",
    data: libraryData,
  });
};
