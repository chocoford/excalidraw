import { vi } from "vitest";
import { resolvablePromise } from "@excalidraw/common";

import {
  newElementWith,
  newImageElement,
  newPdfElement,
  newTextElement,
} from "@excalidraw/element";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { zoomToFitBounds } from "@excalidraw/excalidraw/viewport";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { LocalData } from "../data/LocalData";

import {
  attachLocalViewer,
  getLocalViewerState,
  LocalViewerBridge,
  startLocalViewerSession,
  stopLocalViewerSession,
  waitForLocalViewerReady,
} from "./localViewer";
import { getRelativeFiles } from "./indexdb+";

vi.mock("./indexdb+", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./indexdb+")>()),
  getRelativeFiles: vi.fn(async () => ({})),
}));

class RelaySocket {
  static sockets: RelaySocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    RelaySocket.sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(data: string) {
    if (this.readyState !== 1) {
      throw new Error("closed");
    }
    this.sent.push(JSON.parse(data));
    const { pathname } = new URL(this.url);
    const room = pathname.slice(0, pathname.lastIndexOf("/"));
    for (const socket of RelaySocket.sockets) {
      const other = new URL(socket.url).pathname;
      if (
        socket !== this &&
        socket.readyState === 1 &&
        other.startsWith(`${room}/`) &&
        other !== pathname
      ) {
        socket.onmessage?.({ data });
      }
    }
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const text = (id = "text") => ({
  ...newTextElement({ x: 0, y: 0, text: "Hello" }),
  id,
});

const makeAPI = (
  initialElements: ExcalidrawElement[] = [],
  initialFiles: BinaryFiles = {},
) => {
  let elements = initialElements;
  let files = initialFiles;
  let appState = {
    ...getDefaultAppState(),
    width: 800,
    height: 600,
    offsetTop: 0,
    offsetLeft: 0,
    collaborators: new Map(),
    isLoading: false,
  } as AppState;
  const changes = new Set<Function>();
  const increments = new Set<Function>();
  const scrolls = new Set<Function>();
  const downs = new Set<Function>();
  const ups = new Set<Function>();
  const initialized = new Set<Function>();
  const subscribe = (set: Set<Function>) => (callback: Function) => {
    set.add(callback);
    return () => set.delete(callback);
  };
  const changed = () =>
    changes.forEach((callback) => callback(elements, appState, files));
  const sceneReady = vi.fn(async (_signal: AbortSignal) => {});
  const api = {
    isDestroyed: false,
    getSceneElementsIncludingDeleted: () => elements,
    getSceneElements: () => elements.filter((element) => !element.isDeleted),
    getFiles: () => files,
    getAppState: () => appState,
    onChange: subscribe(changes),
    onIncrement: subscribe(increments),
    onScrollChange: subscribe(scrolls),
    onPointerDown: subscribe(downs),
    onPointerUp: subscribe(ups),
    onEvent: (_name: string, callback: Function) =>
      subscribe(initialized)(callback),
    history: { clear: vi.fn() },
    _excalidrawZ: { waitForSceneReady: sceneReady },
    addFiles: vi.fn((incoming) => {
      for (const file of incoming) {
        if (!files[file.id]) {
          files = { ...files, [file.id]: file };
        }
      }
      changed();
    }),
    updateScene: vi.fn((data) => {
      if (data.elements) {
        elements = data.elements;
      }
      appState = {
        ...appState,
        ...data.appState,
        ...(data.collaborators ? { collaborators: data.collaborators } : {}),
      };
      changed();
    }),
    setViewport: vi.fn((options) => {
      appState = zoomToFitBounds({
        appState,
        bounds: options.target,
        fit: options.fit,
      }).appState;
      changed();
      scrolls.forEach((callback) =>
        callback(appState.scrollX, appState.scrollY, appState.zoom),
      );
    }),
  } as unknown as ExcalidrawImperativeAPI;
  return {
    api,
    changes,
    increments,
    scrolls,
    downs,
    ups,
    initialized,
    sceneReady,
    changed,
  };
};

const bridges: LocalViewerBridge[] = [];
const makeBridge = (data = makeAPI()) => {
  const container = document.createElement("div");
  document.body.append(container);
  const bridge = new LocalViewerBridge(data.api, container);
  bridges.push(bridge);
  return { ...data, bridge, container };
};
const options = (role: "editor" | "viewer", sessionId = "room") => ({
  role,
  sessionId,
  transportURL: `ws://127.0.0.1:8486/viewer/${sessionId}/${role}`,
});
const socket = () => RelaySocket.sockets.at(-1)!;
const start = async (bridge: LocalViewerBridge, role: "editor" | "viewer") => {
  const promise = bridge.start(options(role));
  socket().open();
  await promise;
};
const frame = async () => {
  await vi.advanceTimersByTimeAsync(20);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", RelaySocket);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 16),
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) =>
    window.clearTimeout(id),
  );
  RelaySocket.sockets = [];
  vi.mocked(getRelativeFiles).mockResolvedValue({});
});
afterEach(() => {
  for (const bridge of bridges.splice(0)) {
    if (bridge.session) {
      bridge.stop(bridge.session.options.sessionId);
    }
  }
  LocalData.resumeSave("localViewer");
  LocalData.discardPendingSave();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["editor", "viewer"] as const)(
  "initializes when %s connects first, then sends only changed elements",
  async (first) => {
    const editor = makeBridge(makeAPI([text("one"), text("two")]));
    const viewer = makeBridge();
    await start(first === "editor" ? editor.bridge : viewer.bridge, first);
    await frame();
    const second = first === "editor" ? "viewer" : "editor";
    await start(second === "editor" ? editor.bridge : viewer.bridge, second);
    await frame();
    expect(viewer.api.getSceneElements().map((element) => element.id)).toEqual([
      "one",
      "two",
    ]);
    const editorSocket = RelaySocket.sockets.find((item) =>
      item.url.endsWith("/editor"),
    )!;
    editor.api.updateScene({
      elements: [
        newElementWith(editor.api.getSceneElements()[0], { x: 123 }),
        editor.api.getSceneElements()[1],
      ],
    });
    await frame();
    expect(editorSocket.sent.at(-1).type).toBe("update");
    expect(
      editorSocket.sent
        .at(-1)
        .elements.map((element: ExcalidrawElement) => element.id),
    ).toEqual(["one"]);
    expect(viewer.api.getSceneElements()[0].x).toBe(123);
    editor.api.updateScene({
      elements: [
        newElementWith(editor.api.getSceneElementsIncludingDeleted()[0], {
          isDeleted: true,
        }),
        editor.api.getSceneElements()[1],
      ],
    });
    await frame();
    expect(viewer.api.getSceneElements().map((element) => element.id)).toEqual([
      "two",
    ]);
    editor.api.updateScene({ elements: [] });
    await frame();
    expect(editorSocket.sent.at(-1).type).toBe("snapshot");
    expect(viewer.api.getSceneElementsIncludingDeleted()).toEqual([]);
  },
);

it.each([{ elements: [] }, { elements: [text()] }])(
  "waits for snapshot resources and initial camera paint, including an empty scene (%#)",
  async ({ elements }) => {
    const editor = makeBridge(makeAPI(elements));
    const viewer = makeBridge();
    const paint = resolvablePromise<void>();
    viewer.sceneReady.mockReturnValue(paint);
    // Connection completes before a peer or snapshot is available.
    await start(viewer.bridge, "viewer");
    const settled = vi.fn();
    const ready = viewer.bridge.waitForReady("room").then(settled);
    await frame();
    expect(settled).not.toHaveBeenCalled();
    expect(viewer.sceneReady).not.toHaveBeenCalled();
    await expect(viewer.bridge.waitForReady("old-room")).rejects.toThrow(
      "sessionId",
    );
    await start(editor.bridge, "editor");
    await frame();
    await frame();
    expect(viewer.api.setViewport).toHaveBeenCalled();
    expect(viewer.sceneReady).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    paint.resolve();
    await ready;
    const calls = viewer.sceneReady.mock.calls.length;
    await expect(viewer.bridge.waitForReady("room")).resolves.toBeUndefined();
    expect(viewer.sceneReady).toHaveBeenCalledTimes(calls);
    await expect(editor.bridge.waitForReady("room")).rejects.toThrow();
    viewer.bridge.stop("room");
    await expect(viewer.bridge.waitForReady("room")).rejects.toThrow();
  },
);

it.each(["stop", "replace"])(
  "rejects all readiness waits on %s and ignores late paint completion",
  async (action) => {
    const editor = makeBridge(makeAPI([text()]));
    const viewer = makeBridge();
    const paint = resolvablePromise<void>();
    viewer.sceneReady.mockReturnValue(paint);
    await start(editor.bridge, "editor");
    await start(viewer.bridge, "viewer");
    const first = expect(viewer.bridge.waitForReady("room")).rejects.toThrow(
      "stopped or superseded",
    );
    const second = expect(viewer.bridge.waitForReady("room")).rejects.toThrow(
      "stopped or superseded",
    );
    await frame();
    await frame();
    const signal = viewer.sceneReady.mock.calls[0][0];
    if (action === "stop") {
      viewer.bridge.stop("room");
    } else {
      const starting = viewer.bridge.start(options("viewer", "new-room"));
      socket().open();
      await starting;
    }
    await first;
    await second;
    expect(signal.aborted).toBe(true);
    paint.resolve();
    await frame();
    await expect(viewer.bridge.waitForReady("room")).rejects.toThrow();
    if (action === "replace") {
      const settled = vi.fn();
      const ready = viewer.bridge.waitForReady("new-room").then(settled);
      await frame();
      expect(settled).not.toHaveBeenCalled();
      const rejected = expect(ready).rejects.toThrow();
      viewer.bridge.stop("new-room");
      await rejected;
    }
  },
);

it("waits for referenced files arriving after the initial snapshot", async () => {
  const fileId = "image" as FileId;
  const image = newImageElement({
    type: "image",
    x: 0,
    y: 0,
    fileId,
    width: 100,
    height: 100,
    status: "saved",
  });
  const editor = makeBridge(makeAPI([image]));
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  await start(viewer.bridge, "viewer");
  const settled = vi.fn();
  const ready = viewer.bridge.waitForReady("room").then(settled);
  await frame();
  await frame();
  expect(viewer.sceneReady).not.toHaveBeenCalled();
  expect(settled).not.toHaveBeenCalled();
  editor.api.addFiles([
    {
      id: fileId,
      created: 1,
      mimeType: "image/png",
      dataURL: "data:image/png;base64,AA==" as DataURL,
    },
  ]);
  await frame();
  await frame();
  await ready;
  expect(viewer.sceneReady).toHaveBeenCalledTimes(1);
});

it("retries readiness after reconnect and ignores the disconnected paint", async () => {
  const editor = makeBridge(makeAPI([text()]));
  const viewer = makeBridge();
  const oldPaint = resolvablePromise<void>();
  viewer.sceneReady.mockReturnValueOnce(oldPaint);
  await start(editor.bridge, "editor");
  await start(viewer.bridge, "viewer");
  const ready = viewer.bridge.waitForReady("room");
  await frame();
  await frame();
  const signal = viewer.sceneReady.mock.calls[0][0];
  socket().close();
  expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  socket().open();
  await frame();
  await frame();
  await ready;
  oldPaint.resolve();
  await frame();
  expect(viewer.sceneReady).toHaveBeenCalledTimes(2);
});

it("rejects readiness if resource hydration fails without failing start", async () => {
  const editor = makeBridge(makeAPI([text()]));
  const viewer = makeBridge();
  viewer.sceneReady.mockRejectedValue(new Error("Image decode failed"));
  await start(editor.bridge, "editor");
  await start(viewer.bridge, "viewer");
  const rejected = expect(viewer.bridge.waitForReady("room")).rejects.toThrow(
    "Image decode failed",
  );
  await frame();
  await frame();
  await rejected;
  await expect(viewer.bridge.waitForReady("room")).rejects.toThrow(
    "Image decode failed",
  );
});

it("rejects pending readiness even when stopped before any snapshot", async () => {
  const viewer = makeBridge();
  await start(viewer.bridge, "viewer");
  const rejected = expect(viewer.bridge.waitForReady("room")).rejects.toThrow();
  viewer.bridge.stop("room");
  await rejected;
});

it("exposes readiness through the attached helper and rejects after detach", async () => {
  const data = makeAPI();
  const detach = attachLocalViewer(data.api, document.createElement("div"));
  const starting = startLocalViewerSession(options("viewer"));
  socket().open();
  await starting;
  const rejected = expect(
    waitForLocalViewerReady({ sessionId: "room" }),
  ).rejects.toThrow();
  detach();
  await rejected;
  await expect(waitForLocalViewerReady({ sessionId: "room" })).rejects.toThrow(
    "not ready",
  );
});

it("resends a full initialization after either peer reconnects", async () => {
  const editor = makeBridge(makeAPI([text()]));
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  await start(viewer.bridge, "viewer");
  await frame();
  const staleMessage = socket().onmessage!;
  socket().close();
  editor.api.updateScene({ elements: [text("replacement")] });
  await vi.advanceTimersByTimeAsync(500);
  socket().open();
  await frame();
  expect(viewer.api.getSceneElements()[0].id).toBe("replacement");
  const editorSocket = RelaySocket.sockets.find((item) =>
    item.url.endsWith("/editor"),
  )!;
  editorSocket.close();
  await vi.advanceTimersByTimeAsync(500);
  socket().open();
  await frame();
  const current = socket().sent.find((message) => message.type === "snapshot");
  staleMessage({
    data: JSON.stringify({ ...current, elements: [text("stale")] }),
  });
  expect(viewer.api.getSceneElements()[0].id).toBe("replacement");
});

it("coalesces cameras, preserves an independent viewport, and refits after Viewer resize", async () => {
  const editor = makeBridge();
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await start(viewer.bridge, "viewer");
  await frame();
  await frame();
  vi.mocked(viewer.api.setViewport).mockClear();
  const sent = editorSocket.sent.length;
  editor.api.updateScene({
    appState: { scrollX: 10, zoom: { value: 2 as any } },
  });
  editor.api.updateScene({ appState: { scrollX: 30 } });
  await frame();
  expect(
    editorSocket.sent
      .slice(sent)
      .filter((message) => message.type === "camera"),
  ).toHaveLength(1);
  await frame();
  expect(viewer.api.getAppState().scrollX).toBe(30);
  viewer.bridge.setFollowing(false);
  viewer.api.updateScene({
    appState: { scrollX: 500, zoom: { value: 1 as any } },
  });
  editor.api.updateScene({
    elements: [text("still synced")],
    appState: { scrollX: 40 },
  });
  await frame();
  await frame();
  expect(viewer.api.getAppState().scrollX).toBe(500);
  expect(viewer.api.getSceneElements()[0].id).toBe("still synced");
  viewer.bridge.setFollowing(true);
  await frame();
  expect(viewer.api.getAppState().scrollX).toBe(40);
  viewer.api.updateScene({ appState: { width: 400, height: 300 } });
  await frame();
  expect(viewer.api.getAppState().zoom.value).toBe(1);
  const fits = vi.mocked(viewer.api.setViewport).mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  expect(viewer.api.setViewport).toHaveBeenCalledTimes(fits);
});

it("transfers referenced image/PDF files, falls back to IDB, and sends files arriving after elements", async () => {
  const imageId = "image" as FileId;
  const pdfId = "pdf" as FileId;
  const image = newImageElement({
    type: "image",
    fileId: imageId,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    status: "saved",
  });
  const pdf = newPdfElement({
    type: "pdf",
    fileId: pdfId,
    x: 100,
    y: 0,
    width: 100,
    height: 100,
    currentPage: 1,
    totalPages: 3,
    status: "saved",
  });
  const imageFile = {
    id: imageId,
    dataURL: "data:image/png;base64,AA==",
    mimeType: "image/png",
    created: 1,
  } as BinaryFiles[string];
  const pdfFile = {
    id: pdfId,
    dataURL: "data:application/pdf;base64,AA==",
    mimeType: "application/pdf",
    created: 1,
  } as BinaryFiles[string];
  vi.mocked(getRelativeFiles).mockResolvedValue({ [pdfId]: pdfFile } as any);
  const editor = makeBridge(
    makeAPI([image, pdf], { [imageId]: imageFile, unused: imageFile }),
  );
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await start(viewer.bridge, "viewer");
  await frame();
  const full = editorSocket.sent.find((message) => message.type === "snapshot");
  expect(Object.keys(full.files)).toEqual([imageId, pdfId]);
  const localPdfId = viewer.api
    .getSceneElements()
    .find((element) => element.type === "pdf")!.fileId!;
  expect(viewer.api.getFiles()[localPdfId]).toEqual({
    ...pdfFile,
    id: localPdfId,
  });
  const nextId = "late" as FileId;
  editor.api.updateScene({
    elements: [
      ...editor.api.getSceneElementsIncludingDeleted(),
      { ...image, id: "late-image", fileId: nextId },
    ],
  });
  await frame();
  editor.api.addFiles([{ ...imageFile, id: nextId }]);
  await frame();
  const localImageId = (
    viewer.api
      .getSceneElements()
      .find((element) => element.id === "late-image") as typeof image
  ).fileId!;
  expect(viewer.api.getFiles()[localImageId]).toBeDefined();
});

it("isolates incoming file ids from old documents and replaces changed binary data", async () => {
  const id = "collision" as FileId;
  const file = {
    id,
    dataURL: "data:image/png;base64,AA==",
    mimeType: "image/png",
    created: 1,
  } as BinaryFiles[string];
  const oldFile = {
    ...file,
    dataURL: "data:image/png;base64,AQ==",
  } as BinaryFiles[string];
  const image = newImageElement({
    type: "image",
    x: 0,
    y: 0,
    fileId: id,
    width: 100,
    height: 100,
    status: "saved",
  });
  const editor = makeBridge(makeAPI([image], { [id]: file }));
  const viewer = makeBridge(makeAPI([], { [id]: oldFile }));
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await start(viewer.bridge, "viewer");
  await frame();
  const localId = (viewer.api.getSceneElements()[0] as typeof image).fileId!;
  expect(localId).not.toBe(id);
  expect(viewer.api.getFiles()[id]).toEqual(oldFile);
  expect(viewer.api.getFiles()[localId].dataURL).toBe(file.dataURL);
  const message = editorSocket.sent.find((item) => item.type === "snapshot");
  const replacement = { ...file, dataURL: "data:image/png;base64,Ag==" };
  editorSocket.send(
    JSON.stringify({
      ...message,
      type: "update",
      sequence: 999,
      elements: [],
      files: { [id]: replacement },
    }),
  );
  const nextId = (viewer.api.getSceneElements()[0] as typeof image).fileId!;
  expect(nextId).not.toBe(localId);
  expect(viewer.api.getFiles()[nextId].dataURL).toBe(replacement.dataURL);
});

it("uses unlabeled collaborators for pointers and laser and clears only its own collaborator on stop", async () => {
  const editor = makeBridge();
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  await start(viewer.bridge, "viewer");
  await frame();
  viewer.api.updateScene({
    collaborators: new Map([["online" as any, { username: "online" }]]),
  });
  const payload = {
    pointer: { x: 1, y: 2, tool: "laser" as const },
    button: "down" as const,
    pointersMap: new Map(),
  };
  editor.bridge.pointer(payload);
  expect([...viewer.api.getAppState().collaborators.values()]).toContainEqual({
    pointer: payload.pointer,
    button: "down",
  });
  editor.bridge.pointer({
    ...payload,
    pointer: { ...payload.pointer, x: 8 },
    button: "up",
  });
  expect(
    [...viewer.api.getAppState().collaborators.values()].at(-1)?.button,
  ).toBe("up");
  editor.bridge.pointer({
    ...payload,
    pointer: { x: 10, y: 20, tool: "pointer" },
    button: "up",
  });
  expect([...viewer.api.getAppState().collaborators.values()].at(-1)).toEqual({
    pointer: { x: 10, y: 20, tool: "pointer" },
    button: "up",
  });
  expect(
    viewer.api.getAppState().collaborators.get("online" as any)?.username,
  ).toBe("online");
  viewer.bridge.stop("room");
  expect([...viewer.api.getAppState().collaborators.keys()]).toEqual([
    "online",
  ]);
  expect(
    viewer.changes.size + viewer.increments.size + viewer.scrolls.size,
  ).toBe(0);
});

it("sends pointers immediately and ignores them after disconnection or session stop", async () => {
  const editor = makeBridge();
  const viewer = makeBridge();
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await start(viewer.bridge, "viewer");
  await frame();
  const pointer = (x: number) =>
    editor.bridge.pointer({
      pointer: { x, y: 2, tool: "pointer" },
      button: "down",
      pointersMap: new Map(),
    });
  const pointerMessages = () =>
    editorSocket.sent.filter((message) => message.type === "pointer");
  const collaborator = () =>
    [...viewer.api.getAppState().collaborators.values()].at(-1);
  for (let x = 1; x <= 10; x++) {
    pointer(x);
    expect(collaborator()?.pointer?.x).toBe(x);
  }
  expect(pointerMessages()).toHaveLength(10);
  pointer(11);
  editor.ups.forEach((callback) =>
    callback({ type: "selection" }, {}, { clientX: 12, clientY: 2 }),
  );
  expect(collaborator()).toMatchObject({
    pointer: { x: 12, y: 2 },
    button: "up",
  });
  pointer(13);
  pointer(14);
  editor.container.dispatchEvent(new Event("pointerleave"));
  const cleared = pointerMessages().length;
  await vi.advanceTimersByTimeAsync(100);
  expect(pointerMessages()).toHaveLength(cleared);
  expect(collaborator()).toBeUndefined();
  pointer(15);
  window.dispatchEvent(new Event("blur"));
  expect(collaborator()).toBeUndefined();
  const oldSession = editor.bridge.session!;
  editorSocket.close();
  const disconnected = pointerMessages().length;
  pointer(16);
  expect(pointerMessages()).toHaveLength(disconnected);
  editor.bridge.stop("room");
  const stopped = pointerMessages().length;
  oldSession.pointer({
    pointer: { x: 17, y: 2, tool: "pointer" },
    button: "down",
    pointersMap: new Map(),
  });
  pointer(18);
  await vi.advanceTimersByTimeAsync(100);
  expect(pointerMessages()).toHaveLength(stopped);
  expect(collaborator()).toBeUndefined();
});

it("applies Viewer pointer preferences before the first pointer and restores the latest hidden position", async () => {
  const editor = makeBridge(makeAPI([text()]));
  const viewer = makeBridge();
  const pending = viewer.bridge.start({
    ...options("viewer"),
    pointerAppearance: { visible: false, color: "#123456" },
  });
  socket().open();
  await pending;
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await frame();
  const online = {
    username: "online",
    pointer: { x: 2, y: 3, tool: "pointer" as const },
  };
  viewer.api.updateScene({
    collaborators: new Map([["online" as any, online]]),
  });
  vi.mocked(viewer.api.history.clear).mockClear();
  const elements = viewer.api.getSceneElementsIncludingDeleted();
  const files = viewer.api.getFiles();
  const pointer = (x: number) =>
    editor.bridge.pointer({
      pointer: { x, y: 20, tool: "laser" },
      button: "down",
      pointersMap: new Map(),
    });
  const local = () =>
    [...viewer.api.getAppState().collaborators.entries()].find(
      ([id]) => id !== "online",
    )?.[1];
  pointer(1);
  pointer(10);
  expect(local()).toBeUndefined();
  viewer.bridge.setPointerAppearance({
    sessionId: "old",
    visible: true,
    color: null,
  });
  expect(local()).toBeUndefined();
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: "#123456",
  });
  expect(local()).toEqual({
    pointer: { x: 10, y: 20, tool: "laser", laserColor: "#123456" },
    button: "down",
    color: { background: "#123456", stroke: "#123456" },
  });
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: "#abcdef",
  });
  expect(local()?.pointer?.laserColor).toBe("#abcdef");
  expect(local()?.color?.background).toBe("#abcdef");
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: null,
  });
  expect(local()).toEqual({
    pointer: { x: 10, y: 20, tool: "laser" },
    button: "down",
  });
  expect(viewer.api.getSceneElementsIncludingDeleted()).toBe(elements);
  expect(viewer.api.getFiles()).toBe(files);
  expect(viewer.api.history.clear).not.toHaveBeenCalled();
  expect(viewer.api.getAppState().collaborators.get("online" as any)).toBe(
    online,
  );
  expect(
    editorSocket.sent.filter((message) => message.type === "pointer").at(-1)
      .pointer,
  ).toEqual({ x: 10, y: 20, tool: "laser" });
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: false,
    color: null,
  });
  editor.container.dispatchEvent(new Event("pointerleave"));
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: null,
  });
  expect(local()).toBeUndefined();
  viewer.bridge.stop("room");
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: "#123456",
  });
  expect(local()).toBeUndefined();
});

it("retains pointer preferences across full initialization and reconnect but resets them for a new session", async () => {
  const editor = makeBridge(makeAPI([text()]));
  const viewer = makeBridge();
  await start(viewer.bridge, "viewer");
  const viewerSocket = socket();
  await start(editor.bridge, "editor");
  await frame();
  const pointer = (x: number) =>
    editor.bridge.pointer({
      pointer: { x, y: 20, tool: "pointer" },
      button: "up",
      pointersMap: new Map(),
    });
  const local = () => [...viewer.api.getAppState().collaborators.values()][0];
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: false,
    color: "#123456",
  });
  pointer(10);
  editor.api.updateScene({ elements: [] });
  await frame();
  expect(local()).toBeUndefined();
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: "#123456",
  });
  expect(local()?.pointer?.x).toBe(10);
  viewerSocket.close();
  await vi.advanceTimersByTimeAsync(500);
  socket().open();
  await frame();
  pointer(20);
  expect(local()?.pointer).toEqual({
    x: 20,
    y: 20,
    tool: "pointer",
    laserColor: "#123456",
  });
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: false,
    color: "#123456",
  });
  const editorSocket = RelaySocket.sockets.find((item) =>
    item.url.endsWith("/editor"),
  )!;
  editorSocket.close();
  await vi.advanceTimersByTimeAsync(500);
  socket().open();
  await frame();
  pointer(30);
  expect(local()).toBeUndefined();
  viewer.bridge.setPointerAppearance({
    sessionId: "room",
    visible: true,
    color: "#123456",
  });
  expect(local()?.pointer?.x).toBe(30);
  await start(viewer.bridge, "viewer");
  await frame();
  pointer(40);
  expect(local()).toEqual({
    pointer: { x: 40, y: 20, tool: "pointer" },
    button: "up",
  });
});

it("ignores pointer appearance settings for editor roles", async () => {
  const editor = makeBridge();
  const pending = editor.bridge.start({
    ...options("editor"),
    pointerAppearance: { visible: false, color: "#123456" },
  });
  socket().open();
  await pending;
  const original = editor.api.getAppState().collaborators;
  vi.mocked(editor.api.updateScene).mockClear();
  editor.bridge.setPointerAppearance({
    sessionId: "room",
    visible: false,
    color: "#abcdef",
  });
  expect(editor.api.updateScene).not.toHaveBeenCalled();
  expect(editor.api.getAppState().collaborators).toBe(original);
});

it("replaces sessions, ignores late messages and late async file results, and rejects a pending replaced start", async () => {
  const viewer = makeBridge();
  const pending = viewer.bridge.start(options("viewer", "old"));
  const rejected = expect(pending).rejects.toThrow("superseded");
  const oldSocket = socket();
  const lateOpen = oldSocket.onopen!;
  const next = viewer.bridge.start(options("viewer", "new"));
  socket().open();
  await next;
  await rejected;
  lateOpen();
  viewer.bridge.stop("old");
  expect(viewer.bridge.session?.options.sessionId).toBe("new");
  expect(oldSocket.sent).toEqual([]);
  const editor = makeBridge(makeAPI([{ ...text(), fileId: "missing" } as any]));
  let resolve!: (files: {}) => void;
  vi.mocked(getRelativeFiles).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await start(editor.bridge, "editor");
  const editorSocket = socket();
  await frame();
  editor.bridge.stop("room");
  const sent = editorSocket.sent.length;
  resolve({});
  await frame();
  expect(editorSocket.sent).toHaveLength(sent);
});

it("rejects invalid URLs, connection errors, and real timeouts", async () => {
  const viewer = makeBridge();
  await expect(
    viewer.bridge.start({
      ...options("viewer"),
      transportURL: "https://example.test",
    }),
  ).rejects.toThrow("WebSocket URL");
  const error = viewer.bridge.start(options("viewer"));
  const rejected = expect(error).rejects.toThrow("connection failed");
  socket().onerror!();
  await rejected;
  expect(viewer.changes.size).toBe(0);
  const timeout = viewer.bridge.start(options("viewer"));
  const timedOut = expect(timeout).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10001);
  await timedOut;
  expect(socket().readyState).toBe(3);
});

it("waits for scene initialization before opening the transport", async () => {
  const viewer = makeBridge();
  viewer.api.updateScene({ appState: { isLoading: true } });
  const pending = viewer.bridge.start(options("viewer"));
  expect(RelaySocket.sockets).toHaveLength(0);
  viewer.api.updateScene({ appState: { isLoading: false } });
  viewer.initialized.forEach((callback) => callback(viewer.api));
  socket().open();
  await pending;
});

it("cancels pending browser saves for Viewer and preserves the editor save lock", async () => {
  const data = makeAPI([text()]);
  const container = document.createElement("div");
  const detach = attachLocalViewer(data.api, container);
  const saved = vi.fn();
  try {
    LocalData.save(
      data.api.getSceneElements(),
      data.api.getAppState(),
      {},
      saved,
    );
    const pending = startLocalViewerSession(options("viewer"));
    socket().open();
    await pending;
    expect(getLocalViewerState()).toMatchObject({
      isViewer: true,
      following: true,
    });
    LocalData.flushSave();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).not.toHaveBeenCalled();
    LocalData.pauseSave("collaboration");
    stopLocalViewerSession("room");
    expect(LocalData.isSavePaused()).toBe(true);
    const next = startLocalViewerSession(options("editor"));
    socket().open();
    await next;
    expect(getLocalViewerState().isViewer).toBe(false);
    expect(LocalData.isSavePaused()).toBe(true);
    LocalData.resumeSave("collaboration");
    expect(LocalData.isSavePaused()).toBe(false);
  } finally {
    detach();
    LocalData.resumeSave("collaboration");
  }
});
