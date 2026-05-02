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
 * Convert a Blob to its base64 representation (without the
 * `data:<mime>;base64,` prefix). Wrapped in a Promise so the export
 * function can `await` it.
 */
const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// WebKit canvas limits — exceeding these makes canvas.toBlob() return null.
// macOS Safari is more lenient than iOS; conservative values that work on both.
const MAX_CANVAS_DIMENSION = 16384; // single-axis hard limit
const MAX_CANVAS_AREA = 256 * 1024 * 1024; // 256M pixels (~16384²)

/**
 * Export elements to a blob (PNG, JXL, JPEG, etc.).
 *
 * Returns a Promise resolving with the export result. Also emits the
 * `getElementsBlob` event for backward compatibility with hosts that
 * still use the id-based callback pattern via `evaluateJavaScript`.
 *
 * Hosts using `callAsyncJavaScript` should `await` the return value
 * directly and pass `null` for `id` (or any value, it's ignored on the
 * Promise side).
 *
 * @param {string|null} id  Legacy request id for the event-based path.
 *                          Pass null/undefined when awaiting the Promise.
 * @param {any[]} elements
 * @param {{[id: string]: any} | undefined} files
 * @param {{
 *   exportEmbedScene?: boolean,
 *   withBackground?: boolean,
 *   exportWithDarkMode?: boolean,
 *   mimeType?: string,
 *   quality?: number,
 *   exportScale?: number,
 *   viewBackgroundColor?: string,
 * }} options
 * @returns {Promise<{ blobData: string, actualScale: number, scaleClamped: boolean }>}
 * @throws on export failure
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
      // multiplier — and pre-flight clamp it if the canvas would exceed
      // WebKit's limits.
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

    const blobData = await blobToBase64(blob);
    const result = { blobData, actualScale, scaleClamped };

    // Backward compat: also notify via event (legacy id-based path)
    sendMessage({
      event: "getElementsBlob",
      data: { id, ...result },
    });

    return result;
  } catch (error) {
    console.error("[export] failed", error);
    const errMessage = error?.message || String(error);

    // Backward compat: notify legacy listeners of the failure
    sendMessage({
      event: "getElementsBlob",
      data: {
        id,
        error: errMessage,
        requestedScale: exportScale,
      },
    });

    // Re-throw so callAsyncJavaScript callers see the rejection
    throw error;
  }
};

/**
 * Export elements to an SVG string.
 *
 * Returns a Promise resolving with the SVG string. Also emits the
 * `getElementsSVG` event for backward compat.
 *
 * @param {string|null} id  Legacy request id (ignored when awaiting).
 * @param {any[]} elements
 * @param {{[id: string]: any} | undefined} files
 * @param {boolean} [exportEmbedScene]
 * @param {boolean} [withBackground]
 * @param {boolean} [exportWithDarkMode]
 * @param {number} [exportScale]
 * @param {string} [viewBackgroundColor]
 * @returns {Promise<{ svg: string }>}
 * @throws on export failure
 */
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
  try {
    const svgEl = await exportToSvg({
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
    const svg = new XMLSerializer().serializeToString(svgEl);
    const result = { svg };

    sendMessage({
      event: "getElementsSVG",
      data: { id, ...result },
    });

    return result;
  } catch (error) {
    console.error("[export] failed", error);
    const errMessage = error?.message || String(error);

    sendMessage({
      event: "getElementsSVG",
      data: { id, error: errMessage },
    });

    throw error;
  }
};
