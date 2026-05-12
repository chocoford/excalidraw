import { arrayToMap, TEXT_ALIGN, VERTICAL_ALIGN } from "@excalidraw/common";
import {
  Scene,
  calculateFixedPointForElbowArrowBinding,
  elementCenterPoint,
  newArrowElement,
  newTextElement,
  redrawTextBoundingBox,
} from "@excalidraw/element";

import { CaptureUpdate } from "./elements";

const getAPI = () => window.excalidrawZHelper?._api;

const normalizeLabel = (label) =>
  typeof label === "string" ? { text: label } : label;

/**
 * Connect two existing scene elements with a freshly-created arrow.
 *
 * Counterpart to skeleton's `start.id` / `end.id` for the case where both
 * endpoints are already in the scene (skeleton only resolves ids within its
 * own batch).
 *
 * Bindings are bidirectional: the arrow's `startBinding` / `endBinding`
 * reference the targets, and each target's `boundElements` array gets the
 * arrow appended — so when the user later drags either shape, the arrow
 * follows.
 *
 * Geometry: the arrow is created center-to-center between `from` and `to`,
 * with `fixedPoint: [0.5, 0.5]` and `mode: "orbit"` by default for straight
 * arrows. For elbow arrows, fixed points are calculated by Excalidraw's own
 * snap-to-outline algorithm. In either case, the visible endpoints snap to
 * the targets' edges at render time — no edge math needed on the caller.
 *
 * Label support: pass `arrow.label` (string or object) to add a centered
 * bound text element to the arrow. A temporary Scene is used internally to
 * run Excalidraw's text-resize logic — same trick the upstream
 * `convertToExcalidrawElements` uses.
 *
 * @param {{
 *   from: string,
 *   to: string,
 *   arrow?: {
 *     strokeColor?: string,
 *     strokeWidth?: number,
 *     strokeStyle?: "solid" | "dashed" | "dotted",
 *     roughness?: number,
 *     opacity?: number,
 *     startArrowhead?: string | null,
 *     endArrowhead?: string | null,
 *     elbowed?: boolean,
 *     label?: string | {
 *       text: string,
 *       fontSize?: number,
 *       fontFamily?: number,
 *       strokeColor?: string,
 *     },
 *     fixedPoint?: {
 *       start?: [number, number],
 *       end?: [number, number],
 *     },
 *     mode?: "inside" | "orbit" | "skip",
 *   },
 *   captureUpdate?: keyof typeof CaptureUpdate,
 * }} params
 *
 * @returns {{ arrowId: string, labelId?: string }}
 *
 * @throws if the editor isn't ready, or either `from` / `to` is missing /
 *   deleted in the scene.
 */
export const connectElements = ({
  from,
  to,
  arrow: arrowOpts = {},
  captureUpdate = CaptureUpdate.IMMEDIATELY,
}) => {
  const api = getAPI();
  if (!api) {
    throw new Error("connectElements: excalidrawAPI not ready");
  }
  if (!from || !to) {
    throw new Error("connectElements: both `from` and `to` ids are required");
  }

  const current = api.getSceneElementsIncludingDeleted();
  const sceneMap = new Map(current.map((el) => [el.id, el]));

  const fromEl = sceneMap.get(from);
  const toEl = sceneMap.get(to);

  if (!fromEl || fromEl.isDeleted) {
    throw new Error(`connectElements: from element "${from}" not in scene`);
  }
  if (!toEl || toEl.isDeleted) {
    throw new Error(`connectElements: to element "${to}" not in scene`);
  }

  const liveElementsMap = arrayToMap(current.filter((el) => !el.isDeleted));
  const [fromCx, fromCy] = elementCenterPoint(fromEl, liveElementsMap);
  const [toCx, toCy] = elementCenterPoint(toEl, liveElementsMap);

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  const {
    strokeColor,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    startArrowhead = null,
    endArrowhead = "arrow",
    elbowed = false,
    label,
    fixedPoint = {},
    mode = "orbit",
  } = arrowOpts;

  const arrow = newArrowElement({
    type: "arrow",
    x: fromCx,
    y: fromCy,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ],
    startArrowhead,
    endArrowhead,
    elbowed,
    ...(strokeColor !== undefined && { strokeColor }),
    ...(strokeWidth !== undefined && { strokeWidth }),
    ...(strokeStyle !== undefined && { strokeStyle }),
    ...(roughness !== undefined && { roughness }),
    ...(opacity !== undefined && { opacity }),
  });

  // Compute fixed points. For elbow arrows, the upstream calculator picks
  // a snap-to-outline point that yields a clean orthogonal path; for
  // straight arrows, center [0.5, 0.5] + orbit mode renders edge-to-edge.
  let startFixedPoint = fixedPoint.start;
  let endFixedPoint = fixedPoint.end;

  if (elbowed) {
    const bindingMap = arrayToMap([fromEl, toEl, arrow]);
    if (!startFixedPoint) {
      ({ fixedPoint: startFixedPoint } =
        calculateFixedPointForElbowArrowBinding(
          arrow,
          fromEl,
          "start",
          bindingMap,
        ));
    }
    if (!endFixedPoint) {
      ({ fixedPoint: endFixedPoint } =
        calculateFixedPointForElbowArrowBinding(
          arrow,
          toEl,
          "end",
          bindingMap,
        ));
    }
  } else {
    startFixedPoint = startFixedPoint || [0.5, 0.5];
    endFixedPoint = endFixedPoint || [0.5, 0.5];
  }

  arrow.startBinding = {
    elementId: fromEl.id,
    fixedPoint: startFixedPoint,
    mode,
  };
  arrow.endBinding = {
    elementId: toEl.id,
    fixedPoint: endFixedPoint,
    mode,
  };

  // Optional label. We replicate the trick `convertToExcalidrawElements`
  // uses: create a text element, link it via containerId/boundElements,
  // then run redrawTextBoundingBox through a throwaway Scene so wrapping
  // and positioning use the real upstream code path.
  let labelEl = null;
  if (label !== undefined && label !== null) {
    const {
      text,
      fontSize,
      fontFamily,
      strokeColor: labelStrokeColor,
    } = normalizeLabel(label);

    labelEl = newTextElement({
      x: 0,
      y: 0,
      text,
      textAlign: TEXT_ALIGN.CENTER,
      verticalAlign: VERTICAL_ALIGN.MIDDLE,
      containerId: arrow.id,
      strokeColor: labelStrokeColor || arrow.strokeColor,
      ...(fontSize !== undefined && { fontSize }),
      ...(fontFamily !== undefined && { fontFamily }),
    });

    arrow.boundElements = [
      ...(arrow.boundElements || []),
      { id: labelEl.id, type: "text" },
    ];

    const tempScene = new Scene(arrayToMap([fromEl, toEl, arrow, labelEl]));
    redrawTextBoundingBox(labelEl, arrow, tempScene);
  }

  // Reverse-link the arrow into each target's boundElements list. Self-loop
  // (from === to) merges into a single update on the same element.
  const fromUpdated = {
    ...fromEl,
    boundElements: [
      ...(fromEl.boundElements || []),
      { id: arrow.id, type: "arrow" },
    ],
  };
  const toUpdated =
    toEl.id === fromEl.id
      ? {
          ...fromUpdated,
          boundElements: [
            ...(fromUpdated.boundElements || []),
            { id: arrow.id, type: "arrow" },
          ],
        }
      : {
          ...toEl,
          boundElements: [
            ...(toEl.boundElements || []),
            { id: arrow.id, type: "arrow" },
          ],
        };

  const next = current.map((el) => {
    if (el.id === fromEl.id) {
      return toEl.id === fromEl.id ? toUpdated : fromUpdated;
    }
    if (el.id === toEl.id) {
      return toUpdated;
    }
    return el;
  });

  const additions = labelEl ? [arrow, labelEl] : [arrow];
  api.updateScene({
    elements: [...next, ...additions],
    captureUpdate,
  });

  return labelEl
    ? { arrowId: arrow.id, labelId: labelEl.id }
    : { arrowId: arrow.id };
};
