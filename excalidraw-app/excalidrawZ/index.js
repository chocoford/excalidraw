import "./clipboard";
import {
  connectPencil,
  getPointerInputPolicy,
  setPointerInputPolicy,
  toggleActionsMenu,
  togglePenMode,
  togglePencilInterationMode,
} from "./interaction";
import {
  connectFileStore,
  getAllMedias,
  insertMedias,
} from "./indexdb+";
import { sendMessage } from "./message";
import { toggleToolbarAction } from "./actions";
import { throttle } from "./_helpers";
import {
  loadFileBuffer,
  loadFileString,
  loadImageBuffer,
  loadImage,
  saveFile,
  getCurrentFileSnapshot,
  requestCurrentFileSaveStream,
  loadLibraryItem,
  onLoadLibrary,
} from "./load+save";
import {
  exportElementsToBlob,
  exportElementsToSvg,
  exportViewportToBlob,
} from "./export";
import { mermaidToElements, insertFromMermaid } from "./mermaid";
import { createMathImage, insertMathImage, updateMathImage } from "./math";
import {
  createElements,
  insertFromSkeleton,
  createShape,
  createText,
  createArrow,
  createLine,
  createFrame,
  createImage,
} from "./creators";
import { insertElements } from "./placement";
import {
  createScreenAnnotationDocument,
  insertScreenAnnotationDocument,
} from "./screenAnnotation";
import { connectElements } from "./connect";
import {
  nativeViewportInsets,
  setNativeViewportInsets,
  getNativeViewportInsets,
} from "./viewport";
import { getIsDark, toggleColorTheme } from "./colorScheme";
import { setAvailableFonts } from "./font";
import {
  getExcalidrawCollabInfo,
  openCollabMode,
  reportCollaborators,
  setExcalidrawCollabInfo,
  updateCollaborators,
} from "./collab";
import { loadPDFTiles, loadPDFViewer, handlePDFDrop } from "./pdf";
import { getUserSettings, applyUserSettings } from "./userSettings";
import {
  getCamera,
  setCamera,
  scrollToCenter,
  scrollToElement,
  zoomToFit,
  focusElements,
  zoomToFitElements,
  zoomTo,
  onCameraChange,
  startCameraTracking,
} from "./camera";
import {
  searchElements,
  setCanvasHighlights,
  clearCanvasHighlights,
  focusSearchResult,
  sendSearchResults,
} from "./search";
import {
  getCanvasPreferences,
  setCanvasTransparent,
  setCanvasPreferences,
  startCanvasPreferencesTracking,
} from "./canvasPreferences";
import { prepareCanvas } from "./prepareCanvas";
import { clearCanvas } from "./clearCanvas";
import {
  beginAICameraSession,
  updateAICameraTarget,
  endAICameraSession,
  cancelAICameraSession,
  interruptAICameraSession,
  getAICameraSession,
} from "./aiCameraSession";
import {
  CaptureUpdate,
  getElements,
  getElementsIncludingDeleted,
  getElementById,
  getElementsByIds,
  updateElement,
  updateElements,
  addElements,
  removeElements,
  replaceAllElements,
  getSelectedElementIds,
  setSelectedElementIds,
  clearPreviousSelection,
  startElementsTracking,
} from "./elements";

/**
 *
 * @param {'png' | 'svg'} type
 */
const exportImage = () => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "e",
      code: "KeyE",
      metaKey: true,
      shiftKey: true,
      composed: true,
      keyCode: 69,
      which: 69,
    }),
  );
  setTimeout(() => {
    const modalContainer = document.querySelector(
      ".excalidraw-modal-container",
    );
    modalContainer.querySelector('button[aria-label*="PNG"]').click();
    // modalContainer.querySelector('button[aria-label="Close"]').click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 27, // Deprecated but still used in some older browsers
        code: "Escape",
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, 100);
};

/**
 *
 * @param {{
 *   lastActiveTool: ActiveTool | null;
 *   locked: boolean;
 *  } & ActiveTool} tool
 *
 */
export const didSetActiveTool = (tool) => {
  sendMessage({
    event: "didSetActiveTool",
    data: tool,
  });
  if (
    (tool.type !== "selection" ||
      window.excalidrawZHelper.pencilInterationMode === 1) &&
    tool.type !== "eraser"
  ) {
    const keyMap = {
      selection: "1",
      rectangle: "2",
      diamond: "3",
      ellipse: "4",
      arrow: "5",
      line: "6",
      freedraw: "7",
      text: "8",
      image: "9",
      hand: "h",
      frame: "f",
      laser: "k",
    };
    window.excalidrawZHelper.lastToggleToolKey = keyMap[tool.type];
  }
};

export const didToggleToolLock = (isLocked) => {
  sendMessage({
    event: "didToggleToolLock",
    data: isLocked,
  });
};

const WATCH_STATE_SLOW_MS = 100;

let watchStatePerfId = 0;
let watchStateRevision = 0;
let lastContentSignature = null;
let lastAppStateSignature = null;
let watchStateSuppressionDepth = 0;
let watchStateSuppressionGeneration = 0;

const getPerformanceNow = () =>
  typeof performance !== "undefined" &&
  typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const roundDuration = (duration) => Math.round(duration * 10) / 10;

const getFileElementCount = (elements) =>
  elements.reduce((total, element) => total + (element?.fileId ? 1 : 0), 0);

const getDeletedElementCount = (elements) =>
  elements.reduce((total, element) => total + (element?.isDeleted ? 1 : 0), 0);

const getObjectKeyCount = (value) =>
  value && typeof value === "object" ? Object.keys(value).length : 0;

const updateHash = (hash, value) => {
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) + hash + text.charCodeAt(i);
  }
  return hash >>> 0;
};

const getContentSignature = (elements) => {
  let hash = updateHash(5381, elements.length);
  elements.forEach((element) => {
    hash = updateHash(hash, element?.id);
    hash = updateHash(hash, element?.version);
    hash = updateHash(hash, element?.versionNonce);
    hash = updateHash(hash, element?.isDeleted ? 1 : 0);
    hash = updateHash(hash, element?.index);
    hash = updateHash(hash, element?.fileId);
  });
  return `${elements.length}:${hash}`;
};

const stringifyAppStateForSignature = (appState) => {
  try {
    return JSON.stringify(appState ?? {});
  } catch (error) {
    console.warn("[watchExcalidrawState] failed to stringify appState", error);
    return `unserializable:${Date.now()}`;
  }
};

const getNextStateRevision = () => {
  watchStateRevision += 1;
  if (window.excalidrawZHelper) {
    window.excalidrawZHelper.lastStateChangeRevision = watchStateRevision;
  }
  return watchStateRevision;
};

const setWatchStateSignatures = (elements, appState) => {
  lastContentSignature = getContentSignature(elements);
  lastAppStateSignature = stringifyAppStateForSignature(appState);
};

const resetWatchStateBaseline = () => {
  const api = window.excalidrawZHelper?._api;
  if (!api) {
    return false;
  }

  const elements =
    api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements?.() ?? [];
  const appState = api.getAppState?.() ?? {};
  setWatchStateSignatures(elements, appState);
  return true;
};

const beginStateChangeSuppression = () => {
  watchStateSuppressionDepth += 1;
  watchStateSuppressionGeneration += 1;

  let ended = false;
  return () => {
    if (ended) {
      return;
    }
    ended = true;
    watchStateSuppressionDepth = Math.max(0, watchStateSuppressionDepth - 1);
    if (watchStateSuppressionDepth === 0) {
      resetWatchStateBaseline();
      watchStateSuppressionGeneration += 1;
    }
  };
};

const createStateChangedPayload = (elements, appState) => {
  const contentSignature = getContentSignature(elements);
  const appStateSignature = stringifyAppStateForSignature(appState);
  const contentDirty = contentSignature !== lastContentSignature;
  const appStateDirty = appStateSignature !== lastAppStateSignature;

  if (!contentDirty && !appStateDirty) {
    return null;
  }

  lastContentSignature = contentSignature;
  lastAppStateSignature = appStateSignature;

  return {
    revision: getNextStateRevision(),
    changedAt: Date.now(),
    dirty: true,
    contentDirty,
    appStateDirty,
    appState,
    elementCount: elements.length,
    deletedElementCount: getDeletedElementCount(elements),
    fileElementCount: getFileElementCount(elements),
    appStateKeyCount: getObjectKeyCount(appState),
    appStateChars: appStateSignature.length,
    currentFileId: window.excalidrawZHelper?.currentFileId ?? null,
  };
};

const logWatchStatePerformance = (summary) => {
  console.info("[watchExcalidrawState:perf]", summary);
  if (summary.totalMs >= WATCH_STATE_SLOW_MS) {
    console.warn("[watchExcalidrawState:slow]", summary);
  }
};

/**
 * Watch scene/appState changes and broadcast a lightweight `onStateChanged`.
 *
 * The event sends the full appState, but intentionally avoids sending
 * elements/files/dataString through the WebKit bridge on every edit. Hosts can
 * pull full content on demand through `getCurrentFileSnapshot()` when
 * `contentDirty` is true.
 *
 * Event-driven (api.onChange) + 1s throttle:
 *   - first change after a quiet period fires immediately (leading edge)
 *   - subsequent changes inside the 1s window are coalesced into a single
 *     trailing call at the end of the window
 *   - no changes → no events
 *
 * Replaces the old setInterval(2s) localStorage polling.
 */
const startWatchExcalidrawState = () => {
  const api = window.excalidrawZHelper?._api;
  if (!api || typeof api.onChange !== "function") {
    console.warn("[watchExcalidrawState] excalidrawAPI not ready");
    return;
  }

  resetWatchStateBaseline();

  const dispatch = throttle((elements, appState, suppressionGeneration) => {
    try {
      if (
        watchStateSuppressionDepth > 0 ||
        suppressionGeneration !== watchStateSuppressionGeneration
      ) {
        return;
      }

      const perfId = ++watchStatePerfId;
      const totalStartedAt = getPerformanceNow();

      const payloadStartedAt = getPerformanceNow();
      const payload = createStateChangedPayload(elements, appState);
      const payloadMs = getPerformanceNow() - payloadStartedAt;
      if (!payload) {
        return;
      }

      const sendStartedAt = getPerformanceNow();
      sendMessage({
        event: "onStateChanged",
        data: {
          data: payload,
        },
      });
      const sendMessageMs = getPerformanceNow() - sendStartedAt;
      const totalMs = getPerformanceNow() - totalStartedAt;

      logWatchStatePerformance({
        id: perfId,
        totalMs: roundDuration(totalMs),
        buildPayloadMs: roundDuration(payloadMs),
        sendMessageMs: roundDuration(sendMessageMs),
        revision: payload.revision,
        contentDirty: payload.contentDirty,
        appStateDirty: payload.appStateDirty,
        elementCount: payload.elementCount,
        deletedElementCount: payload.deletedElementCount,
        fileElementCount: payload.fileElementCount,
        appStateKeyCount: payload.appStateKeyCount,
        appStateChars: payload.appStateChars,
      });
    } catch (error) {
      console.error("[watchExcalidrawState]", error);
    }
  }, 1000);

  api.onChange((elements, appState) => {
    if (watchStateSuppressionDepth > 0) {
      return;
    }

    dispatch(elements, appState, watchStateSuppressionGeneration);
  });
};

const hideEls = () => {
  const targetNode = document.body;
  // Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true };
  // Callback function to execute when mutations are observed
  const callback = (mutationList) => {
    for (const mutation of mutationList) {
      // console.log(mutation);
      if (mutation.type === "childList") {
      }
    }
  };

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback);

  // Start observing the target node for configured mutations
  observer.observe(targetNode, config);
};

const watchHistoryButtonState = () => {
  const containerNode = document.querySelector(".excalidraw-container");
  let undoButtonNode = null;
  let redoButtonNode = null;
  if (!containerNode) {
    console.warn("containerNode not found.");
    return;
  }

  const undoButtonObserver = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "disabled"
      ) {
        sendMessage({
          event: "historyStateChanged",
          data: {
            type: "undo",
            disabled: undoButtonNode.disabled,
          },
        });
      }
    });
  });
  const redoButtonObserver = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "disabled"
      ) {
        sendMessage({
          event: "historyStateChanged",
          data: {
            type: "redo",
            disabled: redoButtonNode.disabled,
          },
        });
      }
    });
  });

  const observeHistoryButtons = () => {
    const newUndoButtonNode = document.querySelector(
      '[data-testid="button-undo"]',
    );
    sendMessage({
      event: "historyStateChanged",
      data: {
        type: "undo",
        disabled: newUndoButtonNode.disabled,
      },
    });
    const newRedoButtonNode = document.querySelector(
      '[data-testid="button-redo"]',
    );
    sendMessage({
      event: "historyStateChanged",
      data: {
        type: "redo",
        disabled: newRedoButtonNode.disabled,
      },
    });
    if (newUndoButtonNode && newUndoButtonNode !== undoButtonNode) {
      undoButtonNode = newUndoButtonNode;
      undoButtonObserver.disconnect();
      undoButtonObserver.observe(newUndoButtonNode, { attributes: true });
    }
    if (newRedoButtonNode && newRedoButtonNode !== redoButtonNode) {
      redoButtonNode = newRedoButtonNode;
      redoButtonObserver.disconnect();
      redoButtonObserver.observe(newRedoButtonNode, { attributes: true });
    }
  };

  const containerObserver = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        observeHistoryButtons();
      }
    });
  });
  observeHistoryButtons();
  containerObserver.observe(containerNode, { attributes: true });
};

const observeContainerLoad = (callback) => {
  const bodyObserver = new MutationObserver(() => {
    const containerNode = document.querySelector(".excalidraw-container");
    if (containerNode) {
      bodyObserver.disconnect();
      callback(containerNode);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
};

const onDomReady = () => {
  // DOM-level setup only. The "onload" message is deferred until the
  // helper is fully initialized (excalidrawAPI bridged + trackers started),
  // which is signalled by App.tsx via `notifyHelperReady()` below.
  hideEls();
  observeContainerLoad(() => {
    watchHistoryButtonState();
  });
  connectFileStore();
};

window.addEventListener("DOMContentLoaded", onDomReady);

/**
 * Called by App.tsx once excalidrawAPI is bridged and all trackers are
 * started. Sends the `onload` message to the host, signalling the helper
 * is fully usable. Idempotent — host receives `onload` at most once.
 */
let _helperReadyFired = false;
export const notifyHelperReady = () => {
  if (_helperReadyFired) {
    return;
  }
  _helperReadyFired = true;
  sendMessage({ event: "onload" });

  // Suppress macOS UI sound on first focus shortly after load
  setTimeout(() => {
    sendMessage({ event: "onBlur" });
  }, 300);
};

document.addEventListener(
  "focus",
  (event) => {
    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA"
    ) {
      sendMessage({
        event: "onFocus",
      });
    }
  },
  true,
);
document.addEventListener(
  "blur",
  (event) => {
    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA"
    ) {
      sendMessage({
        event: "onBlur",
      });
    }
  },
  true,
);

window.excalidrawZHelper = {
  sendMessage,

  loadFileBuffer,
  loadFileString,
  saveFile,
  getCurrentFileSnapshot,
  requestCurrentFileSaveStream,

  loadImageBuffer,
  loadImage,

  loadLibraryItem,
  onLoadLibrary,

  toggleColorTheme,
  exportImage,
  getIsDark,

  toggleToolbarAction,
  lastToggleToolKey: null,
  lastStateChangeRevision: 0,
  _beginStateChangeSuppression: beginStateChangeSuppression,

  didSetActiveTool,

  exportElementsToBlob,
  exportElementsToSvg,
  exportViewportToBlob,

  // Mermaid
  mermaidToElements,
  insertFromMermaid,

  // Math images
  createMathImage,
  insertMathImage,
  updateMathImage,

  // Element creators
  createElements,
  createShape,
  createText,
  createArrow,
  createLine,
  createFrame,
  createImage,

  // One-shot insertion
  insertElements,
  insertFromSkeleton,
  createScreenAnnotationDocument,
  insertScreenAnnotationDocument,

  // Connect existing elements
  connectElements,

  // Native viewport/safe-area bridge
  nativeViewportInsets,
  setNativeViewportInsets,
  getNativeViewportInsets,

  getAllMedias,
  insertMedias,

  undo: () => {
    document.querySelector('[data-testid="button-undo"]')?.click();
  },
  redo: () => {
    document.querySelector('[data-testid="button-redo"]')?.click();
  },

  // pencil
  pencilConnected: false,
  pencilInterationMode: 0,
  pointerInputPolicy: { oneFingerAction: "select" },
  inPencilMode: false,
  connectPencil,
  togglePenMode,
  togglePencilInterationMode,
  setPointerInputPolicy,
  getPointerInputPolicy,
  _pointerInputHook: null,

  shouldHideActionsMenu: false,
  toggleActionsMenu,

  // font
  availableFonts: [],
  setAvailableFonts,

  // collab
  openCollabMode,
  getExcalidrawCollabInfo,
  setExcalidrawCollabInfo,
  collaborators: [],
  reportCollaborators,
  updateCollaborators,

  // PDF
  loadPDFTiles,
  loadPDFViewer,
  handlePDFDrop,

  // User Settings
  getUserSettings,
  applyUserSettings,

  // Core
  _api: null,
  startWatchExcalidrawState,
  notifyHelperReady,

  // Camera
  getCamera,
  setCamera,
  scrollToCenter,
  scrollToElement,
  zoomToFit,
  focusElements,
  zoomToFitElements,
  zoomTo,
  onCameraChange,
  startCameraTracking,

  // Search
  searchElements,
  setCanvasHighlights,
  clearCanvasHighlights,
  focusSearchResult,
  sendSearchResults,

  // Canvas Preferences
  getCanvasPreferences,
  setCanvasPreferences,
  setCanvasTransparent,
  prepareCanvas,
  clearCanvas,
  startCanvasPreferencesTracking,

  // AI Camera Session
  beginAICameraSession,
  updateAICameraTarget,
  endAICameraSession,
  cancelAICameraSession,
  interruptAICameraSession,
  getAICameraSession,

  // Elements
  CaptureUpdate,
  getElements,
  getElementsIncludingDeleted,
  getElementById,
  getElementsByIds,
  updateElement,
  updateElements,
  addElements,
  removeElements,
  replaceAllElements,
  getSelectedElementIds,
  setSelectedElementIds,
  clearPreviousSelection,
  startElementsTracking,
};
