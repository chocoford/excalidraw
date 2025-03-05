import { sendMessage } from "./message";
import { exportToBlob, exportToSvg } from "../../packages/utils/export";
import { getRelativeFiles } from "./indexdb+";

/**
 * Export elements to blob(png).
 * @param {string} id The id used to map message from ExcalidrawZ.
 * @param {any[]} elements Excalidraw elements.
 * @param {boolean} exportEmbedScene
 * @param {boolean} withBackground
 */
export const exportElementsToBlob = async (
  id,
  elements,
  exportEmbedScene = false,
  withBackground = true,
) => {
  const blob = await exportToBlob({
    elements,
    files: await getRelativeFiles(elements),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
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
  exportEmbedScene = false,
  withBackground = true,
) => {
  const svg = await exportToSvg({
    elements,
    files: await getRelativeFiles(elements),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
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
