import { MIME_TYPES } from "@excalidraw/common";
import {
  loadSceneOrLibraryFromBlob,
  normalizeFile,
} from "@excalidraw/excalidraw/data/blob";

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

let latestFileLoadRequestId = null;
const fileLoadRequests = new Map();

const createFileLoadError = (status, message, requestId, fileId) => {
  const error = new Error(message);
  error.name = "ExcalidrawZFileLoadError";
  error.code = `EXCALIDRAWZ_FILE_LOAD_${status.toUpperCase()}`;
  error.status = status;
  error.requestId = requestId;
  error.fileId = fileId;
  return error;
};

const registerFileLoadRequest = ({ requestId, fileId, startedAt }) => {
  if (typeof requestId !== "string" || !requestId.trim()) {
    throw new Error("loadFileBuffer: requestId is required");
  }

  const normalizedRequestId = requestId.trim();
  const previousRequest = fileLoadRequests.get(latestFileLoadRequestId);
  previousRequest?.cancel(
    "superseded",
    `load superseded by request ${normalizedRequestId}`,
  );

  latestFileLoadRequestId = normalizedRequestId;

  let rejectCancellation;
  const cancellationPromise = new Promise((_, reject) => {
    rejectCancellation = reject;
  });
  // The promise is normally consumed through `wait()`. Keep it handled during
  // synchronous stages as well so superseding cannot produce a console-level
  // unhandled rejection.
  cancellationPromise.catch(() => {});

  const request = {
    requestId: normalizedRequestId,
    fileId,
    startedAt,
    settled: false,
    error: null,
    timer: null,
    isCurrent: () =>
      latestFileLoadRequestId === normalizedRequestId && !request.settled,
    wait: (promise) => Promise.race([promise, cancellationPromise]),
    assertCurrent: () => {
      if (request.isCurrent()) {
        return;
      }
      if (request.error) {
        throw request.error;
      }
      const error = createFileLoadError(
        "superseded",
        `load request ${normalizedRequestId} is no longer current`,
        normalizedRequestId,
        fileId,
      );
      request.cancel("superseded", error.message);
      throw error;
    },
    cancel: (status, message) => {
      if (request.settled) {
        return request.error;
      }
      request.settled = true;
      request.error = createFileLoadError(
        status,
        message,
        normalizedRequestId,
        fileId,
      );
      clearTimeout(request.timer);
      fileLoadRequests.delete(normalizedRequestId);
      rejectCancellation(request.error);
      return request.error;
    },
    fail: (error) => {
      if (request.settled) {
        return request.error || error;
      }
      request.settled = true;
      request.error =
        error?.name === "ExcalidrawZFileLoadError"
          ? error
          : createFileLoadError(
              "error",
              error?.message || String(error),
              normalizedRequestId,
              fileId,
            );
      clearTimeout(request.timer);
      fileLoadRequests.delete(normalizedRequestId);
      return request.error;
    },
    succeed: (elementCount) => {
      request.assertCurrent();
      request.settled = true;
      clearTimeout(request.timer);
      fileLoadRequests.delete(normalizedRequestId);
      return {
        requestId: normalizedRequestId,
        fileId,
        elementCount,
        durationMs: Date.now() - startedAt,
      };
    },
  };

  request.timer = setTimeout(() => {
    request.cancel(
      "timeout",
      "load timed out — file may be invalid, rejected, or empty",
    );
  }, DEFAULT_LOAD_TIMEOUT_MS);

  fileLoadRequests.set(normalizedRequestId, request);
  return request;
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

const waitForNextPaint = () =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const loadSerializedFile = async ({
  readSerializedData,
  source,
  fileId,
  requestId,
}) => {
  const startedAt = Date.now();
  const request = registerFileLoadRequest({ requestId, fileId, startedAt });
  const endStateChangeSuppression =
    window.excalidrawZHelper?._beginStateChangeSuppression?.();

  try {
    const api = getAPI();
    if (!api?._excalidrawZ?.applyFileScene) {
      throw new Error(`${source}: ExcalidrawZ file API not ready`);
    }

    const { dataString, byteLength } = readSerializedData();
    let content;
    try {
      content = JSON.parse(dataString);
    } catch (error) {
      throw new Error(`${source}: invalid JSON — ${error.message}`);
    }

    console.info(source, {
      ...(byteLength == null ? {} : { byteLength }),
      requestId: request.requestId,
      fileId,
      ...getLoadContentSummary(content),
    });
    request.assertCurrent();

    // Reloading the active file preserves the live camera, not a potentially
    // stale localStorage snapshot.
    if (fileId && window.excalidrawZHelper.currentFileId === fileId) {
      const appState = api.getAppState();
      content.appState = {
        ...content.appState,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      };
    }

    const relativeFiles = await request.wait(
      getRelativeFiles(content.elements || []),
    );
    request.assertCurrent();
    content.files = { ...content.files, ...relativeFiles };

    const blob = new Blob([JSON.stringify(content)], {
      type: MIME_TYPES.excalidraw,
    });
    let file = new File([blob], "file.excalidraw", {
      type: MIME_TYPES.excalidraw,
    });

    file = await request.wait(normalizeFile(file));
    request.assertCurrent();

    const restored = await request.wait(
      loadSceneOrLibraryFromBlob(
        file,
        api.getAppState(),
        api.getSceneElementsIncludingDeleted(),
        null,
      ),
    );
    request.assertCurrent();

    if (restored.type === MIME_TYPES.excalidrawlib) {
      window.excalidrawZHelper?.onLoadLibrary?.(restored.data);
      throw createFileLoadError(
        "library",
        "Loaded file is an Excalidraw library",
        request.requestId,
        fileId,
      );
    }
    if (restored.type !== MIME_TYPES.excalidraw) {
      throw new Error(`${source}: invalid Excalidraw file`);
    }

    // Final guard before the only operation that mutates the live scene.
    request.assertCurrent();
    const { elementCount } = api._excalidrawZ.applyFileScene(restored.data);

    // The file identity changes only after the scene was synchronously handed
    // to Excalidraw for application.
    if (fileId !== undefined) {
      window.excalidrawZHelper.currentFileId = fileId;
    }

    // Match the old completion contract: resolve after React has had a frame
    // to commit and paint the applied scene.
    await request.wait(waitForNextPaint());
    request.assertCurrent();
    return request.succeed(elementCount);
  } catch (error) {
    throw request.fail(error);
  } finally {
    endStateChangeSuppression?.();
  }
};

/**
 * Load a serialized Excalidraw file directly through the imperative API.
 *
 * @param {number[] | ArrayBuffer | Uint8Array} buffer
 * @param {string} fileId
 * @param {string} requestId
 * @returns {Promise<{
 *   requestId: string,
 *   fileId: string,
 *   elementCount: number,
 *   durationMs: number,
 * }>}
 */
export const loadFileBuffer = async (buffer, fileId, requestId) =>
  loadSerializedFile({
    source: "loadFileBuffer",
    fileId,
    requestId,
    readSerializedData: () => {
      const bytes = new Uint8Array(buffer);
      return {
        dataString: new TextDecoder("utf-8").decode(bytes),
        byteLength: bytes.byteLength,
      };
    },
  });

/**
 * @param {string} dataString
 * @returns {Promise<{
 *   requestId: string,
 *   fileId: undefined,
 *   elementCount: number,
 *   durationMs: number,
 * }>}
 */
export const loadFileString = async (dataString) =>
  loadSerializedFile({
    source: "loadFileString",
    fileId: undefined,
    requestId: createLoadRequestId(),
    readSerializedData: () => ({ dataString }),
  });

/**
 * @param {File} file
 * @returns {Promise<object>} Kept for internal compatibility.
 */
export const loadFile = async (file) => {
  const buffer = await file.arrayBuffer();
  return loadFileBuffer(buffer, undefined, createLoadRequestId());
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
