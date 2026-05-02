import { exportToBlob, exportToSvg } from "../../packages/utils/src";

import { sendMessage } from "./message";
import { getRelativeFiles } from "./indexdb+";

/**
 * Get the current canvas background color from the live appState, so that
 * exports honor what the user sees in the editor (rather than defaulting
 * to white).
 */
const getLiveViewBackgroundColor = () => {
  return window.excalidrawZHelper?._api?.getAppState?.()?.viewBackgroundColor;
};

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
 * @param {number} options.exportScale Pixel density multiplier (1, 2, 3, ...). Default 1.
 * @param {string} options.viewBackgroundColor Override background color. Defaults to the live editor's canvas color.
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
    exportScale = 1,
    viewBackgroundColor = getLiveViewBackgroundColor(),
  } = options;

  // WebKit canvas limits — exceeding these makes canvas.toBlob() return null
  // ("couldn't export to blob" error). macOS Safari is more lenient than iOS.
  // We use a conservative limit that works on both.
  const MAX_CANVAS_DIMENSION = 16384; // single-axis hard limit
  const MAX_CANVAS_AREA = 256 * 1024 * 1024; // 256M pixels (~16384²)

  let actualScale = exportScale;
  let scaleClamped = false;

  try {
    const blob = await exportToBlob({
      elements,
      files: files || (await getRelativeFiles(elements)),
      appState: {
        exportEmbedScene,
        exportBackground: withBackground,
        exportWithDarkMode,
        exportScale: actualScale,
        viewBackgroundColor,
      },
      mimeType,
      quality,
      // exportToCanvas only honors appState.exportScale when maxWidthOrHeight
      // is set, so we explicitly provide getDimensions to apply the scale
      // multiplier to the canvas size — and pre-flight clamp it if the
      // resulting canvas would exceed WebKit's limits.
      getDimensions: (width, height) => {
        const targetW = width * exportScale;
        const targetH = height * exportScale;
        const targetArea = targetW * targetH;

        const dimRatio = Math.min(
          MAX_CANVAS_DIMENSION / targetW,
          MAX_CANVAS_DIMENSION / targetH,
          1,
        );
        const areaRatio =
          targetArea > MAX_CANVAS_AREA
            ? Math.sqrt(MAX_CANVAS_AREA / targetArea)
            : 1;
        const safetyRatio = Math.min(dimRatio, areaRatio);

        if (safetyRatio < 1) {
          actualScale = exportScale * safetyRatio;
          scaleClamped = true;
          console.warn(
            `[export] requested ${exportScale}x would produce ` +
              `${Math.round(targetW)}×${Math.round(targetH)} canvas; ` +
              `clamped to ${actualScale.toFixed(2)}x to fit browser limits`,
          );
        }

        return {
          width: width * actualScale,
          height: height * actualScale,
          scale: actualScale,
        };
      },
    });

    const reader = new FileReader();
    reader.onloadend = function () {
      sendMessage({
        event: "getElementsBlob",
        data: {
          id,
          blobData: reader.result.split(",")[1], // 移除前缀 "data:*/*;base64,"
          actualScale,
          scaleClamped,
        },
      });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error("[export] failed", error);
    sendMessage({
      event: "getElementsBlob",
      data: {
        id,
        error: error?.message || String(error),
        requestedScale: exportScale,
      },
    });
  }
};

export const exportElementsToSvg = async (
  id,
  elements,
  files,
  exportEmbedScene = false,
  withBackground = true,
  exportWithDarkMode = false,
  exportScale = 1,
  viewBackgroundColor = getLiveViewBackgroundColor(),
) => {
  const svg = await exportToSvg({
    elements,
    files: files || (await getRelativeFiles(elements)),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
      exportWithDarkMode,
      exportScale,
      viewBackgroundColor,
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
