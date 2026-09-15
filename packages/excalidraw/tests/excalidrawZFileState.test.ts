import { MIME_TYPES } from "@excalidraw/common";

import { getDefaultAppState } from "../appState";
import { loadFromBlob } from "../data/blob";
import { serializeAsJSON } from "../data/json";

import { API } from "./helpers/api";

import type { AppState, NormalizedZoomValue } from "../types";

describe("ExcalidrawZ file state after upstream sync", () => {
  const localAppState = {
    ...getDefaultAppState(),
    width: 800,
    height: 600,
    offsetTop: 0,
    offsetLeft: 0,
  };

  it.each([
    [0, 0],
    [-321.25, 123.75],
  ])(
    "round-trips saved camera (%s, %s) and drawing defaults",
    async (scrollX, scrollY) => {
      const fileState = {
        scrollX,
        scrollY,
        zoom: { value: 1.5 as NormalizedZoomValue },
        currentItemStrokeColor: "#123456",
        currentItemStickynoteStrokeColor: "#654321",
        currentItemStickynoteBackgroundColor: "#fedcba",
      };
      const json = serializeAsJSON(
        [API.createElement({ type: "rectangle", x: 2000, y: 1500 })],
        { ...localAppState, ...fileState, openMenu: "canvas" },
        {},
        "local",
      );
      expect(JSON.parse(json).appState).not.toHaveProperty("openMenu");
      const restored = await loadFromBlob(
        new Blob([json], { type: MIME_TYPES.json }),
        localAppState,
        null,
      );
      expect(restored.appState).toMatchObject(fileState);
    },
  );

  it.each(["scrollX", "scrollY"] as const)(
    "centers restored elements when saved %s is missing",
    async (missingAxis) => {
      const fileState: Partial<AppState> = { scrollX: 900, scrollY: 900 };
      delete fileState[missingAxis];
      const json = serializeAsJSON(
        [
          API.createElement({
            type: "rectangle",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
          }),
          API.createElement({
            type: "rectangle",
            x: 300,
            y: 300,
            width: 0,
            height: 0,
          }),
        ],
        fileState,
        {},
        "local",
      );
      const restored = await loadFromBlob(
        new Blob([json], { type: MIME_TYPES.json }),
        localAppState,
        null,
      );
      expect(
        restored.elements.filter((element) => !element.isDeleted),
      ).toHaveLength(1);
      expect(restored.appState).toMatchObject({ scrollX: 250, scrollY: 150 });
    },
  );
});
