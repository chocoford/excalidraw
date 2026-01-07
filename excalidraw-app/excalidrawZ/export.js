import { exportToBlob, exportToSvg } from "../../packages/utils/src";

import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

/**
 * Export elements to blob (PNG, JXL, etc.).
 * @param {string} id The id used to map message from ExcalidrawZ.
 * @param {any[]} elements Excalidraw elements.
 * @param {{[id: string]: any} | undefined} files Excalidraw files.
 * @param {object} options Export options
 * @param {boolean} options.exportEmbedScene Whether to embed scene data
 * @param {boolean} options.withBackground Whether to export with background
 * @param {boolean} options.exportWithDarkMode Whether to export in dark mode
 * @param {string} options.mimeType MIME type (e.g., "image/png", "image/jxl")
 * @param {number} options.quality Quality 0-100 (for JXL, JPEG, etc.)
 */
export const exportElementsToBlob = async (
  id,
  elements,
  files,
  options = {},
) => {
  const {
    exportEmbedScene = false,
    withBackground = true,
    exportWithDarkMode = false,
    mimeType,
    quality,
  } = options;

  const blob = await exportToBlob({
    elements,
    files: files || (await getRelativeFiles(elements)),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
      exportWithDarkMode,
    },
    mimeType,
    quality,
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
