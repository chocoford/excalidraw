import { exportToBlob, exportToSvg } from "../../packages/utils/src";

import { getRelativeFiles } from "./indexdb+";
import { sendMessage } from "./message";

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
 * Two call styles supported (host backwards compat):
 *   - **New**: `await exportElementsToBlob(elements, files, options)` → Promise
 *   - **Old**: `exportElementsToBlob(id, elements, files, options)` → fires a
 *     `getElementsBlob` sendMessage event with `{ id, blobData,
 *     actualScale, scaleClamped }` (or `{ id, error, requestedScale }`).
 *     The old form still also returns a Promise — they're additive.
 *
 * Style is detected by the type of the first argument (string == old).
 *
 * @returns {Promise<{ blobData: string, actualScale: number, scaleClamped: boolean }>}
 * @throws on export failure
 */
export const exportElementsToBlob = async (...args) => {
  const oldStyle = typeof args[0] === "string";
  const id = oldStyle ? args[0] : undefined;
  const elements = oldStyle ? args[1] : args[0];
  const files = oldStyle ? args[2] : args[1];
  const options = (oldStyle ? args[3] : args[2]) || {};

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
      elements: elements.filter((el) => !el.isDeleted),
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

    if (id !== undefined) {
      sendMessage({ event: "getElementsBlob", data: { id, ...result } });
    }
    return result;
  } catch (error) {
    if (id !== undefined) {
      sendMessage({
        event: "getElementsBlob",
        data: {
          id,
          error: error?.message || String(error),
          requestedScale: exportScale,
        },
      });
    }
    throw error;
  }
};

/**
 * Export elements to an SVG string.
 *
 * Two call styles (host backwards compat):
 *   - **New**: `await exportElementsToSvg(elements, files, embed?, bg?, dark?, scale?, color?)` → Promise
 *   - **Old**: `exportElementsToSvg(id, elements, files, embed?, bg?, dark?, scale?, color?)` →
 *     fires `getElementsSVG` event with `{ id, svg }`. Still returns Promise.
 *
 * Style detected by first arg type (string == old).
 *
 * @returns {Promise<{ svg: string }>}
 * @throws on export failure
 */
export const exportElementsToSvg = async (...args) => {
  const oldStyle = typeof args[0] === "string";
  const id = oldStyle ? args[0] : undefined;
  const offset = oldStyle ? 1 : 0;
  const elements = args[offset];
  const files = args[offset + 1];
  const exportEmbedScene = args[offset + 2] ?? false;
  const withBackground = args[offset + 3] ?? true;
  const exportWithDarkMode = args[offset + 4] ?? false;
  const exportScale = args[offset + 5] ?? 1;
  const viewBackgroundColor = args[offset + 6] ?? getLiveViewBackgroundColor();

  const visibleElements = elements.filter((el) => !el.isDeleted);
  const svgEl = await exportToSvg({
    elements: visibleElements,
    files: files || (await getRelativeFiles(visibleElements)),
    appState: {
      exportEmbedScene,
      exportBackground: withBackground,
      exportWithDarkMode,
      exportScale,
      viewBackgroundColor,
    },
  });
  const svg = new XMLSerializer().serializeToString(svgEl);

  if (id !== undefined) {
    sendMessage({ event: "getElementsSVG", data: { id, svg } });
  }
  return { svg };
};
