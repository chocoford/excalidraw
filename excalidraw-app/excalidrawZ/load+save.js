import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

/**
 *
 * @param {number[]} buffer
 * @param {string} fileId - Optional file identifier to track if loading the same file
 */
export const loadFileBuffer = async (buffer, fileId) => {
  const uint8Array = new Uint8Array(buffer);
  const jsonString = new TextDecoder("utf-8").decode(uint8Array);
  const content = JSON.parse(jsonString);
  console.info("loadFileBuffer", buffer, jsonString, content);

  // Check if loading the same file to preserve viewport
  const isSameFile = fileId && window.excalidrawZHelper.currentFileId === fileId;

  if (isSameFile) {
    // Save current viewport position and merge into content
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

  // Update current file ID
  window.excalidrawZHelper.currentFileId = fileId;

  const files = await getRelativeFiles(content.elements);
  content.files = { ...content.files, ...files };
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  // 使用 Blob 创建 File 对象
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });
  await loadFile(file);
};

/**
 *
 * @param {string} dataString
 */
export const loadFileString = async (dataString) => {
  const content = JSON.parse(dataString);
  const files = await getRelativeFiles(content.elements);
  content.files = { ...content.files, ...files };
  console.info("loadFileString", content);
  // 创建一个 Blob 对象，并指定类型为 JSON 格式
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  // 使用 Blob 创建 File 对象
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });
  await loadFile(file);
};

/**
 * @param {File} file
 */
export const loadFile = async (file) => {
  // Use native DataTransfer API for better compatibility
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const fakeDropEvent = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
  });

  // Set dataTransfer using defineProperty for better compatibility
  Object.defineProperty(fakeDropEvent, "dataTransfer", {
    value: dataTransfer,
  });

  const node = document.querySelector(".excalidraw-container");
  if (node) {
    node.dispatchEvent(fakeDropEvent);
  } else {
    console.warn("未找到 .excalidraw-container 元素");
  }
};

export const loadImageBuffer = async (buffer, type) => {
  // 将传入的普通数组转换成 Uint8Array
  const typedArray = new Uint8Array(buffer);
  // 使用 typedArray 创建 Blob 对象
  const blob = new Blob([typedArray], {
    type: `image/${type}`,
  });

  // 使用 Blob 创建 File 对象
  const file = new File([blob], `image.${type}`, {
    type: `image/${type}`,
  });

  // 调用 loadImage 来模拟图片的拖拽事件
  await loadImage(file);
};
/**
 * @param {File} image
 */
export const loadImage = async (image) => {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(image);

  const node = document.querySelector(".excalidraw-container");
  const { x: clientX, y: clientY } = (() => {
    if (node) {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
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

  if (node) {
    node.dispatchEvent(fakeDropEvent);
  } else {
    console.warn("未找到 .excalidraw-container 元素");
  }
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
