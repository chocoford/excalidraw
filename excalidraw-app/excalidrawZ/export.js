import { sendMessage } from "./message";
import { exportToBlob, exportToSvg } from "../../packages/utils/src";
import { getRelativeFiles } from "./indexdb+";

/**
 * Export elements to blob(png).
 * @param {string} id The id used to map message from ExcalidrawZ.
 * @param {any[]} elements Excalidraw elements.
 * @param {{[id: string]: any} | undefined} files Excalidraw files.
 * @param {boolean} exportEmbedScene
 * @param {boolean} withBackground
 */
export const exportElementsToBlob = async (
  id,
  elements,
  files,
  exportEmbedScene = false,
  withBackground = true,
  exportWithDarkMode = false,
) => {
  const blob = await exportToBlob({
    elements,
    files: files || (await getRelativeFiles(elements)),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
      exportWithDarkMode,
    },
  });

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

export const exportElementsToSvg = async (
  id,
  elements,
  files,
  exportEmbedScene = false,
  withBackground = true,
  exportWithDarkMode = false,
) => {
  const svg = await exportToSvg({
    elements,
    files: files || (await getRelativeFiles(elements)),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
      exportWithDarkMode,
    },
  });
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
