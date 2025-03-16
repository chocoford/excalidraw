import "./clipboard";
import {
  connectPencil,
  toggleActionsMenu,
  togglePenMode,
  togglePencilInterationMode,
} from "./interaction";
import {
  filesStoreConnection,
  connectFileStore,
  getRelativeFiles,
  getAllMedias,
} from "./indexdb+";
import { sendMessage } from "./message";
import { toggleToolbarAction } from "./actions";
import { antiInvertImage, toggleAntiInvertImageSettings } from "./image";
import {
  loadFileBuffer,
  loadFileString,
  loadImageBuffer,
  loadImage,
  saveFile,
  loadLibraryItem,
} from "./load+save";
import { exportElementsToBlob, exportElementsToSvg } from "./export";
import { getIsDark, toggleColorTheme } from "./colorScheme";
import {
  getExcalidrawCollabInfo,
  openCollabMode,
  reportCollaborators,
  setExcalidrawCollabInfo,
  updateCollaborators,
} from "./collab";

const toggleImageInvertSwitch = (flag) => {
  if (window.excalidrawZHelper.shouldPreventInvertImage === flag) {
    return;
  }

  window.excalidrawZHelper.shouldPreventInvertImage = flag;
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Î",
      code: "KeyD",
      altKey: true,
      shiftKey: true,
      composed: true,
      keyCode: 68,
      which: 68,
    }),
  );
  setTimeout(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Î",
        code: "KeyD",
        altKey: true,
        shiftKey: true,
        composed: true,
        keyCode: 68,
        which: 68,
      }),
    );
  }, 0);
};

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
            state,
            data: {
              dataString: JSON.stringify({
                elements,
                // files: filesDict,
              }),
              elements,
              files: filesDict,
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

  // pre focus - remove annoying sounds
  const textarea = document.createElement("textarea");
  textarea.style.position = "absolute";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  setTimeout(() => {
    textarea.focus();
    setTimeout(() => {
      textarea.remove();
    }, 50);
  }, 20);
};

/**
 * Insert files to IndexedDB.
 * @param {string} filesJSONString The files to be inseted in the form fo json stringified string.
 */
const insertMedias = async (filesJSONString) => {
  const files = JSON.parse(filesJSONString);
  console.info("Start insertMedias");
  return await new Promise((resolve, reject) => {
    const transaction = filesStoreConnection.transaction(
      ["files-store"],
      "readwrite",
    );
    const objectStore = transaction.objectStore("files-store");
    for (const file of files) {
      objectStore.put(file, file.id);
    }

    transaction.oncomplete = function () {
      console.info("All records added successfully!");
      resolve();
    };

    transaction.onerror = function (event) {
      console.error("Transaction error:", event.target.error);
      reject(event.target.error);
    };
  });
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

  shouldPreventInvertImage: true,
  preventInvertImageFlags: {},
  toggleImageInvertSwitch,
  toggleAntiInvertImageSettings,

  antiInvertImage,

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

  // collab
  openCollabMode,
  getExcalidrawCollabInfo,
  setExcalidrawCollabInfo,
  collaborators: [],
  reportCollaborators,
  updateCollaborators,
};
