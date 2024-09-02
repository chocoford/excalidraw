import "./clipboard";
import { exportToBlob, exportToSvg } from "../../packages/utils/export";

const sendMessage = ({ event, data }) => {
  if (
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.excalidrawZ
  ) {
    console.info("sendMessage", { event, data });
    try {
      window.webkit.messageHandlers.excalidrawZ.postMessage({
        event,
        data,
      });
    } catch (error) {
      console.error(error);
    }
  } else {
    console.error("can not send message");
  }
};

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

const getIsDark = () => {
  const container = document
    .getElementsByClassName("excalidraw-container")
    .item(0);
  if (!container) {
    return false;
  }
  return container.classList.contains(`theme--dark`);
};

/**
 *
 * @param {'dark' | 'light' | undefined} theme
 */
const toggleColorTheme = (theme = undefined) => {
  const isDark = getIsDark();
  if ((theme === "dark") === isDark) {
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

export const didSetActiveTool = (tool) => {
  sendMessage({
    event: "didSetActiveTool",
    data: tool,
  });
};

const watchExcalidrawState = async () => {
  try {
    const filesStoreConnection = await new Promise((resolve, reject) => {
      const filesStoreConnection = indexedDB.open("files-db", 1);
      filesStoreConnection.onsuccess = function (event) {
        const db = event.target.result;
        resolve(db);
        //
        // 获取对象存储
        // resolve(transaction.objectStore("files-store"));
      };
      filesStoreConnection.onerror = function (event) {
        reject("获取所有数据出错: " + event.target.error);
      };
    });

    console.info("Connect files store done.");

    let lastVersion = "";
    setInterval(async () => {
      let data = localStorage.getItem("excalidraw");
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
        // 这里你可以使用游标或索引获取数据
        /**
         * @type {{
         *  created: Date;
         *  dataURL: string;
         *  id: string;
         *  lastRetrieved: number;
         *  mimeType: string;
         * }[]}
         */
        const files = await new Promise((resolve, reject) => {
          const transaction = filesStoreConnection.transaction(
            ["files-store"],
            "readonly",
          );
          const objectStore = transaction.objectStore("files-store");
          const request = objectStore.getAll();
          request.onsuccess = function (event) {
            resolve(event.target.result);
          };
          request.onerror = function (event) {
            reject("获取所有数据出错: " + event.target.error);
          };
        });

        const usedFiles = files.filter((file) => {
          if (elements.find((e) => e.fileId === file.id)) {
            return true;
          }
          return false;
        });
        sendMessage({
          event: "onStateChanged",
          data: {
            state,
            data: {
              dataString: JSON.stringify({
                elements,
                files: usedFiles.reduce((pre, cur) => {
                  return {
                    ...pre,
                    [cur.id]: cur,
                  };
                }, {}),
              }),
              elements,
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
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      // console.log(mutation);
      if (mutation.type === "childList") {
        // mutation.addedNodes.forEach((node) => {
        //   if (
        //     node.classList.contains("dropdown-menu-button") ||
        //     node.classList.contains("welcome-screen-decor-hint--menu")
        //   ) {
        //     node.style.display = "none";
        //   }

        //   if (node.classList.contains("welcome-screen-center")) {
        //     node.querySelector(".welcome-screen-menu").style.display = "none";
        //   }
        // });

        // if (
        //   mutation.nextSibling &&
        //   mutation.nextSibling.classList.contains(
        //     "layer-ui__wrapper__footer-right",
        //   )
        // ) {
        //   mutation.nextSibling.style.display = "none";
        // }

        // // top right
        // if (
        //   mutation.target.classList.contains("layer-ui__wrapper__top-right")
        // ) {
        //   mutation.target.style.display = "none";
        // }
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
  setTimeout(() => {
    watchExcalidrawState();
  }, 2000);
  hideEls();
};

const toggleToolbarAction = (key) => {
  const eventInfo = {};
  for (let i = 0; i <= 9; i++) {
    const key = i.toString();
    const keyCode = 48 + i; // '0' 对应的 keyCode 是 48，依次类推
    eventInfo[i] = {
      key,
      code: `Digit${key}`,
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode,
      which: keyCode,
    };
  }
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i); // 'A' 对应的 ASCII 码是 65，依次类推
    const keyCode = 65 + i; // 'A' 对应的 keyCode 是 65，依次类推
    eventInfo[letter] = {
      key: letter,
      code: `Key${letter}`,
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode,
      which: keyCode,
    };
  }
  if (eventInfo[key]) {
    document.dispatchEvent(new KeyboardEvent("keydown", eventInfo[key]));
  }
};

const exportElementsToBlob = async (id, elements) => {
  const blob = await exportToBlob({ elements, files: null, type: "png" });

  const reader = new FileReader();
  reader.onloadend = function () {
    sendMessage({
      event: "getElementsBlob",
      data: {
        id,
        blobData: reader.result.split(",")[1], // 移除前缀 "data:*/*;base64,"
      },
    });
  };
  reader.readAsDataURL(blob);
};

const exportElementsToSvg = async (id, elements) => {
  const svg = await exportToSvg({ elements, files: null });
  // 创建一个新的 XMLSerializer 实例
  const serializer = new XMLSerializer();
  // 将 SVG 元素序列化为字符串
  const svgString = serializer.serializeToString(svg);
  sendMessage({
    event: "getElementsSVG",
    data: {
      id,
      svg: svgString,
    },
  });
};

window.addEventListener("DOMContentLoaded", onload);

document.addEventListener(
  "focus",
  (event) => {
    console.log(event);
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
    console.log(event);
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
  loadFile,
  saveFile,

  toggleColorTheme,
  exportImage,
  getIsDark,

  toggleToolbarAction,

  didSetActiveTool,

  exportElementsToBlob,
  exportElementsToSvg,
};
