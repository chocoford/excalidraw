import rough from "roughjs/bin/rough";

import { THEME, arrayToMap, toBrandedType } from "../../packages/common/src";
import {
  getElementAbsoluteCoords,
  getInitializedImageElements,
  updateImageCache,
} from "../../packages/element/src";
import { renderStaticScene } from "../../packages/excalidraw/renderer/staticScene";
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

const clampCanvasScale = (width, height, requestedScale) => {
  const safeRequestedScale =
    Number.isFinite(Number(requestedScale)) && Number(requestedScale) > 0
      ? Number(requestedScale)
      : 1;
  const targetW = width * safeRequestedScale;
  const targetH = height * safeRequestedScale;
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

  return {
    actualScale: safeRequestedScale * safetyRatio,
    scaleClamped: safetyRatio < 1,
    requestedWidth: targetW,
    requestedHeight: targetH,
  };
};

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed. The canvas may be too large."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });

const getViewportExportBounds = ({
  width,
  height,
  scrollX,
  scrollY,
  zoom,
  marginPx,
}) => {
  const margin = marginPx / zoom;
  return {
    minX: -scrollX - margin,
    minY: -scrollY - margin,
    maxX: width / zoom - scrollX + margin,
    maxY: height / zoom - scrollY + margin,
  };
};

const elementOverlapsBounds = (element, elementsMap, bounds) => {
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(
    element,
    elementsMap,
    true,
  );
  return (
    x2 >= bounds.minX &&
    x1 <= bounds.maxX &&
    y2 >= bounds.minY &&
    y1 <= bounds.maxY
  );
};

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
    exportingFrame = null,
  } = options;

  let actualScale = exportScale;
  let scaleClamped = false;

  try {
    const blob = await exportToBlob({
      elements: elements.filter(
        (element) => !element.isDeleted && element.id !== exportingFrame?.id,
      ),
      exportingFrame,
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
        const scale = clampCanvasScale(width, height, exportScale);
        actualScale = scale.actualScale;
        scaleClamped = scale.scaleClamped;

        if (scaleClamped) {
          console.warn(
            `[export] requested ${exportScale}x would produce ` +
              `${Math.round(scale.requestedWidth)}×${Math.round(
                scale.requestedHeight,
              )} canvas; ` +
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
 * Export the current camera viewport as a clean rendered image.
 * Pass `{ elements, appState, files }` to render a snapshot without mutating
 * the live scene. Omit the argument to export the current live scene.
 * Export settings are intentionally fixed: background enabled, current/snapshot
 * theme, PNG output, and 1x scale.
 *
 * @param {{
 *   elements?: ExcalidrawElement[],
 *   appState?: AppState,
 *   files?: BinaryFiles,
 * }} [source]
 * @returns {Promise<{
 *   blobData: string,
 *   width: number,
 *   height: number,
 *   actualScale: number,
 *   scaleClamped: boolean,
 *   elementCount: number,
 *   fileCount: number,
 * }>}
 */
export const exportViewportToBlob = async (source = {}) => {
  source = source || {};
  const api = window.excalidrawZHelper?._api;
  const hasSourceElements = Array.isArray(source.elements);
  const hasSourceAppState =
    source.appState && typeof source.appState === "object";

  if ((!hasSourceElements || !hasSourceAppState) && !api) {
    throw new Error("exportViewportToBlob: excalidrawAPI not ready");
  }

  const liveAppState = api?.getAppState?.() || {};
  const appState = hasSourceAppState
    ? { ...liveAppState, ...source.appState }
    : liveAppState;
  const exportScale = 1;
  const mimeType = "image/png";
  const viewBackgroundColor =
    appState.viewBackgroundColor ?? getLiveViewBackgroundColor() ?? "#ffffff";
  const exportTheme = appState.theme === THEME.DARK ? THEME.DARK : THEME.LIGHT;
  const elements = hasSourceElements
    ? source.elements
    : (api.getSceneElementsIncludingDeleted?.() ??
      api.getSceneElements?.() ??
      []);
  const allElements = elements.filter((element) => !element.isDeleted);
  const allElementsMap = arrayToMap(allElements);
  const zoomValue = Number(appState.zoom?.value ?? 1);
  const zoom =
    Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 1;
  const width = Math.max(1, Math.floor(appState.width ?? 1));
  const height = Math.max(1, Math.floor(appState.height ?? 1));
  const scrollX = appState.scrollX ?? 0;
  const scrollY = appState.scrollY ?? 0;
  const bounds = getViewportExportBounds({
    width,
    height,
    scrollX,
    scrollY,
    zoom,
    marginPx: 0,
  });
  const visibleElements = allElements.filter((element) =>
    elementOverlapsBounds(element, allElementsMap, bounds),
  );
  const files = source.files ?? (await getRelativeFiles(visibleElements));
  const { imageCache } = await updateImageCache({
    imageCache: new Map(),
    fileIds: getInitializedImageElements(visibleElements).map(
      (element) => element.fileId,
    ),
    files,
  });
  const scale = clampCanvasScale(width, height, exportScale);
  const actualScale = scale.actualScale;
  const scaleClamped = scale.scaleClamped;

  if (scaleClamped) {
    console.warn(
      `[exportViewport] requested ${exportScale}x would produce ` +
        `${Math.round(scale.requestedWidth)}×${Math.round(
          scale.requestedHeight,
        )} canvas; ` +
        `clamped to ${actualScale.toFixed(2)}x to fit browser limits`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * actualScale));
  canvas.height = Math.max(1, Math.ceil(height * actualScale));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  renderStaticScene({
    canvas,
    rc: rough.canvas(canvas),
    elementsMap: toBrandedType(allElementsMap),
    allElementsMap: toBrandedType(allElementsMap),
    visibleElements,
    scale: actualScale,
    appState: {
      ...appState,
      width,
      height,
      scrollX,
      scrollY,
      zoom: { ...appState.zoom, value: zoom },
      theme: exportTheme,
      viewBackgroundColor,
      exportScale: actualScale,
      exportBackground: true,
      exportWithDarkMode: exportTheme === THEME.DARK,
      selectedElementIds: {},
      hoveredElementIds: {},
      frameToHighlight: null,
      editingGroupId: null,
      croppingElementId: null,
      suggestedBinding: null,
      selectedElementsAreBeingDragged: false,
      openDialog: null,
      shouldCacheIgnoreZoom: false,
    },
    renderConfig: {
      canvasBackgroundColor: viewBackgroundColor,
      imageCache,
      renderGrid: false,
      isExporting: true,
      embedsValidationStatus: new Map(),
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
      theme: exportTheme,
    },
  });

  const blob = await canvasToBlob(canvas, mimeType);
  const blobData = await blobToBase64(blob);
  return {
    blobData,
    width,
    height,
    actualScale,
    scaleClamped,
    elementCount: visibleElements.length,
    fileCount: Object.keys(files).length,
    mimeType: blob.type || mimeType,
  };
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
