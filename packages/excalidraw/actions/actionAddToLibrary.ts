import { LIBRARY_DISABLED_TYPES, randomId } from "@excalidraw/common";
import { deepCopyElement } from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";

import { register } from "./register";

const shouldUseExcalidrawZNativeLibrary = () =>
  typeof window !== "undefined" &&
  !!(window as any).webkit?.messageHandlers?.excalidrawZ;

export const actionAddToLibrary = register({
  name: "addToLibrary",
  trackEvent: { category: "element" },
  perform: (elements, appState, _, app) => {
    const selectedElements = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    for (const type of LIBRARY_DISABLED_TYPES) {
      if (selectedElements.some((element) => element.type === type)) {
        return {
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
          appState: {
            ...appState,
            errorMessage: t(`errors.libraryElementTypeError.${type}`),
          },
        };
      }
    }

    const theAddedLibraryItem = {
      id: randomId(),
      status: "unpublished" as const,
      elements: selectedElements.map(deepCopyElement),
      created: Date.now(),
    };
    const useNativeLibrary = shouldUseExcalidrawZNativeLibrary();
    if (useNativeLibrary) {
      (window as any).excalidrawZHelper.sendMessage({
        event: "addToLibrary",
        data: theAddedLibraryItem,
      });
    }

    return app.library
      .getLatestLibrary()
      .then((items) => {
        return app.library.setLibrary([
          ...(useNativeLibrary ? [] : [theAddedLibraryItem]),
          ...items,
        ]);
      })
      .then(() => {
        return {
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
          appState: {
            ...appState,
            toast: { message: t("toast.addedToLibrary") },
          },
        };
      })
      .catch((error) => {
        return {
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
          appState: {
            ...appState,
            errorMessage: error.message,
          },
        };
      });
  },
  label: "labels.addToLibrary",
});
