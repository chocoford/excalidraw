import {
  isCanvasTransparent,
  setCanvasTransparent,
} from "./canvasPreferences";
import { prepareCanvas } from "./prepareCanvas";

const createAPI = () => {
  let appState = {
    activeTool: { type: "selection" },
    viewBackgroundColor: "#ffffff",
  };

  const api = {
    getAppState: vi.fn(() => appState),
    resetScene: vi.fn(() => {
      appState = {
        activeTool: { type: "selection" },
        viewBackgroundColor: "#ffffff",
      };
    }),
    updateScene: vi.fn(({ appState: update }) => {
      appState = { ...appState, ...update };
    }),
    setActiveTool: vi.fn(({ type }) => {
      appState = { ...appState, activeTool: { type } };
    }),
    history: {
      clear: vi.fn(),
    },
  };

  return api;
};

describe("prepareCanvas", () => {
  afterEach(() => {
    if (window.excalidrawZHelper?._api) {
      setCanvasTransparent(false);
    }
    document.documentElement.classList.remove(
      "excalidrawz-transparent-canvas",
    );
    delete window.excalidrawZHelper;
  });

  it("prepares reset state, transparency, tool, and history", async () => {
    const api = createAPI();
    window.excalidrawZHelper = { _api: api };

    const result = await prepareCanvas({
      reset: true,
      clearHistory: true,
      transparent: true,
      activeTool: "arrow",
      appState: {
        gridModeEnabled: false,
        zenModeEnabled: true,
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        currentItemStrokeColor: "#ff3b30",
      },
    });

    expect(api.resetScene).toHaveBeenCalledWith({
      resetLoadingState: true,
    });
    expect(api.updateScene).toHaveBeenNthCalledWith(1, {
      appState: {
        gridModeEnabled: false,
        zenModeEnabled: true,
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        currentItemStrokeColor: "#ff3b30",
      },
      captureUpdate: "NEVER",
    });
    expect(api.updateScene).toHaveBeenNthCalledWith(2, {
      appState: { viewBackgroundColor: "transparent" },
      captureUpdate: "NEVER",
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow" });
    expect(api.history.clear).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      reset: true,
      historyCleared: true,
      transparent: true,
      activeTool: "arrow",
      appliedAppStateKeys: [
        "gridModeEnabled",
        "zenModeEnabled",
        "scrollX",
        "scrollY",
        "zoom",
        "currentItemStrokeColor",
      ],
    });
  });

  it("preserves transparent mode across a scene reset", async () => {
    const api = createAPI();
    window.excalidrawZHelper = { _api: api };
    setCanvasTransparent(true);
    api.updateScene.mockClear();

    await prepareCanvas({ reset: true });

    expect(isCanvasTransparent()).toBe(true);
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { viewBackgroundColor: "transparent" },
      captureUpdate: "NEVER",
    });
  });

  it("lets appState background win when transparency is disabled", async () => {
    const api = createAPI();
    window.excalidrawZHelper = { _api: api };
    setCanvasTransparent(true);
    api.updateScene.mockClear();

    await prepareCanvas({
      transparent: false,
      appState: { viewBackgroundColor: "#abcdef" },
    });

    expect(api.getAppState().viewBackgroundColor).toBe("#abcdef");
    expect(isCanvasTransparent()).toBe(false);
    expect(document.documentElement).not.toHaveClass(
      "excalidrawz-transparent-canvas",
    );
  });

  it("keeps consecutive asynchronous resets transparent", async () => {
    const api = createAPI();
    let appState = api.getAppState();
    api.getAppState.mockImplementation(() => appState);
    api.resetScene.mockImplementation(() => {
      window.requestAnimationFrame(() => {
        appState = {
          activeTool: { type: "selection" },
          viewBackgroundColor: "#ffffff",
        };
      });
    });
    api.updateScene.mockImplementation(({ appState: update }) => {
      appState = { ...appState, ...update };
    });
    api.setActiveTool.mockImplementation(({ type }) => {
      appState = { ...appState, activeTool: { type } };
    });
    window.excalidrawZHelper = { _api: api };

    const first = await prepareCanvas({
      reset: true,
      transparent: true,
    });
    expect(first.transparent).toBe(true);
    expect(api.getAppState().viewBackgroundColor).toBe("transparent");

    const second = await prepareCanvas({
      reset: true,
      transparent: true,
    });
    expect(second.transparent).toBe(true);
    expect(api.getAppState().viewBackgroundColor).toBe("transparent");
  });

  it("rejects unsupported tools before mutating the canvas", async () => {
    const api = createAPI();
    window.excalidrawZHelper = { _api: api };

    await expect(
      prepareCanvas({ reset: true, activeTool: "cursor" }),
    ).rejects.toThrow(
      "Unsupported Excalidraw active tool",
    );
    expect(api.resetScene).not.toHaveBeenCalled();
  });
});
