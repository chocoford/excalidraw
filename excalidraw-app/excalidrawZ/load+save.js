import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

/**
 *
 * @param {number[]} buffer
 */
export const loadFileBuffer = async (buffer) => {
  const uint8Array = new Uint8Array(buffer);
  const jsonString = new TextDecoder("utf-8").decode(uint8Array);
  const content = JSON.parse(jsonString);
  console.info("loadFileBuffer", buffer, jsonString, content);
  const files = await getRelativeFiles(content.elements);
  content.files = { ...content.files, ...files };
  const blob = new Blob([JSON.stringify(content)], {
    type: "application/vnd.excalidraw+json",
  });
  // 使用 Blob 创建 File 对象
  const file = new File([blob], "file.excalidraw", {
    type: "application/vnd.excalidraw+json",
  });
  await loadImage(file);
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
  function FakeDataTransfer(image) {
    this.dropEffect = "all";
    this.effectAllowed = "all";
    this.items = [{ getAsFileSystemHandle: async () => null }];
    this.types = ["Images"];
    this.getData = function () {
      return image;
    };
    // 构造一个类似 FileList 的对象
    this.files = {
      0: image,
      length: 1,
      item: () => image,
    };
  }
  const dataTransfer = new FakeDataTransfer(image);
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const fakeDropEvent = new DragEvent("drop", {
    bubbles: true,
    clientX: centerX,
    clientY: centerY,
  });
  fakeDropEvent.simulated = true;
  // 将 dataTransfer 对象挂载到事件上
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

export const saveFile = () => {
  const data = localStorage.getItem("excalidraw");
  try {
    // data = JSON.parse(data);
    sendMessage({
      event: "saveFileDone",
      data,
    });
  } catch {}
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
