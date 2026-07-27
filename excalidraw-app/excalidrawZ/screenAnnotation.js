import {
  arrayToMap,
  randomId,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import {
  addElementsToFrame,
  deepCopyElement,
  duplicateElements,
  elementOverlapsWithFrame,
  getCommonBounds,
  isFrameLikeElement,
  newFrameElement,
  newImageElement,
} from "@excalidraw/element";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import { focusElements } from "./camera";
import { CaptureUpdate } from "./elements";

const SCREEN_ANNOTATION_DATA_KEY = "excalidrawZScreenAnnotation";
const SCREEN_ANNOTATION_INDEX_KEY = "screenAnnotationIndex";
const DEFAULT_COLUMNS = 4;
const DEFAULT_GAP = 40;

const getAPI = (methodName) => {
  const api = window.excalidrawZHelper?._api;
  if (!api) {
    throw new Error(`${methodName}: excalidrawAPI not ready`);
  }
  return api;
};

const assertFiniteRect = (rect, name) => {
  if (
    !rect ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new TypeError(
      `${name} must contain finite x/y and positive width/height`,
    );
  }
};

const assertImage = (image) => {
  if (
    !image ||
    typeof image.dataURL !== "string" ||
    !image.dataURL.startsWith("data:") ||
    typeof image.mimeType !== "string" ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new TypeError(
      "image must contain dataURL, mimeType, and positive width/height",
    );
  }
};

const createMarker = (index) => ({
  [SCREEN_ANNOTATION_DATA_KEY]: true,
  [SCREEN_ANNOTATION_INDEX_KEY]: index,
});

const isScreenAnnotationFrame = (element) =>
  element?.type === "frame" &&
  element.customData?.[SCREEN_ANNOTATION_DATA_KEY] === true;

const getScreenAnnotationIndex = (frame) => {
  const value = frame.customData?.[SCREEN_ANNOTATION_INDEX_KEY];
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const createScreenshotFile = (image) => {
  const id = `screen-annotation-file-${randomId()}`;
  return {
    id,
    dataURL: image.dataURL,
    mimeType: image.mimeType,
    created: Number.isFinite(image.created) ? image.created : Date.now(),
  };
};

const createFrameAndImage = ({ frameRect, imageRect, image, frameName }) => {
  const file = createScreenshotFile(image);
  const frame = newFrameElement({
    x: frameRect.x,
    y: frameRect.y,
    width: frameRect.width,
    height: frameRect.height,
    name: frameName,
    customData: createMarker(0),
  });
  const screenshot = newImageElement({
    type: "image",
    x: imageRect.x,
    y: imageRect.y,
    width: imageRect.width,
    height: imageRect.height,
    fileId: file.id,
    status: "saved",
    locked: true,
  });

  return { file, frame, screenshot };
};

const serializeDocument = (elements, appState, files) =>
  JSON.parse(serializeAsJSON(elements, appState, files, "local"));

const getSceneRectFromViewportRect = (viewportRect, appState) => {
  const topLeft = viewportCoordsToSceneCoords(
    {
      clientX: viewportRect.x,
      clientY: viewportRect.y,
    },
    appState,
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    // Native provides logical capture dimensions. They are already the desired
    // scene dimensions and must not be derived from bitmap pixels or zoom.
    width: viewportRect.width,
    height: viewportRect.height,
  };
};

const collectAreaElements = (elements, frame) => {
  const nonFrameElements = elements.filter(
    (element) => !element.isDeleted && !isFrameLikeElement(element),
  );
  const elementsMap = arrayToMap(elements);
  const selectedIds = new Set(
    nonFrameElements
      .filter((element) =>
        elementOverlapsWithFrame(element, frame, elementsMap),
      )
      .map((element) => element.id),
  );

  // Complete the relationship closure before restoring. This keeps bound text,
  // containers, arrows, and arrow endpoints editable instead of silently
  // dropping their bindings at the viewport edge.
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of nonFrameElements) {
      if (!selectedIds.has(element.id)) {
        continue;
      }

      const dependencyIds = [
        element.containerId,
        element.startBinding?.elementId,
        element.endBinding?.elementId,
        ...(element.boundElements?.map((binding) => binding.id) ?? []),
      ].filter(Boolean);

      for (const dependencyId of dependencyIds) {
        const dependency = elementsMap.get(dependencyId);
        if (
          dependency &&
          !dependency.isDeleted &&
          !isFrameLikeElement(dependency) &&
          !selectedIds.has(dependencyId)
        ) {
          selectedIds.add(dependencyId);
          changed = true;
        }
      }
    }
  }

  // Filtering the original array preserves scene order. Copies are required
  // because addElementsToFrame mutates frameId and indices.
  return nonFrameElements
    .filter((element) => selectedIds.has(element.id))
    .map((element) => deepCopyElement(element));
};

const createRawDocument = (api, image, captureRect) => {
  assertFiniteRect(captureRect, "selectionRect or viewportRect");

  const appState = api.getAppState();
  const sceneRect = getSceneRectFromViewportRect(captureRect, appState);
  const localRect = {
    x: 0,
    y: 0,
    width: sceneRect.width,
    height: sceneRect.height,
  };
  const { file, frame, screenshot } = createFrameAndImage({
    frameRect: localRect,
    imageRect: localRect,
    image,
    frameName: "Screen Annotation 1",
  });
  const sceneElements = api.getSceneElements();
  const captureFrame = newFrameElement({
    x: sceneRect.x,
    y: sceneRect.y,
    width: sceneRect.width,
    height: sceneRect.height,
  });
  const annotations = collectAreaElements(sceneElements, captureFrame).map(
    (element) => ({
      ...element,
      x: element.x - sceneRect.x,
      y: element.y - sceneRect.y,
    }),
  );

  let elements = [screenshot, ...annotations, frame];
  elements = addElementsToFrame(elements, [screenshot, ...annotations], frame);
  elements = restoreElements(elements, null, { repairBindings: true });

  const liveFiles = api.getFiles();
  const files = { [file.id]: file };
  for (const element of elements) {
    if (
      element.type === "image" &&
      element.fileId &&
      element.fileId !== file.id
    ) {
      if (!liveFiles[element.fileId]) {
        throw new Error(
          `createScreenAnnotationDocument: missing file data for ${element.fileId}`,
        );
      }
      files[element.fileId] = liveFiles[element.fileId];
    }
  }

  return serializeDocument(
    elements,
    {
      ...appState,
      scrollX: appState.scrollX + sceneRect.x,
      scrollY: appState.scrollY + sceneRect.y,
    },
    files,
  );
};

const createBitmapDocument = (api, image, captureRect) => {
  assertFiniteRect(captureRect, "selectionRect or viewportRect");

  const appState = api.getAppState();
  const sceneRect = getSceneRectFromViewportRect(captureRect, appState);
  const localRect = {
    x: 0,
    y: 0,
    width: sceneRect.width,
    height: sceneRect.height,
  };
  const { file, frame, screenshot } = createFrameAndImage({
    frameRect: localRect,
    imageRect: localRect,
    image,
    frameName: "Screen Annotation 1",
  });

  let elements = addElementsToFrame(
    [screenshot, frame],
    [screenshot],
    frame,
  );
  elements = restoreElements(elements, null, { repairBindings: true });

  return serializeDocument(
    elements,
    {
      ...appState,
      scrollX: appState.scrollX + sceneRect.x,
      scrollY: appState.scrollY + sceneRect.y,
    },
    { [file.id]: file },
  );
};

/**
 * Create a standalone Excalidraw document from the current annotation scene.
 *
 * selectionRect (preferred) and viewportRect are expressed in WebView/client
 * coordinates. Excalidraw's coordinate helper applies canvas offsets, scroll,
 * and zoom to the rect origin; Native's logical width/height are used directly
 * as scene dimensions. Native safe-area insets only pad editor controls and
 * must not be applied a second time here. image.width/height describe source
 * bitmap pixels only.
 */
export const createScreenAnnotationDocument = ({
  mode,
  image,
  viewportRect,
  selectionRect,
} = {}) => {
  const api = getAPI("createScreenAnnotationDocument");
  assertImage(image);

  const documentMode = mode ?? "raw";
  if (documentMode === "bitmap") {
    return createBitmapDocument(
      api,
      image,
      selectionRect ?? viewportRect,
    );
  }
  if (documentMode !== "raw") {
    throw new TypeError(
      'createScreenAnnotationDocument supports "raw" or "bitmap"; "flattened" was removed',
    );
  }

  return createRawDocument(api, image, selectionRect ?? viewportRect);
};

const normalizeInsertOptions = (options) => {
  const columnsValue = Number(options?.columns);
  const columns =
    Number.isFinite(columnsValue) && columnsValue > 0
      ? Math.max(1, Math.floor(columnsValue))
      : DEFAULT_COLUMNS;
  const gapValue = Number(options?.gap);
  const gap = Number.isFinite(gapValue) ? Math.max(0, gapValue) : DEFAULT_GAP;
  const captureUpdate = options?.captureUpdate ?? CaptureUpdate.IMMEDIATELY;
  if (!Object.values(CaptureUpdate).includes(captureUpdate)) {
    throw new TypeError(
      `captureUpdate must be one of ${Object.values(CaptureUpdate).join(", ")}`,
    );
  }

  return {
    columns,
    gap,
    captureUpdate,
    focus:
      options?.focus === undefined
        ? { mode: "center", animate: false }
        : options.focus,
  };
};

const getViewportCenteredFramePosition = (api, frame) => {
  const appState = api.getAppState();
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );
  return {
    x: center.x - frame.width / 2,
    y: center.y - frame.height / 2,
  };
};

const getInsertionPosition = ({
  api,
  currentElements,
  existingFrames,
  frame,
  index,
  columns,
  gap,
}) => {
  if (existingFrames.length === 0) {
    if (currentElements.length === 0) {
      return getViewportCenteredFramePosition(api, frame);
    }
    const [, minY, maxX] = getCommonBounds(currentElements);
    return { x: maxX + gap, y: minY };
  }

  const row = Math.floor(index / columns);
  const column = index % columns;
  const indexedFrames = existingFrames.map((element) => ({
    element,
    index: getScreenAnnotationIndex(element),
  }));
  const originFrame = indexedFrames.reduce((lowest, item) =>
    item.index < lowest.index ? item : lowest,
  );

  if (column > 0) {
    const rowFrames = indexedFrames
      .filter((item) => Math.floor(item.index / columns) === row)
      .sort((a, b) => a.index - b.index);
    const previous = rowFrames.at(-1)?.element;
    if (previous) {
      return {
        x: previous.x + previous.width + gap,
        y: Math.min(...rowFrames.map((item) => item.element.y)),
      };
    }
  }

  return {
    x: originFrame.element.x,
    y:
      Math.max(...existingFrames.map((element) => element.y + element.height)) +
      gap,
  };
};

const filesAreEqual = (left, right) =>
  left?.dataURL === right?.dataURL && left?.mimeType === right?.mimeType;

const remapFiles = (elements, documentFiles, existingFiles) => {
  const referencedFileIds = new Set(
    elements
      .filter((element) => element.type === "image" && element.fileId)
      .map((element) => element.fileId),
  );
  const fileIdMap = new Map();
  const filesToAdd = [];
  const reservedFileIds = new Set(Object.keys(existingFiles));

  for (const sourceId of referencedFileIds) {
    const file = documentFiles[sourceId];
    if (!file) {
      if (existingFiles[sourceId]) {
        fileIdMap.set(sourceId, sourceId);
        continue;
      }
      throw new Error(
        `insertScreenAnnotationDocument: missing file data for ${sourceId}`,
      );
    }

    let targetId = sourceId;
    if (
      reservedFileIds.has(targetId) &&
      !filesAreEqual(existingFiles[targetId], file)
    ) {
      do {
        targetId = `screen-annotation-file-${randomId()}`;
      } while (reservedFileIds.has(targetId));
    }

    fileIdMap.set(sourceId, targetId);
    reservedFileIds.add(targetId);
    if (!existingFiles[targetId]) {
      filesToAdd.push({ ...file, id: targetId });
    }
  }

  return {
    elements: elements.map((element) => {
      if (element.type !== "image" || !element.fileId) {
        return element;
      }
      const fileId = fileIdMap.get(element.fileId);
      return fileId && fileId !== element.fileId
        ? { ...element, fileId }
        : element;
    }),
    filesToAdd,
  };
};

/**
 * Insert a screen-annotation document as one undoable scene update.
 */
export const insertScreenAnnotationDocument = (document, options = {}) => {
  const api = getAPI("insertScreenAnnotationDocument");
  if (
    !document ||
    document.type !== "excalidraw" ||
    !Array.isArray(document.elements) ||
    !document.files ||
    typeof document.files !== "object" ||
    Array.isArray(document.files)
  ) {
    throw new TypeError(
      "document must be a serialized Excalidraw document with elements and files",
    );
  }

  const { columns, gap, captureUpdate, focus } =
    normalizeInsertOptions(options);
  const sourceElements = restoreElements(document.elements, null, {
    repairBindings: true,
  }).filter((element) => !element.isDeleted);
  const sourceFrames = sourceElements.filter(isScreenAnnotationFrame);
  if (sourceFrames.length !== 1) {
    throw new Error(
      `insertScreenAnnotationDocument: expected exactly one marked frame, got ${sourceFrames.length}`,
    );
  }
  const sourceFrame = sourceFrames[0];

  const currentElements = api
    .getSceneElementsIncludingDeleted()
    .filter((element) => !element.isDeleted);
  const existingFrames = currentElements.filter(isScreenAnnotationFrame);
  const index =
    existingFrames.length === 0
      ? 0
      : Math.max(...existingFrames.map(getScreenAnnotationIndex)) + 1;
  const target = getInsertionPosition({
    api,
    currentElements,
    existingFrames,
    frame: sourceFrame,
    index,
    columns,
    gap,
  });
  const dx = target.x - sourceFrame.x;
  const dy = target.y - sourceFrame.y;

  const { duplicatedElements, origIdToDuplicateId } = duplicateElements({
    type: "everything",
    elements: sourceElements,
    preserveFrameChildrenOrder: true,
    overrides: ({ duplicateElement, origElement }) => ({
      x: duplicateElement.x + dx,
      y: duplicateElement.y + dy,
      ...(origElement.id === sourceFrame.id
        ? {
            customData: {
              ...duplicateElement.customData,
              ...createMarker(index),
            },
            name: `Screen Annotation ${index + 1}`,
          }
        : null),
    }),
  });

  const existingFiles = api.getFiles();
  const { elements: insertedElements, filesToAdd } = remapFiles(
    duplicatedElements,
    document.files,
    existingFiles,
  );
  if (filesToAdd.length > 0) {
    api.addFiles(filesToAdd);
  }

  const sceneElements = api.getSceneElementsIncludingDeleted();
  const nextElements = restoreElements(
    [...sceneElements, ...insertedElements],
    sceneElements,
    { repairBindings: true },
  );
  api.updateScene({ elements: nextElements, captureUpdate });

  const elementIds = insertedElements.map((element) => element.id);
  if (focus) {
    focusElements(elementIds, focus === true ? {} : focus);
  }

  const frameId = origIdToDuplicateId.get(sourceFrame.id);
  const insertedFrame = insertedElements.find(
    (element) => element.id === frameId,
  );
  return {
    frameId,
    elementIds,
    index,
    bounds: {
      x: insertedFrame.x,
      y: insertedFrame.y,
      width: insertedFrame.width,
      height: insertedFrame.height,
    },
  };
};
