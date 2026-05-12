import "./clipboard";
import {
  connectPencil,
  toggleActionsMenu,
  togglePenMode,
  togglePencilInterationMode,
} from "./interaction";
import {
  connectFileStore,
  getRelativeFiles,
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
  loadLibraryItem,
  onLoadLibrary,
} from "./load+save";
import { exportElementsToBlob, exportElementsToSvg } from "./export";
import { mermaidToElements, insertFromMermaid } from "./mermaid";
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
import { connectElements } from "./connect";
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
  setCanvasPreferences,
  startCanvasPreferencesTracking,
} from "./canvasPreferences";
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

/**
 * Watch scene/appState changes and broadcast to the host as `onStateChanged`.
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

  const dispatch = throttle(async (elements, appState) => {
    try {
      const filesDict = await getRelativeFiles(elements);
      sendMessage({
        event: "onStateChanged",
        data: {
          data: {
            dataString: JSON.stringify({ elements, appState }),
            elements,
            files: filesDict,
            appState,
          },
        },
      });
    } catch (error) {
      console.error("[watchExcalidrawState]", error);
    }
  }, 1000);

  api.onChange((elements, appState) => {
    dispatch(elements, appState);
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

  loadImageBuffer,
  loadImage,

  loadLibraryItem,
  onLoadLibrary,

  toggleColorTheme,
  exportImage,
  getIsDark,

  toggleToolbarAction,
  lastToggleToolKey: null,

  didSetActiveTool,

  exportElementsToBlob,
  exportElementsToSvg,

  // Mermaid
  mermaidToElements,
  insertFromMermaid,

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

  // Connect existing elements
  connectElements,

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
  inPencilMode: false,
  connectPencil,
  togglePenMode,
  togglePencilInterationMode,

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
  startElementsTracking,
};
