import React from "react";
import { vi } from "vitest";

import { resolvablePromise } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { act, render, unmountComponent } from "./test-utils";

describe("ExcalidrawZ file scene loading", () => {
  const h = window.h;

  beforeEach(() => {
    unmountComponent();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for image hydration and a final paint", async () => {
    await render(<Excalidraw />);

    const imageHydration = resolvablePromise<void>();
    const addNewImagesToImageCache = vi
      .spyOn(h.app as any, "addNewImagesToImageCache")
      .mockReturnValue(imageHydration);
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");

    let settled = false;
    let resultPromise!: Promise<{ elementCount: number }>;
    act(() => {
      resultPromise = (h.app.api as any)._excalidrawZ.applyFileScene({
        elements: [],
        appState: null,
        files: {},
      });
    });
    resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(addNewImagesToImageCache).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    imageHydration.resolve();
    await expect(resultPromise).resolves.toEqual({ elementCount: 0 });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
