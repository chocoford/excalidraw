import { vi } from "vitest";
import { resolvablePromise } from "@excalidraw/common";
import { newImageElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";

import { waitForExcalidrawZSceneReady } from "./sceneReady";

const makeApp = (image?: HTMLImageElement | Promise<HTMLImageElement>) => {
  const fileId = "image" as FileId;
  const forceUpdate = vi.fn((callback: () => void) => callback());
  const onLoaded = vi.fn();
  const loadSceneFonts = vi.fn(async () => [] as FontFace[]);
  const data = {
    api: { isDestroyed: false },
    ownerWindow: window,
    scene: {
      getNonDeletedElements: () =>
        image
          ? [
              newImageElement({
                type: "image",
                x: 0,
                y: 0,
                fileId,
                status: "saved",
              }),
            ]
          : [],
    },
    imageCache: new Map([[fileId, { image, mimeType: "image/png" }]]),
    fonts: { loadSceneFonts, onLoaded },
    forceUpdate,
  };
  return {
    app: data as unknown as Parameters<typeof waitForExcalidrawZSceneReady>[0],
    forceUpdate,
    loadSceneFonts,
    onLoaded,
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 16),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) =>
    window.clearTimeout(id),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("waits for pending images and fonts, then commit and two paint frames", async () => {
  const image = resolvablePromise<HTMLImageElement>();
  const fonts = resolvablePromise<FontFace[]>();
  const { app, forceUpdate, loadSceneFonts, onLoaded } = makeApp(image);
  loadSceneFonts.mockReturnValue(fonts);
  const settled = vi.fn();
  const ready = waitForExcalidrawZSceneReady(
    app,
    new AbortController().signal,
  ).then(settled);
  await vi.advanceTimersByTimeAsync(100);
  expect(forceUpdate).not.toHaveBeenCalled();
  image.resolve(document.createElement("img"));
  await vi.advanceTimersByTimeAsync(100);
  expect(forceUpdate).not.toHaveBeenCalled();
  fonts.resolve([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(onLoaded).toHaveBeenCalledWith([]);
  expect(forceUpdate).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(16);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(16);
  await ready;
  expect(settled).toHaveBeenCalledTimes(1);
});

it("cancels hydration waits without committing after a late resource load", async () => {
  const image = resolvablePromise<HTMLImageElement>();
  const { app, forceUpdate, onLoaded } = makeApp(image);
  const controller = new AbortController();
  const ready = waitForExcalidrawZSceneReady(app, controller.signal);
  const rejected = expect(ready).rejects.toThrow("stopped");
  controller.abort(new Error("stopped"));
  await rejected;
  image.resolve(document.createElement("img"));
  await vi.advanceTimersByTimeAsync(100);
  expect(forceUpdate).not.toHaveBeenCalled();
  expect(onLoaded).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels the pending paint frame and rejects instead of reporting ready", async () => {
  const { app } = makeApp();
  const controller = new AbortController();
  const ready = waitForExcalidrawZSceneReady(app, controller.signal);
  const rejected = expect(ready).rejects.toThrow("stopped");
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  controller.abort(new Error("stopped"));
  await rejected;
  expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("propagates image decode failure without scheduling a commit or paint", async () => {
  const image = resolvablePromise<HTMLImageElement>();
  const { app, forceUpdate } = makeApp(image);
  const rejected = expect(
    waitForExcalidrawZSceneReady(app, new AbortController().signal),
  ).rejects.toThrow("decode failed");
  image.reject(new Error("decode failed"));
  await rejected;
  expect(forceUpdate).not.toHaveBeenCalled();
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
});
