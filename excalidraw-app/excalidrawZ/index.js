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
import {
  loadFileBuffer,
  loadFileString,
  loadImageBuffer,
  loadImage,
  saveFile,
  loadLibraryItem,
  onLoadLibrary,
} from "./load+save";
import { exportElementsToBlob, exportElementsToSvg } from "./export";
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
import {
  getUserSettings,
  applyUserSettings,
  startSettingsPolling,
} from "./userSettings";
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

const watchExcalidrawState = async () => {
  try {
    console.info("Connect files store done.");

    let lastVersion = "";
    setInterval(async () => {
      const data = localStorage.getItem("excalidraw");
      let state = localStorage.getItem("excalidraw-state");
      const version = localStorage.getItem("version-files");
      if (lastVersion === version) {
        return;
      }
      try {
        state = JSON.parse(state);
        /**
         * @type {any[]}
         */
        const elements = JSON.parse(data);
        const filesDict = await getRelativeFiles(elements);
        sendMessage({
          event: "onStateChanged",
          data: {
            data: {
              dataString: JSON.stringify({
                elements,
                appState: state,
                // files: filesDict,
              }),
              elements,
              files: filesDict,
              appState: state,
            },
          },
        });
      } catch (error) {
        console.error(error);
      }
      lastVersion = version;
    }, 2000);
  } catch (error) {
    console.error(error);
  }
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

const onload = () => {
  setTimeout(() => {
    watchExcalidrawState();
  }, 2000);
  hideEls();
  observeContainerLoad(() => {
    watchHistoryButtonState();
  });
  sendMessage({
    event: "onload",
  });

  // connect file store
  connectFileStore();

  // start user settings polling and sync
  startSettingsPolling(2000);

  // remove annoying sounds
  setTimeout(() => {
    sendMessage({
      event: "onBlur",
    });
  }, 300);
};

window.addEventListener("DOMContentLoaded", onload);

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

  // Camera
  _api: null,
  getCamera,
  setCamera,
  scrollToCenter,
  scrollToElement,
  zoomToFit,
  zoomToFitElements,
  zoomTo,
  onCameraChange,
  startCameraTracking,

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
