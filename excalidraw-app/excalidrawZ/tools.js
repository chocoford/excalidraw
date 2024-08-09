/**
 *
 * @param {number[]} buffer
 */
const loadFile = (buffer) => {
  const uint8Array = new Uint8Array(buffer);
  const file = new File([uint8Array], "file.excalidraw", {
    lastModified: new Date().getTime(),
    type: "",
  });

  function FakeDataTransfer(file) {
    this.dropEffect = "all";
    this.effectAllowed = "all";
    this.items = [{ getAsFileSystemHandle: async () => null }];
    this.types = ["Files"];
    this.getData = function () {
      return file;
    };
    this.files = {
      item: () => {
        return file;
      },
    };
  }

  const fakeDropEvent = new DragEvent("drop", { bubbles: true });
  fakeDropEvent.simulated = true;
  Object.defineProperty(fakeDropEvent, "dataTransfer", {
    value: new FakeDataTransfer(file),
  });

  const node = document.querySelector(".excalidraw-container");
  node.dispatchEvent(fakeDropEvent);
};

const saveFile = () => {
  const data = localStorage.getItem("excalidraw");
  try {
    // data = JSON.parse(data);
    sendMessage({
      event: "saveFileDone",
      data,
    });
  } catch {}
};

/**
 *
 * @param {'dark' | 'light' | undefined} theme
 */
const toggleColorTheme = (theme = undefined) => {
  if (document.documentElement.classList.contains(theme)) {
    return;
  }
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
};

/**
 *
 * @param {'png' | 'svg'} type
 */
const exportImage = (type = "png") => {
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
    modalContainer.querySelector('button[aria-label="Export to PNG"]').click();
    modalContainer.querySelector('button[aria-label="Close"]').click();
  }, 100);
};

const watchExcalidrawState = () => {
  let lastVersion = "";
  setInterval(() => {
    const data = localStorage.getItem("excalidraw");
    let state = localStorage.getItem("excalidraw-state");
    const version = localStorage.getItem("version-files");
    if (lastVersion === version) {
      return;
    }
    try {
      state = JSON.parse(state);
      // data = JSON.parse(data);
      sendMessage({
        event: "onStateChanged",
        data: {
          state,
          data,
        },
      });
    } catch {}
    lastVersion = version;
  }, 2000);
};

const sendMessage = ({ event, data }) => {
  console.info("sendMessage", { event, data });
  if (
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.toggleMessageHandler
  ) {
    window.webkit.messageHandlers.toggleMessageHandler.postMessage({
      event,
      data,
    });
  }
};

const hideEls = () => {
  const targetNode = document.body;
  // Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true };
  // Callback function to execute when mutations are observed
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      console.log(mutation);
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (
            node.classList.contains("dropdown-menu-button") ||
            node.classList.contains("welcome-screen-decor-hint--menu")
          ) {
            node.style.display = "none";
          }

          if (node.classList.contains("welcome-screen-center")) {
            node.querySelector(".welcome-screen-menu").style.display = "none";
          }
        });

        if (
          mutation.nextSibling &&
          mutation.nextSibling.classList.contains(
            "layer-ui__wrapper__footer-right",
          )
        ) {
          mutation.nextSibling.style.display = "none";
        }

        // top right
        if (
          mutation.target.classList.contains("layer-ui__wrapper__top-right")
        ) {
          mutation.target.style.display = "none";
        }
        // model container
        if (mutation.target.classList.contains("excalidraw-modal-container")) {
          mutation.target.style.opacity = 0;
          mutation.target.style.pointerEvents = "none";
        }
      }
    }
  };

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback);

  // Start observing the target node for configured mutations
  observer.observe(targetNode, config);
};

const onload = () => {
  watchExcalidrawState();
  hideEls();
};

const toggleToolbarAction = (key) => {
  const eventInfo = {
    0: {
      key: "0",
      code: "Digit0",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 48,
      which: 48,
    },
    1: {
      key: "1",
      code: "Digit1",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 49,
      which: 49,
    },
    2: {
      key: "2",
      code: "Digit2",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 50,
      which: 50,
    },
    3: {
      key: "3",
      code: "Digit3",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 51,
      which: 51,
    },
    4: {
      key: "4",
      code: "Digit4",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 52,
      which: 52,
    },
    5: {
      key: "5",
      code: "Digit5",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 53,
      which: 53,
    },
    6: {
      key: "6",
      code: "Digit6",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 54,
      which: 54,
    },
    7: {
      key: "7",
      code: "Digit7",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 55,
      which: 55,
    },
    8: {
      key: "8",
      code: "Digit8",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 56,
      which: 56,
    },
    9: {
      key: "9",
      code: "Digit9",
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode: 57,
      which: 57,
    },
  }
  if (eventInfo[key]) document.dispatchEvent(new KeyboardEvent("keydown", eventInfo[key]));
}

window.addEventListener("DOMContentLoaded", onload);

window.excalidrawZHelper = {
  loadFile,
  saveFile,

  toggleColorTheme,
  exportImage,
  getIsDark: () => document.documentElement.classList.contains("dark"),

  toggleToolbarAction,
};
