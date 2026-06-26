import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  getFontString,
  getLineHeight,
} from "@excalidraw/common";
import {
  convertToExcalidrawElements,
  measureText,
  wrapText,
} from "@excalidraw/element";

import { insertElements } from "./placement";

/**
 * Toolkit for building Excalidraw elements from host-friendly specs.
 *
 * All creators return arrays of finished elements (containers + bound text
 * wired up, arrow bindings resolved, default dimensions filled, fresh IDs
 * assigned). They do NOT touch the scene — feed the result into
 * `excalidrawZHelper.addElements(...)` to insert.
 *
 * The lower-level `createElements(skeletons)` is the swiss-army knife: it
 * accepts Excalidraw's canonical skeleton format and supports anything the
 * convenience helpers can't express (mutual bindings inside one batch,
 * frames, polylines, complex linear elements, etc.).
 *
 * Note on `start`/`end` bindings for arrows: skeletons resolve `id`
 * references only against elements passed in the SAME call — they do not
 * look up existing scene elements. To connect an arrow to a shape that's
 * already in the scene, build both the shape skeleton (with a known `id`)
 * and the arrow in one `createElements` call.
 */

/**
 * Convert one or more skeleton specs to ready-to-insert Excalidraw elements.
 *
 * @param {object[]} skeletons
 * @param {{ regenerateIds?: boolean }} [opts]  default `regenerateIds: true`
 * @returns {object[]}
 */
export const createElements = (skeletons, opts = {}) => {
  const { regenerateIds = true } = opts;
  const elements = convertToExcalidrawElements(skeletons, { regenerateIds });
  return applyExplicitTextBoxDimensions(elements, skeletons);
};

const toPositiveFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * `convertToExcalidrawElements()` creates standalone text from measured text
 * metrics, so skeleton-level `width` is otherwise ignored. For ExcalidrawZ
 * skeletons we treat explicit text width as a fixed text box because callers
 * rely on it for centered titles and for stable emoji/CJK fallback rendering.
 */
const applyExplicitTextBoxDimensions = (elements, skeletons) => {
  const skeletonList = Array.isArray(skeletons) ? skeletons : [];

  return elements.map((element, index) => {
    const skeleton = skeletonList[index];
    if (element?.type !== "text" || skeleton?.type !== "text") {
      return element;
    }

    const width = toPositiveFiniteNumber(skeleton.width);
    const height = toPositiveFiniteNumber(skeleton.height);
    if (width === null && height === null) {
      return element;
    }

    const originalText = element.originalText ?? element.text ?? "";
    const nextWidth = width ?? element.width;
    const shouldAutoResize = skeleton.autoResize ?? (width === null);

    if (shouldAutoResize) {
      return {
        ...element,
        x: Number.isFinite(Number(skeleton.x)) ? Number(skeleton.x) : element.x,
        y: Number.isFinite(Number(skeleton.y)) ? Number(skeleton.y) : element.y,
        width: nextWidth,
        height: height ?? element.height,
      };
    }

    const wrappedText = wrapText(originalText, getFontString(element), nextWidth);
    const metrics = measureText(
      wrappedText,
      getFontString(element),
      element.lineHeight,
    );

    return {
      ...element,
      x: Number.isFinite(Number(skeleton.x)) ? Number(skeleton.x) : element.x,
      y: Number.isFinite(Number(skeleton.y)) ? Number(skeleton.y) : element.y,
      text: wrappedText,
      originalText,
      width: nextWidth,
      height: height ?? metrics.height,
      autoResize: false,
    };
  });
};

/**
 * Fallback dimension when a skeleton declares an id but no `width`/`height`
 * (e.g. shape with `label` — Excalidraw resizes it from text metrics at
 * render time, which we can't easily replay here). 100×100 puts the
 * approximated center close enough that fixedPoint stays in `[0, 1]`.
 */
const AUTO_POSITION_FALLBACK_DIMENSION = 100;

const BINDABLE_SKELETON_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "text",
  "frame",
  "magicframe",
]);

/**
 * Pre-process arrow skeletons that reference both endpoints by id without
 * supplying any geometry. For each such arrow, look up the source and
 * target shapes inside the same batch, then inject `x`, `y`, and `points`
 * so the arrow runs center-to-center.
 *
 * Why: `convertToExcalidrawElements` trusts whatever geometry you provide
 * and only reverse-engineers the binding's `fixedPoint` from those numbers.
 * Without `points`, every arrow defaults to a 100×0 horizontal stub —
 * which yields out-of-range `fixedPoint` and visibly mis-aimed arrows on
 * first render (they only "snap right" after the user nudges a bound
 * shape). Pre-resolving the geometry here makes the first render correct.
 *
 * Untouched if any of: the arrow already specifies `points`, `width`, or
 * `height`; either endpoint isn't an `{id}` reference; or the referenced
 * id can't be resolved against a same-batch bindable shape. For cross-call
 * "connect arrow to a shape already in the scene", use `connectElements`
 * instead — that path doesn't go through skeletons.
 */
const autoPositionArrows = (skeletons) => {
  const lookup = new Map();
  for (const skel of skeletons) {
    if (!skel.id || !BINDABLE_SKELETON_TYPES.has(skel.type)) {
      continue;
    }
    lookup.set(skel.id, {
      x: skel.x,
      y: skel.y,
      width: skel.width ?? AUTO_POSITION_FALLBACK_DIMENSION,
      height: skel.height ?? AUTO_POSITION_FALLBACK_DIMENSION,
    });
  }

  return skeletons.map((skel) => {
    if (skel.type !== "arrow") {
      return skel;
    }
    if (
      skel.points !== undefined ||
      skel.width !== undefined ||
      skel.height !== undefined
    ) {
      return skel;
    }
    if (!skel.start?.id || !skel.end?.id) {
      return skel;
    }

    const src = lookup.get(skel.start.id);
    const tgt = lookup.get(skel.end.id);
    if (!src || !tgt) {
      return skel;
    }

    const sx = src.x + src.width / 2;
    const sy = src.y + src.height / 2;
    const tx = tgt.x + tgt.width / 2;
    const ty = tgt.y + tgt.height / 2;

    return {
      ...skel,
      x: sx,
      y: sy,
      points: [
        [0, 0],
        [tx - sx, ty - sy],
      ],
    };
  });
};

/**
 * Lazy-load ELK (Eclipse Layout Kernel, JS port). Same trick as mermaid —
 * the layout engine ships ~500KB, so we only resolve it when a caller
 * actually requests a `layout`. Subsequent calls reuse the singleton.
 */
let _elkPromise = null;
const loadELK = async () => {
  if (!_elkPromise) {
    _elkPromise = import("elkjs/lib/elk.bundled.js").then(
      (mod) => new mod.default(),
    );
  }
  return _elkPromise;
};

const LAYOUT_NODE_PADDING = 16;

/** Sensible per-algorithm defaults, merged under user-supplied `layoutOptions`. */
const DEFAULT_LAYOUT_OPTIONS = {
  layered: {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": 60,
    "elk.layered.spacing.nodeNodeBetweenLayers": 80,
  },
  mrtree: {
    "elk.algorithm": "mrtree",
    "elk.direction": "DOWN",
    "elk.spacing.nodeNode": 50,
  },
  radial: {
    "elk.algorithm": "radial",
    "elk.spacing.nodeNode": 50,
  },
  force: {
    "elk.algorithm": "force",
    "elk.spacing.nodeNode": 80,
  },
  stress: {
    "elk.algorithm": "stress",
    "elk.spacing.nodeNode": 80,
  },
  box: {
    "elk.algorithm": "box",
    "elk.spacing.nodeNode": 30,
  },
  rectpacking: {
    "elk.algorithm": "rectpacking",
    "elk.spacing.nodeNode": 20,
  },
};

/**
 * Estimate a bound-text label's bounding box using Excalidraw's own font
 * metrics, then pad. Used to feed realistic node sizes into ELK when the
 * skeleton hasn't declared explicit `width`/`height`.
 */
const measureLabelBox = (label) => {
  const isObj = label && typeof label === "object";
  const text = !label ? null : isObj ? label.text : label;
  if (!text) {
    return { width: 100, height: 50 };
  }
  const fontSize = (isObj && label.fontSize) || DEFAULT_FONT_SIZE;
  const fontFamily = (isObj && label.fontFamily) || DEFAULT_FONT_FAMILY;
  const font = getFontString({ fontSize, fontFamily });
  const lineHeight = getLineHeight(fontFamily);
  const metrics = measureText(text, font, lineHeight);
  return {
    width: Math.ceil(metrics.width) + LAYOUT_NODE_PADDING * 2,
    height: Math.ceil(metrics.height) + LAYOUT_NODE_PADDING * 2,
  };
};

/**
 * Run the requested ELK algorithm over the bindable shapes in `skeletons`
 * and return a new skeleton array where those shapes have ELK-computed
 * `x` / `y` / `width` / `height`. Non-bindable elements (labels, arrows,
 * frames without ids, etc.) pass through untouched — the subsequent
 * `autoPositionArrows` pass picks up the new shape coordinates when
 * computing arrow geometry.
 *
 * The "graph" is inferred from the input:
 *   - Nodes: every skeleton with `id` AND a bindable type.
 *   - Edges: every arrow skeleton whose `start.id` and `end.id` both point
 *     to discovered nodes.
 *
 * **Precedence rules** (when `layout` is set):
 *   - `width` / `height` from skeleton always honored (used as ELK input).
 *   - `x` and `y` BOTH present on a node → "pinned": the node keeps those
 *     coords, and ELK is informed via `elk.position` so it lays out the
 *     rest of the graph **avoiding overlap** with the pin.
 *   - Otherwise → ELK chooses x/y freely.
 *
 * Mix and match freely — pinned anchors + free shapes in the same batch.
 */
const applyGraphLayout = async (skeletons, layout, layoutOptions = {}) => {
  const nodeIds = new Set();
  const nodes = [];
  for (const skel of skeletons) {
    if (skel.id && BINDABLE_SKELETON_TYPES.has(skel.type)) {
      nodes.push(skel);
      nodeIds.add(skel.id);
    }
  }
  if (nodes.length === 0) {
    return skeletons;
  }

  const edges = [];
  for (const skel of skeletons) {
    if (
      skel.type === "arrow" &&
      nodeIds.has(skel.start?.id) &&
      nodeIds.has(skel.end?.id)
    ) {
      edges.push(skel);
    }
  }

  const dims = new Map();
  const pins = new Map();
  for (const node of nodes) {
    if (node.width !== undefined && node.height !== undefined) {
      dims.set(node.id, { width: node.width, height: node.height });
    } else {
      dims.set(node.id, measureLabelBox(node.label));
    }
    if (node.x !== undefined && node.y !== undefined) {
      pins.set(node.id, { x: node.x, y: node.y });
    }
  }

  const algoDefaults = DEFAULT_LAYOUT_OPTIONS[layout] || {
    "elk.algorithm": layout,
  };

  const elk = await loadELK();
  const elkGraph = {
    id: "__excalidrawZ_graph_root",
    layoutOptions: { ...algoDefaults, ...layoutOptions },
    children: nodes.map((n) => {
      const child = { id: n.id, ...dims.get(n.id) };
      const pin = pins.get(n.id);
      if (pin) {
        // Pre-place + tell ELK this node is pinned. Most algorithms honor
        // `elk.position` as a hard constraint; for those that don't, we
        // restore the original coordinates after layout below.
        child.x = pin.x;
        child.y = pin.y;
        child.layoutOptions = {
          "org.eclipse.elk.position": `(${pin.x},${pin.y})`,
        };
      }
      return child;
    }),
    edges: edges.map((e, idx) => ({
      id: `__excalidrawZ_edge_${idx}`,
      sources: [e.start.id],
      targets: [e.end.id],
    })),
  };

  const laidOut = await elk.layout(elkGraph);

  const positions = new Map();
  for (const child of laidOut.children || []) {
    const pin = pins.get(child.id);
    positions.set(child.id, pin || { x: child.x, y: child.y });
  }

  return skeletons.map((skel) => {
    if (!skel.id || !positions.has(skel.id)) {
      return skel;
    }
    const pos = positions.get(skel.id);
    const dim = dims.get(skel.id);
    return { ...skel, x: pos.x, y: pos.y, width: dim.width, height: dim.height };
  });
};

/**
 * Build elements from skeleton specs and insert them into the scene in one
 * call. Mirror of `insertFromMermaid`, but for the canonical skeleton input
 * format — pair this with the skeleton schema documented in `creators.js`'s
 * header for full power (mutual bindings, frames, polylines, etc.).
 *
 * Accepts either an array of skeletons or a single skeleton object (for the
 * common one-element case). All non-skeleton options are forwarded straight
 * to `insertElements` — see `placement.js` for the position/focus surface.
 *
 * @param {object[] | object} skeletons
 * @param {{
 *   layout?: "layered" | "mrtree" | "radial" | "force" | "stress" | "box" | "rectpacking" | string,
 *   layoutOptions?: { [elkKey: string]: string | number },
 *   regenerateIds?: boolean,
 *   position?: object | string,
 *   focus?: boolean | "center" | "fitViewport" | "fitContent" | object,
 *   files?: { [id: string]: object },
 *   captureUpdate?: string,
 *   sanitize?: boolean,
 * }} [opts]
 *   `layout` (default `undefined`): when set, runs Eclipse Layout Kernel
 *   over the bindable shapes inferred from the skeleton (and the arrows
 *   that connect them). Common picks: `"layered"` (flowcharts, DAGs),
 *   `"mrtree"` (trees), `"radial"` (mind maps), `"stress"` (general).
 *
 *   **When `layout` is set, precedence per node is:**
 *     - `width` / `height` from skeleton → always honored (sent to ELK).
 *     - `x` AND `y` both set → pinned; ELK lays out the rest **avoiding
 *       overlap** with the pinned node.
 *     - Neither x nor y set → ELK chooses position freely.
 *
 *   `layoutOptions`: raw ELK options merged on top of per-algorithm
 *   defaults — e.g. `{ "elk.direction": "RIGHT" }` for sideways flow.
 *
 *   `position` (default `undefined`): translation applied AFTER layout, so
 *   e.g. `"viewport-center"` works regardless of layout.
 *
 * @returns {Promise<{
 *   elementIds: string[],
 *   insertedAt: { x: number, y: number },
 *   bounds: { x: number, y: number, width: number, height: number },
 * }>}
 *
 * @throws if excalidrawAPI isn't ready.
 */
export const insertFromSkeleton = async (skeletons, opts = {}) => {
  const {
    layout,
    layoutOptions,
    regenerateIds = true,
    ...insertOpts
  } = opts;
  const list = Array.isArray(skeletons) ? skeletons : [skeletons];
  const positioned = layout
    ? await applyGraphLayout(list, layout, layoutOptions)
    : list;
  const prepared = autoPositionArrows(positioned);
  assertCoordinates(prepared, { layout: !!layout });
  const elements = createElements(prepared, { regenerateIds });
  return insertElements(elements, insertOpts);
};

/**
 * Fail-fast after layout + auto-position. Every skeleton at this point
 * should have finite `x` / `y` — either from the caller, from ELK, or from
 * `autoPositionArrows`. A leftover undefined means the caller submitted
 * something the pipeline can't place (typically: decoration text/shape
 * with no `id` and no coordinates, so ELK ignored it and nobody else
 * filled in).
 *
 * Throwing here keeps `getCommonBounds` from producing NaN, which would
 * silently corrupt the scene insertion result (insertedAt/bounds become
 * null after JSON serialization).
 */
const assertCoordinates = (skeletons, { layout }) => {
  for (let i = 0; i < skeletons.length; i++) {
    const skel = skeletons[i];
    if (!Number.isFinite(skel.x) || !Number.isFinite(skel.y)) {
      const idPart = skel.id ? ` id="${skel.id}"` : "";
      const hint = layout
        ? skel.id
          ? "this should have been laid out by ELK — check that its type is a bindable shape"
          : "decoration elements (no `id`) must carry explicit `x` and `y`; or give it an `id` to let ELK place it"
        : "every skeleton needs `x` and `y` when no `layout` is requested";
      throw new Error(
        `insertFromSkeleton: skeleton[${i}] (type="${skel.type}"${idPart}) ` +
          `has invalid coordinates (x=${skel.x}, y=${skel.y}). ${hint}.`,
      );
    }
  }
};

/**
 * Drop `undefined` values so we don't override skeleton defaults with them.
 */
const compact = (obj) => {
  const out = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
};

/**
 * Normalize a `text` / `label` shorthand: a bare string becomes `{ text }`,
 * an object passes through.
 */
const normalizeLabel = (label) =>
  typeof label === "string" ? { text: label } : label;

/**
 * Create a generic shape (rectangle / ellipse / diamond), with an optional
 * bound text label. When `text` is supplied, the result is `[shape, text]`
 * with proper containerId / boundElements wiring.
 *
 * @param {{
 *   shape: "rectangle" | "ellipse" | "diamond",
 *   x: number,
 *   y: number,
 *   width?: number,
 *   height?: number,
 *   text?: string | {
 *     text: string,
 *     fontSize?: number,
 *     fontFamily?: number,
 *     textAlign?: "left" | "center" | "right",
 *     verticalAlign?: "top" | "middle" | "bottom",
 *     strokeColor?: string,
 *   },
 *   id?: string,
 *   strokeColor?: string,
 *   backgroundColor?: string,
 *   fillStyle?: "solid" | "hachure" | "cross-hatch" | "zigzag" | "dots" | "dashed",
 *   strokeWidth?: number,
 *   strokeStyle?: "solid" | "dashed" | "dotted",
 *   roughness?: number,
 *   opacity?: number,
 *   roundness?: object | null,
 *   angle?: number,
 * }} params
 * @returns {object[]}  `[shape]` or `[shape, text]`
 */
export const createShape = ({
  shape,
  x,
  y,
  width,
  height,
  text,
  ...style
}) => {
  const skeleton = compact({
    type: shape,
    x,
    y,
    width,
    height,
    ...style,
  });
  if (text !== undefined) {
    skeleton.label = normalizeLabel(text);
  }
  return createElements([skeleton]);
};

/**
 * Create a plain text element.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   text: string,
 *   id?: string,
 *   width?: number,
 *   height?: number,
 *   fontSize?: number,
 *   fontFamily?: number,
 *   textAlign?: "left" | "center" | "right",
 *   verticalAlign?: "top" | "middle" | "bottom",
 *   strokeColor?: string,
 *   opacity?: number,
 *   angle?: number,
 * }} params
 */
export const createText = ({ x, y, text, ...rest }) => {
  return createElements([compact({ type: "text", x, y, text, ...rest })]);
};

/**
 * Create an arrow, optionally with a label and start/end bindings.
 *
 * Bindings are resolved within the same `createElements` batch only — see
 * the note at the top of this file. For polylines, pass `points`.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   width?: number,
 *   height?: number,
 *   points?: [number, number][],
 *   start?: { id?: string, type?: string, x?: number, y?: number, width?: number, height?: number },
 *   end?: { id?: string, type?: string, x?: number, y?: number, width?: number, height?: number },
 *   label?: string | { text: string, fontSize?: number, fontFamily?: number },
 *   id?: string,
 *   startArrowhead?: string | null,
 *   endArrowhead?: string | null,
 *   strokeColor?: string,
 *   strokeWidth?: number,
 *   strokeStyle?: "solid" | "dashed" | "dotted",
 *   roughness?: number,
 *   opacity?: number,
 * }} params
 */
export const createArrow = ({
  x,
  y,
  width,
  height,
  points,
  start,
  end,
  label,
  ...style
}) => {
  const skeleton = compact({
    type: "arrow",
    x,
    y,
    width,
    height,
    points,
    start,
    end,
    ...style,
  });
  if (label !== undefined) {
    skeleton.label = normalizeLabel(label);
  }
  return createElements([skeleton]);
};

/**
 * Create a line. Same surface as `createArrow` minus bindings/label.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   width?: number,
 *   height?: number,
 *   points?: [number, number][],
 *   id?: string,
 *   strokeColor?: string,
 *   strokeWidth?: number,
 *   strokeStyle?: "solid" | "dashed" | "dotted",
 *   roughness?: number,
 *   opacity?: number,
 * }} params
 */
export const createLine = ({ x, y, width, height, points, ...style }) => {
  return createElements([
    compact({ type: "line", x, y, width, height, points, ...style }),
  ]);
};

/**
 * Create a frame containing other elements by ID.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   name?: string,
 *   childIds?: string[],
 *   id?: string,
 * }} params
 */
export const createFrame = ({
  x,
  y,
  width,
  height,
  name,
  childIds = [],
  ...rest
}) => {
  return createElements([
    compact({
      type: "frame",
      x,
      y,
      width,
      height,
      name,
      children: childIds,
      ...rest,
    }),
  ]);
};

/**
 * Create an image element. The corresponding binary file must be registered
 * separately via `excalidrawZHelper._api.addFiles([{ id: fileId, dataURL,
 * mimeType, created, ... }])` — otherwise the element renders blank.
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   fileId: string,
 *   width?: number,
 *   height?: number,
 *   id?: string,
 *   angle?: number,
 *   opacity?: number,
 * }} params
 */
export const createImage = ({ x, y, fileId, width, height, ...rest }) => {
  return createElements([
    compact({ type: "image", x, y, fileId, width, height, ...rest }),
  ]);
};
