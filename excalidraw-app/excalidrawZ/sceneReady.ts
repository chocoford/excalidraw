import { getInitializedImageElements } from "@excalidraw/element";

import type App from "@excalidraw/excalidraw/components/App";

const abortable = <T>(promise: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      abort();
    }
  });

const nextFrame = (ownerWindow: Window, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      ownerWindow.cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    const frame = ownerWindow.requestAnimationFrame(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
    signal.addEventListener("abort", abort, { once: true });
  });

/** [ExcalidrawZ] Wait for existing resource loads, a React commit, and paint. */
export const waitForExcalidrawZSceneReady = async (
  app: Pick<
    App,
    "api" | "ownerWindow" | "scene" | "fonts" | "imageCache" | "forceUpdate"
  >,
  signal: AbortSignal,
) => {
  signal.throwIfAborted();
  const images = getInitializedImageElements(app.scene.getNonDeletedElements());
  const imageLoads = images.map((element) => {
    const image = app.imageCache.get(element.fileId)?.image;
    if (!image) {
      throw new Error(`Local Viewer image is not cached: ${element.fileId}`);
    }
    return image;
  });
  const [fonts] = await abortable(
    Promise.all([app.fonts.loadSceneFonts(), Promise.all(imageLoads)]),
    signal,
  );
  signal.throwIfAborted();
  if (app.api.isDestroyed) {
    throw new Error("Excalidraw API is destroyed");
  }
  app.fonts.onLoaded(fonts);
  await abortable(
    new Promise<void>((resolve) => app.forceUpdate(() => resolve())),
    signal,
  );
  // The commit's canvas effect can schedule a throttled draw in the next RAF.
  // The second RAF runs after that draw has had a browser paint opportunity.
  await nextFrame(app.ownerWindow, signal);
  await nextFrame(app.ownerWindow, signal);
};
