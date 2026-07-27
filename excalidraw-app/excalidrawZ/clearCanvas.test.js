import { clearCanvas } from "./clearCanvas";

const createAPI = () => {
  let elements = [{ id: "selected-shape", type: "rectangle" }];
  let appState = {
    activeTool: {
      type: "arrow",
      locked: true,
      customType: null,
      fromSelection: false,
      lastActiveTool: null,
    },
    currentItemStrokeColor: "#ff3b30",
    scrollX: 120,
    scrollY: -80,
    zoom: { value: 1.5 },
    viewBackgroundColor: "transparent",
    selectedElementIds: { "selected-shape": true },
    previousSelectedElementIds: { "selected-shape": true },
    selectedGroupIds: { group: true },
    selectedLinearElement: { elementId: "selected-shape" },
    editingGroupId: "group",
    editingTextElement: { id: "selected-shape" },
    selectionElement: { id: "selection" },
    selectedElementsAreBeingDragged: true,
    activeEmbeddable: { elementId: "selected-shape" },
  };

  return {
    getSceneElementsIncludingDeleted: vi.fn(() => elements),
    getAppState: vi.fn(() => appState),
    resetScene: vi.fn(),
    updateScene: vi.fn(({ elements: nextElements, appState: update }) => {
      if (nextElements) {
        elements = nextElements;
      }
      if (update) {
        appState = { ...appState, ...update };
      }
    }),
    history: {
      clear: vi.fn(),
    },
  };
};

describe("clearCanvas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.excalidrawZHelper;
  });

  it("clears elements and selection while preserving canvas state", async () => {
    const api = createAPI();
    const appStateBefore = api.getAppState();
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    window.excalidrawZHelper = { _api: api };

    const result = await clearCanvas({ clearHistory: true });

    expect(api.resetScene).not.toHaveBeenCalled();
    expect(api.updateScene).toHaveBeenCalledWith({
      elements: [],
      appState: {
        selectedElementIds: {},
        previousSelectedElementIds: {},
        selectedGroupIds: {},
        selectedLinearElement: null,
        editingGroupId: null,
        editingTextElement: null,
        selectionElement: null,
        selectedElementsAreBeingDragged: false,
        activeEmbeddable: null,
      },
      captureUpdate: "NEVER",
    });
    expect(api.getSceneElementsIncludingDeleted()).toEqual([]);
    expect(api.getAppState()).toMatchObject({
      activeTool: appStateBefore.activeTool,
      currentItemStrokeColor: "#ff3b30",
      scrollX: 120,
      scrollY: -80,
      zoom: { value: 1.5 },
      viewBackgroundColor: "transparent",
      selectedElementIds: {},
      previousSelectedElementIds: {},
      selectedGroupIds: {},
      selectedLinearElement: null,
      editingGroupId: null,
      editingTextElement: null,
      selectionElement: null,
      selectedElementsAreBeingDragged: false,
      activeEmbeddable: null,
    });
    expect(api.history.clear).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      cleared: true,
      historyCleared: true,
    });
  });
});
