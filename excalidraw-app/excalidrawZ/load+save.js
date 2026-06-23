import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

const getAPI = () => window.excalidrawZHelper?._api;

const DEFAULT_LOAD_TIMEOUT_MS = 30000;
const DEFAULT_SAVE_STREAM_CHUNK_SIZE = 65536;
const MIN_SAVE_STREAM_CHUNK_SIZE = 1024;
const MAX_SAVE_STREAM_CHUNK_SIZE = 1024 * 1024;

const getLoadContentSummary = (content) => ({
  elementCount: content?.elements?.length ?? 0,
  fileCount: Object.keys(content?.files ?? {}).length,
  appStateKeyCount:
    content?.appState && typeof content.appState === "object"
      ? Object.keys(content.appState).length
      : 0,
});

const normalizeChunkSize = (chunkSize) => {
  const value = Number(chunkSize);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SAVE_STREAM_CHUNK_SIZE;
  }

  return Math.min(
    MAX_SAVE_STREAM_CHUNK_SIZE,
    Math.max(MIN_SAVE_STREAM_CHUNK_SIZE, Math.floor(value)),
  );
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return window.btoa(binary);
};

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256Hex = async (bytes) => {
  if (!window.crypto?.subtle?.digest) {
    throw new Error("SHA-256 is not available in this WebView");
  }

  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
};

const yieldToMainThread = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const createLoadRequestId = () =>
  `excalidrawz-load-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

let pendingFileLoadRequestId = null;

const notifyFileLoadDone = (loadRequestId, detail) => {
  if (!loadRequestId) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent("excalidrawz:fileLoadDone", {
        detail: {
          id: loadRequestId,
          ...detail,
        },
      }),
    );
  });
};

export const consumePendingFileLoadRequest = () => {
  const loadRequestId = pendingFileLoadRequestId;
  pendingFileLoadRequestId = null;

  if (!loadRequestId) {
    return null;
  }

  let done = false;
  return {
    done: (detail) => {
      if (done) {
        return;
      }
      done = true;
      notifyFileLoadDone(loadRequestId, detail);
    },
  };
};

/**
 * Wait until App.loadFileToCanvas reports that the requested file load has
 * reached the post-sync completion point.
 *
 * @param {string} loadRequestId
 * @param {number} timeoutMs
 * @returns {Promise<{ elementCount: number }>}
 */
const waitForFileLoadDone = (
  loadRequestId,
  timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
) => {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("excalidrawz:fileLoadDone", onDone);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "load timed out — file may be invalid, rejected, or empty",
        ),
      );
    }, timeoutMs);

    const onDone = (event) => {
      const detail = event.detail ?? {};
      if (detail.id !== loadRequestId) {
        return;
      }

      cleanup();
      if (detail.status === "error") {
        reject(new Error(detail.errorMessage || "load failed"));
        return;
      }
      resolve({ elementCount: detail.elementCount ?? 0 });
    };

    window.addEventListener("excalidrawz:fileLoadDone", onDone);
  });
};

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
  console.info("loadFileBuffer", {
    byteLength: uint8Array.byteLength,
    ...getLoadContentSummary(content),
  });

  // Check if loading the same file to preserve viewport
  const isSameFile =
    fileId && window.excalidrawZHelper.currentFileId === fileId;

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

  return _dispatchAndWait(file, { startedAt, fileId, content });
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
  console.info("loadFileString", getLoadContentSummary(content));
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });

  return _dispatchAndWait(file, { startedAt, content });
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
  const loadRequestId = api && meta.content ? createLoadRequestId() : null;
  const endStateChangeSuppression =
    loadRequestId &&
    window.excalidrawZHelper?._beginStateChangeSuppression?.();
  if (loadRequestId) {
    pendingFileLoadRequestId = loadRequestId;
  }

  const resultMeta = { ...meta };
  delete resultMeta.content;
  // Prepare the wait BEFORE dispatching so we don't miss the change
  const waitPromise =
    loadRequestId
      ? waitForFileLoadDone(loadRequestId)
      : api
        ? waitForSceneChange(api)
        : null;

  try {
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
      const result = await waitPromise;
      return {
        ...resultMeta,
        elementCount: result.elementCount ?? result.length ?? 0,
        durationMs: Date.now() - (resultMeta.startedAt || Date.now()),
      };
    }

    // Fallback when API isn't ready — return immediately with no stats
    console.warn("[loadFile] excalidrawAPI not ready, completion not awaited");
    return { ...resultMeta, elementCount: 0, durationMs: 0 };
  } finally {
    if (
      loadRequestId &&
      pendingFileLoadRequestId === loadRequestId
    ) {
      pendingFileLoadRequestId = null;
    }
    endStateChangeSuppression?.();
  }
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
 * Snapshot the live scene + its referenced files into a full document payload.
 *
 * Use this when the host needs guaranteed up-to-date data. `onStateChanged`
 * only sends a lightweight dirty notification; this API intentionally carries
 * the heavier scene/files payload and should be called at controlled moments
 * such as save, app backgrounding, document switching, or after editor idle.
 *
 * @returns {Promise<{
 *   revision: number | null,
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
    revision: window.excalidrawZHelper?.lastStateChangeRevision ?? null,
    elements,
    appState,
    files,
  };
};

const streamCurrentFileSave = async ({
  streamId,
  chunkSize,
  includeFiles,
}) => {
  try {
    if (!streamId) {
      throw new Error("streamId is required");
    }

    const api = getAPI();
    if (!api) {
      throw new Error("requestCurrentFileSaveStream: excalidrawAPI not ready");
    }

    const elements = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    const files = includeFiles ? await getRelativeFiles(elements) : {};
    const revision = window.excalidrawZHelper?.lastStateChangeRevision ?? null;
    const elementCount = elements.length;
    const fileCount = Object.keys(files).length;
    const json = JSON.stringify({ elements, appState, files });
    const bytes = new TextEncoder().encode(json);
    const totalBytes = bytes.byteLength;
    const hashPromise = sha256Hex(bytes).then(
      (sha256) => ({ sha256 }),
      (error) => ({ error }),
    );

    sendMessage({
      event: "currentFileSaveStreamStarted",
      data: {
        streamId,
        revision,
        elementCount,
        fileCount,
        totalBytes,
      },
    });

    for (let offset = 0, index = 0; offset < totalBytes; index += 1) {
      const end = Math.min(offset + chunkSize, totalBytes);
      const base64 = bytesToBase64(bytes.subarray(offset, end));
      sendMessage({
        event: "currentFileSaveStreamChunk",
        data: {
          streamId,
          index,
          base64,
        },
      });
      offset = end;
      await yieldToMainThread();
    }

    const hashResult = await hashPromise;
    if (hashResult.error) {
      throw hashResult.error;
    }

    sendMessage({
      event: "currentFileSaveStreamFinished",
      data: {
        streamId,
        revision,
        elementCount,
        fileCount,
        totalBytes,
        sha256: hashResult.sha256,
      },
    });
  } catch (error) {
    sendMessage({
      event: "currentFileSaveStreamFailed",
      data: {
        streamId,
        message: error?.message || String(error),
      },
    });
  }
};

/**
 * Streams the current document JSON bytes through native messages.
 *
 * The decoded chunk bytes concatenate to a UTF-8 JSON document with shape:
 * `{ elements, appState, files }`.
 *
 * @param {{ streamId: string, chunkSize?: number, includeFiles?: boolean }} options
 * @returns {{ supported: true }}
 */
export const requestCurrentFileSaveStream = (options = {}) => {
  const streamId = options?.streamId;
  const chunkSize = normalizeChunkSize(options?.chunkSize);
  const includeFiles = options?.includeFiles !== false;

  void streamCurrentFileSave({ streamId, chunkSize, includeFiles });
  return { supported: true };
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
