import {
  newArrowElement,
  newElement,
  newFrameElement,
} from "@excalidraw/element";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import {
  createScreenAnnotationDocument,
  insertScreenAnnotationDocument,
} from "./screenAnnotation";

const IMAGE = {
  dataURL: "data:image/png;base64,c2NyZWVuc2hvdA==",
  mimeType: "image/png",
  width: 800,
  height: 400,
  created: 123,
};

const getAppState = () => ({
  ...getDefaultAppState(),
  width: 1000,
  height: 800,
  offsetLeft: 10,
  offsetTop: 20,
  scrollX: 100,
  scrollY: 50,
  zoom: { value: 2 },
});

const createBoundScene = () => {
  const inside = newElement({
    type: "rectangle",
    x: 20,
    y: 60,
    width: 40,
    height: 30,
    groupIds: ["source-group"],
  });
  const outsideTarget = newElement({
    type: "rectangle",
    x: 280,
    y: 60,
    width: 40,
    height: 30,
    groupIds: ["source-group"],
  });
  const arrow = newArrowElement({
    type: "arrow",
    x: 50,
    y: 75,
    width: 250,
    height: 0,
    points: [
      [0, 0],
      [250, 0],
    ],
  });
  arrow.endBinding = {
    elementId: outsideTarget.id,
    focus: 0,
    gap: 1,
    fixedPoint: null,
  };
  outsideTarget.boundElements = [{ id: arrow.id, type: "arrow" }];

  return { inside, arrow, outsideTarget };
};

describe("screen annotation documents", () => {
  afterEach(() => {
    delete window.excalidrawZHelper;
  });

  it("creates a raw document in scene coordinates and keeps binding dependencies", () => {
    const { inside, arrow, outsideTarget } = createBoundScene();
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElements: () => [inside, arrow, outsideTarget],
        getFiles: () => ({
          unused: {
            id: "unused",
            dataURL: "data:image/png;base64,dW51c2Vk",
            mimeType: "image/png",
            created: 123,
          },
        }),
      },
    };

    const document = createScreenAnnotationDocument({
      image: IMAGE,
      viewportRect: { x: 210, y: 220, width: 400, height: 200 },
    });

    expect(document.type).toBe("excalidraw");
    expect(document.version).toBe(2);
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);

    const frame = document.elements.find((element) => element.type === "frame");
    expect(frame).toMatchObject({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      customData: {
        excalidrawZScreenAnnotation: true,
        screenAnnotationIndex: 0,
      },
    });

    const screenshot = document.elements.find(
      (element) => element.type === "image",
    );
    expect(screenshot).toMatchObject({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      locked: true,
      frameId: frame.id,
    });
    expect(document.elements.map((element) => element.id)).toContain(
      outsideTarget.id,
    );
    expect(
      document.elements.find((element) => element.id === arrow.id).endBinding
        .elementId,
    ).toBe(outsideTarget.id);
    expect(
      document.elements.find((element) => element.id === inside.id),
    ).toMatchObject({ x: 20, y: 10, width: 40, height: 30 });
    expect(document.appState).toMatchObject({
      scrollX: 100,
      scrollY: 100,
      zoom: { value: 2 },
    });
    expect(document.files[screenshot.fileId]).toMatchObject({
      dataURL: IMAGE.dataURL,
      mimeType: IMAGE.mimeType,
      created: IMAGE.created,
    });
    expect(Object.keys(document.files)).toEqual([screenshot.fileId]);
    expect(document.elements.indexOf(screenshot)).toBeLessThan(
      document.elements.findIndex((element) => element.id === inside.id),
    );
  });

  it("inserts with fresh IDs, remapped bindings/files, and one scene capture", () => {
    const { inside, arrow, outsideTarget } = createBoundScene();
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElements: () => [inside, arrow, outsideTarget],
        getFiles: () => ({}),
      },
    };
    const document = createScreenAnnotationDocument({
      mode: "raw",
      image: IMAGE,
      viewportRect: { x: 210, y: 220, width: 400, height: 200 },
    });
    const sourceFrame = document.elements.find(
      (element) => element.type === "frame",
    );
    const sourceImage = document.elements.find(
      (element) => element.type === "image",
    );

    const existing = newElement({
      type: "rectangle",
      x: 0,
      y: 10,
      width: 100,
      height: 50,
    });
    const addFiles = vi.fn();
    const updateScene = vi.fn();
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElementsIncludingDeleted: () => [existing],
        getSceneElements: () => [existing],
        getFiles: () => ({
          [sourceImage.fileId]: {
            ...document.files[sourceImage.fileId],
            dataURL: "data:image/png;base64,Y29uZmxpY3Q=",
          },
        }),
        addFiles,
        updateScene,
      },
    };

    const result = insertScreenAnnotationDocument(document, {
      columns: 4,
      gap: 40,
      focus: false,
      captureUpdate: "IMMEDIATELY",
    });

    expect(updateScene).toHaveBeenCalledTimes(1);
    expect(updateScene.mock.calls[0][0].captureUpdate).toBe("IMMEDIATELY");
    expect(addFiles).toHaveBeenCalledTimes(1);

    const insertedElements = updateScene.mock.calls[0][0].elements.filter(
      (element) => element.id !== existing.id,
    );
    const insertedFrame = insertedElements.find(
      (element) => element.id === result.frameId,
    );
    const insertedImage = insertedElements.find(
      (element) => element.type === "image",
    );
    const insertedArrow = insertedElements.find(
      (element) => element.type === "arrow",
    );
    const insertedTarget = insertedElements.find(
      (element) => element.id === insertedArrow.endBinding.elementId,
    );

    expect(result).toMatchObject({
      index: 0,
      bounds: { x: 140, y: 10, width: 400, height: 200 },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.frameId).not.toBe(sourceFrame.id);
    expect(insertedFrame.customData.screenAnnotationIndex).toBe(0);
    expect(insertedImage.fileId).not.toBe(sourceImage.fileId);
    expect(addFiles.mock.calls[0][0][0].id).toBe(insertedImage.fileId);
    expect(insertedTarget).toBeDefined();
    expect(insertedTarget.id).not.toBe(outsideTarget.id);
    expect(
      insertedElements.every((element) =>
        result.elementIds.includes(element.id),
      ),
    ).toBe(true);
    expect(
      insertedElements
        .filter((element) => element.id !== insertedFrame.id)
        .every((element) => element.frameId === insertedFrame.id),
    ).toBe(true);
  });

  it("uses selectionRect logical dimensions without scaling bitmap data", () => {
    window.excalidrawZHelper = {
      _api: {
        getAppState: () => ({
          ...getAppState(),
          zoom: { value: 1 },
        }),
        getSceneElements: () => [],
        getFiles: () => ({}),
      },
    };

    const document = createScreenAnnotationDocument({
      image: { ...IMAGE, width: 3600, height: 2338 },
      selectionRect: { x: 10, y: 20, width: 1800, height: 1169 },
    });
    const frame = document.elements.find((element) => element.type === "frame");
    const screenshot = document.elements.find(
      (element) => element.type === "image",
    );

    expect(frame).toMatchObject({ x: 0, y: 0, width: 1800, height: 1169 });
    expect(screenshot).toMatchObject({
      x: 0,
      y: 0,
      width: 1800,
      height: 1169,
      locked: true,
    });
    expect(document.files[screenshot.fileId].dataURL).toBe(IMAGE.dataURL);
  });

  it("creates consecutive bitmap documents with independent IDs and no canvas annotations", () => {
    const getSceneElements = vi.fn(() => [
      newElement({
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      }),
    ]);
    const getFiles = vi.fn(() => ({
      unused: {
        id: "unused",
        dataURL: "data:image/png;base64,dW51c2Vk",
        mimeType: "image/png",
        created: 123,
      },
    }));
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElements,
        getFiles,
      },
    };

    const createDocument = () =>
      createScreenAnnotationDocument({
        mode: "bitmap",
        image: IMAGE,
        viewportRect: { x: 20, y: 30, width: 400, height: 200 },
      });
    const first = createDocument();
    const second = createDocument();

    for (const document of [first, second]) {
      expect(document.elements).toHaveLength(2);
      const frame = document.elements.find(
        (element) => element.type === "frame",
      );
      const screenshot = document.elements.find(
        (element) => element.type === "image",
      );
      expect(frame).toMatchObject({
        x: 0,
        y: 0,
        width: 400,
        height: 200,
        customData: {
          excalidrawZScreenAnnotation: true,
          screenAnnotationIndex: 0,
        },
      });
      expect(screenshot).toMatchObject({
        x: 0,
        y: 0,
        width: 400,
        height: 200,
        locked: true,
        frameId: frame.id,
      });
      expect(Object.keys(document.files)).toEqual([screenshot.fileId]);
    }

    expect(first.elements.map((element) => element.id)).not.toEqual(
      second.elements.map((element) => element.id),
    );
    expect(Object.keys(first.files)).not.toEqual(
      Object.keys(second.files),
    );
    expect(getSceneElements).not.toHaveBeenCalled();
    expect(getFiles).not.toHaveBeenCalled();
  });

  it("uses selectionRect for bitmap scene size and preserves JPEG pixels", () => {
    window.excalidrawZHelper = {
      _api: {
        getAppState: () => ({
          ...getAppState(),
          zoom: { value: 1 },
        }),
      },
    };
    const jpeg = {
      dataURL: "data:image/jpeg;base64,Yml0bWFw",
      mimeType: "image/jpeg",
      width: 2400,
      height: 1600,
      created: 456,
    };

    const document = createScreenAnnotationDocument({
      mode: "bitmap",
      image: jpeg,
      viewportRect: { x: 0, y: 0, width: 1000, height: 700 },
      selectionRect: { x: 40, y: 60, width: 600, height: 400 },
    });
    const frame = document.elements.find(
      (element) => element.type === "frame",
    );
    const screenshot = document.elements.find(
      (element) => element.type === "image",
    );

    expect(frame).toMatchObject({ x: 0, y: 0, width: 600, height: 400 });
    expect(screenshot).toMatchObject({
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      locked: true,
    });
    expect(document.files[screenshot.fileId]).toMatchObject({
      dataURL: jpeg.dataURL,
      mimeType: "image/jpeg",
      created: jpeg.created,
    });
  });

  it("inserts a bitmap document through the existing frame protocol", () => {
    window.excalidrawZHelper = {
      _api: {
        getAppState,
      },
    };
    const document = createScreenAnnotationDocument({
      mode: "bitmap",
      image: IMAGE,
      selectionRect: { x: 10, y: 20, width: 600, height: 400 },
    });
    const sourceFrame = document.elements.find(
      (element) => element.type === "frame",
    );
    const sourceImage = document.elements.find(
      (element) => element.type === "image",
    );

    const addFiles = vi.fn();
    const updateScene = vi.fn();
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElementsIncludingDeleted: () => [],
        getFiles: () => ({}),
        addFiles,
        updateScene,
      },
    };

    const result = insertScreenAnnotationDocument(document, {
      focus: false,
    });

    expect(result).toMatchObject({
      index: 0,
      bounds: { width: 600, height: 400 },
    });
    expect(result.frameId).not.toBe(sourceFrame.id);
    expect(result.elementIds).toHaveLength(2);
    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledTimes(1);

    const insertedElements = updateScene.mock.calls[0][0].elements;
    const insertedFrame = insertedElements.find(
      (element) => element.id === result.frameId,
    );
    const insertedImage = insertedElements.find(
      (element) => element.type === "image",
    );
    expect(insertedFrame.customData).toMatchObject({
      excalidrawZScreenAnnotation: true,
      screenAnnotationIndex: 0,
    });
    expect(insertedImage).toMatchObject({
      frameId: insertedFrame.id,
      locked: true,
    });
    expect(insertedImage.id).not.toBe(sourceImage.id);
    expect(addFiles.mock.calls[0][0][0]).toMatchObject({
      id: insertedImage.fileId,
      dataURL: IMAGE.dataURL,
      mimeType: IMAGE.mimeType,
    });
  });

  it("starts a new row after the configured number of variable-size frames", () => {
    window.excalidrawZHelper = {
      _api: {
        getAppState: () => ({
          ...getAppState(),
          zoom: { value: 1 },
        }),
        getSceneElements: () => [],
        getFiles: () => ({}),
      },
    };
    const document = createScreenAnnotationDocument({
      image: IMAGE,
      selectionRect: { x: 10, y: 20, width: 600, height: 400 },
    });
    const createExistingFrame = (index, x, width, height) =>
      newFrameElement({
        x,
        y: 100,
        width,
        height,
        customData: {
          excalidrawZScreenAnnotation: true,
          screenAnnotationIndex: index,
        },
      });
    const existingFrames = [
      createExistingFrame(0, 100, 100, 80),
      createExistingFrame(1, 240, 200, 90),
      createExistingFrame(2, 480, 80, 120),
      createExistingFrame(3, 600, 150, 70),
    ];
    const updateScene = vi.fn();
    window.excalidrawZHelper = {
      _api: {
        getAppState,
        getSceneElementsIncludingDeleted: () => existingFrames,
        getSceneElements: () => existingFrames,
        getFiles: () => ({}),
        addFiles: vi.fn(),
        updateScene,
      },
    };

    const result = insertScreenAnnotationDocument(document, {
      columns: 4,
      gap: 40,
      focus: false,
    });

    expect(result).toMatchObject({
      index: 4,
      bounds: { x: 100, y: 260, width: 600, height: 400 },
    });
    expect(updateScene).toHaveBeenCalledTimes(1);
  });

  it("rejects the removed flattened mode", () => {
    window.excalidrawZHelper = { _api: {} };

    expect(() =>
      createScreenAnnotationDocument({
        mode: "flattened",
        image: IMAGE,
        viewportRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ).toThrow(/raw.*bitmap.*flattened.*removed/);
  });
});
