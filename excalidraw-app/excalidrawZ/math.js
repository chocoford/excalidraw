import { createElements } from "./creators";
import { CaptureUpdate } from "./elements";
import { insertElements } from "./placement";

const SVG_MIME_TYPE = "image/svg+xml";
const DEFAULT_MATH_WIDTH = 240;
const DEFAULT_MATH_HEIGHT = 80;

const createId = (prefix) => {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

const isFinitePositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const parseSvgLength = (value) => {
  if (typeof value === "number") {
    return isFinitePositiveNumber(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|em|ex|rem)?$/i);
  if (!match) {
    return null;
  }

  const size = Number(match[1]);
  if (!isFinitePositiveNumber(size)) {
    return null;
  }

  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case "pt":
      return size * (4 / 3);
    case "em":
    case "ex":
    case "rem":
      return size * 16;
    default:
      return size;
  }
};

const parseViewBox = (svg) => {
  const match = svg.match(/\sviewBox=["']([^"']+)["']/i);
  if (!match) {
    return null;
  }

  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (
    parts.length !== 4 ||
    !parts.every((part) => Number.isFinite(part)) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  ) {
    return null;
  }

  return { width: parts[2], height: parts[3] };
};

const parseSvgSize = (svg) => {
  if (typeof svg !== "string") {
    return {};
  }

  const widthAttr = svg.match(/\swidth=["']([^"']+)["']/i)?.[1];
  const heightAttr = svg.match(/\sheight=["']([^"']+)["']/i)?.[1];
  const width = parseSvgLength(widthAttr);
  const height = parseSvgLength(heightAttr);
  const viewBox = parseViewBox(svg);

  if (width && height) {
    return { width, height };
  }
  if (width && viewBox) {
    return { width, height: width * (viewBox.height / viewBox.width) };
  }
  if (height && viewBox) {
    return { width: height * (viewBox.width / viewBox.height), height };
  }

  return {};
};

const normalizeSvgDataURL = ({ svg, svgBase64, dataURL }) => {
  if (typeof dataURL === "string" && dataURL.startsWith("data:")) {
    return dataURL;
  }
  if (typeof svgBase64 === "string" && svgBase64.trim()) {
    return `data:${SVG_MIME_TYPE};base64,${svgBase64.trim()}`;
  }
  if (typeof svg === "string" && svg.trim()) {
    return `data:${SVG_MIME_TYPE};charset=utf-8,${encodeURIComponent(svg)}`;
  }

  throw new Error(
    "createMathImage: expected one of `svg`, `svgBase64`, or `dataURL`.",
  );
};

const buildMathCustomData = ({
  latex,
  renderer = "mathjax",
  version = 1,
  customData,
  mathData,
}) => {
  return {
    ...customData,
    excalidrawZ: {
      ...customData?.excalidrawZ,
      ...mathData,
      type: "math",
      latex,
      renderer,
      version,
    },
  };
};

/**
 * Create a tagged math image element and matching binary file map.
 *
 * @param {{
 *   svg?: string,
 *   svgBase64?: string,
 *   dataURL?: string,
 *   latex?: string,
 *   renderer?: string,
 *   version?: number,
 *   id?: string,
 *   fileId?: string,
 *   x?: number,
 *   y?: number,
 *   width?: number,
 *   height?: number,
 *   angle?: number,
 *   opacity?: number,
 *   customData?: object,
 *   mathData?: object,
 * }} params
 * @returns {{ elements: object[], files: { [id: string]: object }, elementId: string, fileId: string }}
 */
export const createMathImage = (params = {}) => {
  const {
    svg,
    svgBase64,
    dataURL,
    latex,
    renderer,
    version,
    id = createId("math"),
    fileId = createId("math-file"),
    x = 0,
    y = 0,
    width,
    height,
    angle,
    opacity,
    customData,
    mathData,
  } = params;

  const parsedSize = parseSvgSize(svg);
  const resolvedWidth =
    parseSvgLength(width) ?? parsedSize.width ?? DEFAULT_MATH_WIDTH;
  const resolvedHeight =
    parseSvgLength(height) ?? parsedSize.height ?? DEFAULT_MATH_HEIGHT;
  const resolvedDataURL = normalizeSvgDataURL({ svg, svgBase64, dataURL });

  const elements = createElements(
    [
      {
        type: "image",
        id,
        fileId,
        x,
        y,
        width: resolvedWidth,
        height: resolvedHeight,
        angle,
        opacity,
        customData: buildMathCustomData({
          latex,
          renderer,
          version,
          customData,
          mathData,
        }),
      },
    ],
    { regenerateIds: false },
  );

  return {
    elements,
    files: {
      [fileId]: {
        id: fileId,
        mimeType: SVG_MIME_TYPE,
        dataURL: resolvedDataURL,
        created: Date.now(),
      },
    },
    elementId: elements[0].id,
    fileId,
  };
};

/**
 * Create and insert a tagged math image element.
 *
 * @param {Parameters<typeof createMathImage>[0]} params
 * @param {{
 *   position?: object | string,
 *   focus?: boolean | "center" | "fitViewport" | "fitContent" | object,
 *   captureUpdate?: string,
 *   sanitize?: boolean,
 * }} [opts]
 */
export const insertMathImage = (params, opts = {}) => {
  const created = createMathImage(params);
  const result = insertElements(created.elements, {
    position: opts.position,
    focus: opts.focus,
    captureUpdate: opts.captureUpdate,
    sanitize: opts.sanitize,
    files: created.files,
  });

  return {
    ...result,
    elementId: created.elementId,
    fileId: created.fileId,
  };
};

/**
 * Replace the rendered SVG for an existing math image element.
 *
 * Uses a fresh file id by default because Excalidraw's public addFiles API
 * intentionally does not replace existing binary file data.
 *
 * @param {string} elementId
 * @param {Parameters<typeof createMathImage>[0]} params
 * @param {{ captureUpdate?: string }} [opts]
 * @returns {{ elementId: string, fileId: string } | null}
 */
export const updateMathImage = (elementId, params = {}, opts = {}) => {
  const api = window.excalidrawZHelper?._api;
  if (!api) {
    throw new Error("updateMathImage: excalidrawAPI not ready");
  }
  const updateParams = { ...params };
  delete updateParams.fileId;

  const element = api
    .getSceneElementsIncludingDeleted()
    .find((candidate) => candidate.id === elementId);

  if (!element || element.type !== "image") {
    console.warn("[math] updateMathImage: image element not found", elementId);
    return null;
  }

  const created = createMathImage({
    ...updateParams,
    id: elementId,
    x: element.x,
    y: element.y,
    width: updateParams.width ?? element.width,
    height: updateParams.height ?? element.height,
    angle: updateParams.angle ?? element.angle,
    opacity: updateParams.opacity ?? element.opacity,
    customData: {
      ...element.customData,
      ...updateParams.customData,
    },
  });
  const nextElement = created.elements[0];

  api.addFiles(Object.values(created.files));
  api.mutateElement(element, {
    fileId: created.fileId,
    width: nextElement.width,
    height: nextElement.height,
    angle: nextElement.angle,
    opacity: nextElement.opacity,
    customData: nextElement.customData,
  });
  api.updateScene({
    captureUpdate: opts.captureUpdate ?? CaptureUpdate.IMMEDIATELY,
  });

  return {
    elementId,
    fileId: created.fileId,
  };
};
