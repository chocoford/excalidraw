import {
  Scene,
  getCommonBounds,
  updateBoundElements,
} from "@excalidraw/element";

import { CaptureUpdate, addElements } from "./elements";
import { focusElements } from "./camera";

const AUTO_PLACEMENT_GAP = 60;
const FOCUS_DEFAULTS = {
  mode: "fitViewport",
  animate: true,
  duration: 300,
  viewportZoomFactor: 0.7,
};

const getAPI = () => window.excalidrawZHelper?._api;

const getViewportCenterScene = (api) => {
  const { width, height, scrollX, scrollY, zoom } = api.getAppState();
  return {
    x: width / 2 / zoom.value - scrollX,
    y: height / 2 / zoom.value - scrollY,
  };
};

/**
 * Snap newly-created bound arrows to the outlines of their bound shapes.
 *
 * Why this is needed: skeleton- or creator-built arrows ship with their
 * `points` set center-to-center (or wherever the caller put them). The
 * orbit-mode snap-to-outline logic that makes arrows visually start/end on
 * shape edges lives in `updateBoundElements`, which only runs reactively
 * when a bound shape is moved. On a fresh insert nothing has "moved" yet,
 * so the arrow renders with the raw stored points — visible line cutting
 * straight through the shape interior. (This is why a tiny manual drag
 * "fixed" arrows before this preprocessor existed.)
 *
 * Fix: build a temporary Scene containing existing scene elements plus the
 * new batch, then call `updateBoundElements` on every new shape that has
 * bound arrows. Excalidraw mutates each arrow's `points` in place to the
 * proper outline-intersection values. Existing scene elements are only
 * read (used to resolve cross-batch bound endpoints) — never mutated.
 */
const refreshBoundArrowPoints = (api, elementsToInsert) => {
  const shapesWithArrows = elementsToInsert.filter((el) =>
    el.boundElements?.some((b) => b.type === "arrow"),
  );
  if (shapesWithArrows.length === 0) {
    return;
  }

  const sceneElements = api.getSceneElementsIncludingDeleted();
  const tempScene = new Scene([...sceneElements, ...elementsToInsert]);

  for (const shape of shapesWithArrows) {
    updateBoundElements(shape, tempScene);
  }
};

/**
 * Resolve a `position` spec into a concrete bbox top-left in scene coords.
 * Returns null when no positioning is requested — caller should leave the
 * elements' existing coordinates untouched.
 */
const resolveTopLeft = (api, position, bounds) => {
  if (position === undefined || position === null) {
    return null;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;

  if (typeof position === "object") {
    const { x, y, anchor = "top-left" } = position;
    return anchor === "center" ? { x: x - w / 2, y: y - h / 2 } : { x, y };
  }

  const existing = api
    .getSceneElementsIncludingDeleted()
    .filter((el) => !el.isDeleted);

  if (position === "viewport-center") {
    const c = getViewportCenterScene(api);
    return { x: c.x - w / 2, y: c.y - h / 2 };
  }

  if (position === "scene-center") {
    if (existing.length === 0) {
      const c = getViewportCenterScene(api);
      return { x: c.x - w / 2, y: c.y - h / 2 };
    }
    const [sMinX, sMinY, sMaxX, sMaxY] = getCommonBounds(existing);
    return {
      x: (sMinX + sMaxX) / 2 - w / 2,
      y: (sMinY + sMaxY) / 2 - h / 2,
    };
  }

  // "auto" — to the right of existing content, viewport-center if empty
  if (existing.length === 0) {
    const c = getViewportCenterScene(api);
    return { x: c.x - w / 2, y: c.y - h / 2 };
  }
  const [, sMinY, sMaxX] = getCommonBounds(existing);
  return { x: sMaxX + AUTO_PLACEMENT_GAP, y: sMinY };
};

const normalizeFocusOptions = (focus) => {
  if (!focus) {
    return null;
  }
  if (typeof focus === "string") {
    return { mode: focus };
  }
  if (typeof focus === "object") {
    return focus;
  }
  return {};
};

/**
 * Insert pre-built elements into the scene, with optional repositioning,
 * file registration, and camera focus. One-shot API — pair with any of the
 * `creators.js` builders or `mermaidToElements` to go from spec → on-screen.
 *
 * @param {object[]} elements   ready-to-insert elements (e.g. from
 *   `createShape`, `createElements`, `mermaidToElements`, etc.).
 * @param {{
 *   position?:
 *     | { x: number, y: number, anchor?: "top-left" | "center" }
 *     | "auto"
 *     | "viewport-center"
 *     | "scene-center",
 *   focus?: boolean | "center" | "fitViewport" | "fitContent" | {
 *     mode?: "center" | "fitViewport" | "fitContent",
 *     animate?: boolean,
 *     duration?: number,
 *     viewportZoomFactor?: number,
 *   },
 *   files?: { [id: string]: object },
 *   captureUpdate?: keyof typeof CaptureUpdate,
 *   sanitize?: boolean,
 * }} [opts]
 *
 *   - `position` (default: leave coords as-is). When set, the batch is
 *     translated so its bbox lands at the resolved point.
 *       - `{ x, y, anchor }` — explicit; `anchor` defaults to `"top-left"`.
 *       - `"auto"` — to the right of existing scene content (60px gap), or
 *         viewport-center on an empty scene.
 *       - `"viewport-center"` / `"scene-center"` — centered respectively.
 *   - `focus` (default `false`): zoom-to-fit the inserted batch.
 *       - `true` — animated jump (300ms, viewportZoomFactor 0.7).
 *       - `"center"` or `{ mode: "center" }` — center the camera on the
 *         inserted batch while preserving the current zoom.
 *       - object — fine-tune `mode`, `animate`, `duration`,
 *         `viewportZoomFactor`, `minZoom`, `maxZoom`, `canvasOffsets`.
 *   - `files`: image binaries (keyed by fileId) to register via
 *     `excalidrawAPI.addFiles` before insertion. Required when the batch
 *     contains image elements not already in the editor's file store.
 *   - `captureUpdate` (default `IMMEDIATELY`): undo/redo capture mode.
 *   - `sanitize` (default `true`): forwarded to `addElements`; runs the
 *     elements through `restoreElements({ repairBindings: true })`.
 *
 * @returns {{
 *   elementIds: string[],
 *   insertedAt: { x: number, y: number },
 *   bounds: { x: number, y: number, width: number, height: number },
 * }}
 *   `insertedAt` is the bbox top-left in scene coords after positioning;
 *   `bounds` is the full scene-space rectangle of the inserted batch.
 *
 * @throws if excalidrawAPI is not ready.
 */
export const insertElements = (elements, opts = {}) => {
  const api = getAPI();
  if (!api) {
    throw new Error("insertElements: excalidrawAPI not ready");
  }
  if (!elements || elements.length === 0) {
    return {
      elementIds: [],
      insertedAt: { x: 0, y: 0 },
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  const {
    position,
    focus = false,
    files,
    captureUpdate = CaptureUpdate.IMMEDIATELY,
    sanitize = true,
  } = opts;

  const rawBounds = getCommonBounds(elements);
  // Defensive: an element with undefined coords leaks Infinity/NaN through
  // getCommonBounds; zero-out so we never return null after JSON. The
  // upstream pipeline should have caught this — this is just the last
  // line of defense so the host gets a valid response.
  const inputBounds = rawBounds.map((v) => (Number.isFinite(v) ? v : 0));
  const [iMinX, iMinY, iMaxX, iMaxY] = inputBounds;
  const targetTopLeft = resolveTopLeft(api, position, inputBounds);

  let positioned = elements;
  let finalTopLeft = { x: iMinX, y: iMinY };

  if (targetTopLeft) {
    const dx = targetTopLeft.x - iMinX;
    const dy = targetTopLeft.y - iMinY;
    if (dx !== 0 || dy !== 0) {
      positioned = elements.map((el) => ({
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      }));
    }
    finalTopLeft = targetTopLeft;
  }

  if (files && Object.keys(files).length > 0 && api.addFiles) {
    api.addFiles(Object.values(files));
  }

  // Snap bound arrows to shape outlines before the scene picks them up —
  // otherwise on first render they cut through shapes (orbit projection is
  // only computed reactively, not on insert).
  refreshBoundArrowPoints(api, positioned);

  addElements(positioned, { captureUpdate, sanitize });

  const elementIds = positioned.map((el) => el.id);

  if (focus) {
    const focusOpts = normalizeFocusOptions(focus);
    focusElements(elementIds, { ...FOCUS_DEFAULTS, ...focusOpts });
  }

  return {
    elementIds,
    insertedAt: finalTopLeft,
    bounds: {
      x: finalTopLeft.x,
      y: finalTopLeft.y,
      width: iMaxX - iMinX,
      height: iMaxY - iMinY,
    },
  };
};
