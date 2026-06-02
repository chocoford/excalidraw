import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

const getAPI = () => window.excalidrawZHelper?._api;

const DEFAULT_LOAD_TIMEOUT_MS = 5000;

/**
 * Wait until the scene reflects a load attempt (or time out).
 *
 * Resolves on the first `onChange` fire after subscription. This is robust
 * because:
 *
 *   1. Excalidraw suppresses `onChange` while `appState.isLoading === true`
 *      (see App.tsx#onSceneUpdated). The drop handler sets isLoading=true
 *      before processing and back to false in `syncActionResult`, so the
 *      onChange we observe is post-load — not the in-flight render.
 *   2. Subscription and `dispatchEvent` happen synchronously with no `await`
 *      between them, so React cannot flush an unrelated state update in the
 *      gap.
 *   3. Pointer/cursor moves go through `onPointerUpdate`, not `onChange`.
 *   4. Even on parse failure, the drop handler calls
 *      `setState({ errorMessage, isLoading: false })`, so onChange still
 *      fires — distinguishing "load attempt completed" from "drop ignored".
 *
 * Critically, this works for empty → empty loads (which the previous
 * ID-set diff missed): we don't need any observable scene delta, just one
 * onChange fire from the post-load render.
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

/**
 * Snapshot the current scene as a serialized .excalidraw payload.
 *
 * Reads from live appState (no localStorage round-trip). Returns the
 * serialized JSON string directly — host should `await` this via
 * callAsyncJavaScript.
 *
 * @returns {Promise<{ dataString: string, elementCount: number }>}
 * @throws if excalidrawAPI is not ready
 */
export const saveFile = async () => {
  const api = getAPI();
  if (!api) {
    throw new Error("saveFile: excalidrawAPI not ready");
  }
  const elements = api.getSceneElementsIncludingDeleted();
  const appState = api.getAppState();
  const dataString = JSON.stringify({ elements, appState });
  // Backwards-compat broadcast — hosts subscribed to `saveFileDone` keep
  // working without switching to the Promise return value.
  sendMessage({ event: "saveFileDone", data: dataString });
  return { dataString, elementCount: elements.length };
};

/**
 * Snapshot the live scene + its referenced files into the same payload
 * shape the host receives via `onStateChanged` broadcasts.
 *
 * Use this when the host needs guaranteed up-to-date data: the broadcast
 * is throttled (~1s) so cached host state can lag behind the editor.
 * `getCurrentFileSnapshot()` always reflects the current scene at call time.
 *
 * @returns {Promise<{
 *   dataString: string,
 *   elements: readonly any[],
 *   appState: any,
 *   files: { [id: string]: any },
 * }>}
 * @throws if excalidrawAPI is not ready
 */
export const getCurrentFileSnapshot = async () => {
  const api = getAPI();
  if (!api) {
    throw new Error("getCurrentFileSnapshot: excalidrawAPI not ready");
  }
  const elements = api.getSceneElementsIncludingDeleted();
  const appState = api.getAppState();
  const files = await getRelativeFiles(elements);
  return {
    dataString: JSON.stringify({ elements, appState }),
    elements,
    appState,
    files,
  };
};

/**
 * Import a library item (e.g. .excalidrawlib JSON).
 *
 * Uses the imperative `updateLibrary` API directly — cleaner and properly
 * awaitable, vs the previous synthetic-drop hack.
 *
 * @param {object} json  Parsed .excalidrawlib payload
 * @param {{ merge?: boolean }} [opts]
 * @returns {Promise<{ itemCount: number }>}
 * @throws if excalidrawAPI is not ready or the library data is invalid
 */
export const loadLibraryItem = async (json, opts = {}) => {
  const api = getAPI();
  if (!api?.updateLibrary) {
    throw new Error("loadLibraryItem: excalidrawAPI not ready");
  }
  const { merge = true } = opts;
  const items = await api.updateLibrary({
    libraryItems: json,
    merge,
    openLibraryMenu: false,
  });
  return { itemCount: items.length };
};

export const onLoadLibrary = (libraryData) => {
  sendMessage({
    event: "onLoadLibrary",
    data: libraryData,
  });
};
