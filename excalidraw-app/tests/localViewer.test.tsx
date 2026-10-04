import { vi } from "vitest";
import { getVisibleSceneBounds, newImageElement } from "@excalidraw/element";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard, Pointer } from "@excalidraw/excalidraw/tests/helpers/ui";
import { mockMultipleHTMLImageElements } from "@excalidraw/excalidraw/tests/helpers/mocks";
import {
  getClientColor,
  renderRemoteCursors,
} from "@excalidraw/excalidraw/clients";
import { AnimationController } from "@excalidraw/excalidraw/renderer/animation";
import {
  act,
  fireEvent,
  GlobalTestState,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import type { FileId } from "@excalidraw/element/types";
import type { InteractiveCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

import ExcalidrawApp from "../App";
import { LocalData } from "../data/LocalData";
import { getLocalViewerState } from "../excalidrawZ/localViewer";

import type { LocalViewerPointerAppearance } from "../excalidrawZ/localViewer";

class LocalSocket {
  static current: LocalSocket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {
    LocalSocket.current = this;
  }
  send(_data: string) {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const { h } = window;
const mouse = new Pointer("mouse");
const startViewer = async (
  followCamera = true,
  pointerAppearance?: LocalViewerPointerAppearance,
) => {
  await act(async () => {
    const pending = window.excalidrawZHelper!.startLocalViewerSession({
      role: "viewer",
      sessionId: "room",
      transportURL: "ws://127.0.0.1:8486/viewer/room/viewer",
      followCamera,
      pointerAppearance,
    });
    LocalSocket.current.readyState = 1;
    LocalSocket.current.onopen!();
    await pending;
  });
};

beforeEach(() => {
  localStorage.clear();
  mockBoundingClientRect();
  vi.stubGlobal("WebSocket", LocalSocket);
});

afterEach(() => {
  act(() => window.excalidrawZHelper?.stopLocalViewerSession("room"));
  AnimationController.reset();
  delete window.__excalidrawZLocalViewer;
  restoreOriginalGetBoundingClientRect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("applies pointer appearance to existing cursors and laser trails without another pointer move", async () => {
  await render(<ExcalidrawApp />);
  await startViewer(false, { visible: true, color: "#123456" });
  vi.useFakeTimers();
  let sequence = 0;
  const receive = (payload: object) =>
    act(() =>
      LocalSocket.current.onmessage!({
        data: JSON.stringify({
          protocolVersion: 1,
          sessionId: "room",
          role: "editor",
          senderId: "editor",
          epoch: "epoch",
          sequence: ++sequence,
          ...payload,
        }),
      }),
    );
  receive({ type: "snapshot", elements: [], files: {} });
  receive({
    type: "pointer",
    pointer: { x: 10, y: 10, tool: "laser" },
    button: "down",
  });
  receive({
    type: "pointer",
    pointer: { x: 30, y: 20, tool: "laser" },
    button: "down",
  });
  const svg = document.querySelector(".SVGLayer svg")!;
  const path = svg.querySelector("path")!;
  expect(path).not.toBeNull();
  const [socketId, collaborator] = [...h.state.collaborators.entries()][0];
  expect(collaborator.pointer?.laserColor).toBe("#123456");
  expect(path.getAttribute("fill")).toBe("#123456");
  const context = svg.ownerDocument.createElement("canvas").getContext("2d")!;
  const fills: string[] = [];
  vi.spyOn(context, "fill").mockImplementation(() => {
    fills.push(context.fillStyle.toString());
  });
  const renderCursor = () => {
    fills.length = 0;
    renderRemoteCursors({
      context,
      renderConfig: {
        remotePointerViewportCoords: new Map([[socketId, { x: 50, y: 50 }]]),
        remotePointerButton: new Map([[socketId, "up"]]),
        remotePointerUserStates: new Map(),
        remotePointerUsernames: new Map(),
      } as InteractiveCanvasRenderConfig,
      appState: h.state,
      normalizedWidth: 200,
      normalizedHeight: 100,
    });
  };
  renderCursor();
  expect(fills).toContain("#123456");
  const appearance = (visible: boolean, color: string | null) =>
    act(() =>
      window.excalidrawZHelper!.setLocalViewerPointerAppearance({
        sessionId: "room",
        visible,
        color,
      }),
    );
  appearance(true, "#abcdef");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16);
  });
  expect(svg.querySelector("path")).toBe(path);
  expect(path.getAttribute("fill")).toBe("#abcdef");
  renderCursor();
  expect(fills).toContain("#abcdef");
  appearance(true, null);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16);
  });
  const defaultColor = getClientColor(
    socketId,
    h.state.collaborators.get(socketId),
  );
  expect(path.getAttribute("fill")).toBe(defaultColor);
  context.fillStyle = defaultColor;
  const normalizedColor = context.fillStyle.toString();
  renderCursor();
  expect(fills).toContain(normalizedColor);
  appearance(false, "#654321");
  expect(h.state.collaborators.has(socketId)).toBe(false);
  expect(svg.querySelectorAll("path")).toHaveLength(0);
  receive({
    type: "pointer",
    pointer: { x: 50, y: 40, tool: "laser" },
    button: "down",
  });
  expect(svg.querySelectorAll("path")).toHaveLength(0);
  appearance(true, "#654321");
  expect(h.state.collaborators.get(socketId)?.pointer).toMatchObject({
    x: 50,
    y: 40,
  });
  expect(svg.querySelector("path")?.getAttribute("fill")).toBe("#654321");
  act(() => window.excalidrawZHelper!.stopLocalViewerSession("room"));
  expect(svg.querySelectorAll("path")).toHaveLength(0);
});

it("waits for the empty scene and its initial camera to paint through the helper", async () => {
  await render(<ExcalidrawApp />);
  await startViewer();
  const settled = vi.fn();
  const ready = window
    .excalidrawZHelper!.waitForLocalViewerReady({ sessionId: "room" })
    .then(settled);
  const paint = vi.spyOn(h.app.canvas.getContext("2d")!, "fillRect");
  const bounds = [100, 200, 500, 400];
  act(() =>
    LocalSocket.current.onmessage!({
      data: JSON.stringify({
        protocolVersion: 1,
        sessionId: "room",
        role: "editor",
        senderId: "editor",
        epoch: "epoch",
        sequence: 1,
        type: "snapshot",
        elements: [],
        files: {},
        bounds,
      }),
    }),
  );
  expect(settled).not.toHaveBeenCalled();
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  await ready;
  const visible = getVisibleSceneBounds(h.state);
  // UI-safe fitting can leave padding around the followed bounds.
  expect(visible[0]).toBeLessThanOrEqual(bounds[0]);
  expect(visible[1]).toBeLessThanOrEqual(bounds[1]);
  expect(visible[2]).toBeGreaterThanOrEqual(bounds[2]);
  expect(visible[3]).toBeGreaterThanOrEqual(bounds[3]);
  expect(paint).toHaveBeenCalled();
  await expect(
    window.excalidrawZHelper!.waitForLocalViewerReady({ sessionId: "room" }),
  ).resolves.toBeUndefined();
});

it("waits for in-flight image decoding and final canvas drawing, without decoding twice", async () => {
  await render(<ExcalidrawApp />);
  await startViewer();
  const pendingImages: HTMLImageElement[] = [];
  vi.stubGlobal(
    "Image",
    class extends Image {
      constructor() {
        super();
        Object.defineProperties(this, {
          naturalWidth: { value: 100 },
          naturalHeight: { value: 100 },
        });
        pendingImages.push(this);
      }
    },
  );
  const fileId = "image" as FileId;
  const image = newImageElement({
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fileId,
    status: "saved",
  });
  const api = h.app.api as typeof h.app.api & {
    _excalidrawZ: { waitForSceneReady: (signal: AbortSignal) => Promise<void> };
  };
  const sceneReady = vi.spyOn(api._excalidrawZ, "waitForSceneReady");
  const drawImage = vi.spyOn(h.app.canvas.getContext("2d")!, "drawImage");
  const settled = vi.fn();
  const ready = window
    .excalidrawZHelper!.waitForLocalViewerReady({ sessionId: "room" })
    .then(settled);
  act(() =>
    LocalSocket.current.onmessage!({
      data: JSON.stringify({
        protocolVersion: 1,
        sessionId: "room",
        role: "editor",
        senderId: "editor",
        epoch: "epoch",
        sequence: 1,
        type: "snapshot",
        elements: [image],
        bounds: [0, 0, 100, 100],
        files: {
          [fileId]: {
            id: fileId,
            created: 1,
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AA==",
          },
        },
      }),
    }),
  );
  await waitFor(() => expect(sceneReady).toHaveBeenCalledTimes(1));
  expect(pendingImages).toHaveLength(1);
  expect(settled).not.toHaveBeenCalled();
  act(() => pendingImages[0].onload?.call(pendingImages[0], new Event("load")));
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  await ready;
  expect(pendingImages).toHaveLength(1);
  expect(drawImage).toHaveBeenCalled();
  const localId = (h.elements[0] as typeof image).fileId!;
  expect(h.app.imageCache.get(localId)?.image).toBe(pendingImages[0]);
});

it("honors the Native Viewer bootstrap before any session starts", async () => {
  window.__excalidrawZLocalViewer = true;
  const save = vi.spyOn(LocalData, "save");
  await render(<ExcalidrawApp />, {
    localStorageData: {
      elements: [
        API.createElement({ type: "rectangle", id: "browser-document" }),
      ],
    },
  });
  expect(h.state.viewModeEnabled).toBe(true);
  expect(h.app.props.ui).toBe(false);
  expect(getLocalViewerState()).toEqual({ isViewer: true, following: true });
  expect(LocalData.isSavePaused()).toBe(true);
  expect(h.elements).toEqual([]);
  expect(save).not.toHaveBeenCalled();
});

it("enforces read-only input and enables independent navigation only when unfollowed", async () => {
  await render(<ExcalidrawApp />);
  API.updateScene({
    elements: [
      API.createElement({
        type: "rectangle",
        id: "rect",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
      }),
    ],
  });
  await startViewer();
  await waitFor(() => expect(h.state.viewModeEnabled).toBe(true));
  expect(window.excalidrawZHelper!.localViewerProtocolVersion).toBe(1);
  expect(LocalData.isSavePaused()).toBe(true);
  expect(h.app.props.ui).toBe(false);
  const { scrollX, scrollY, zoom } = h.state;
  fireEvent.wheel(GlobalTestState.interactiveCanvas, {
    deltaX: 30,
    deltaY: 40,
  });
  fireEvent.wheel(GlobalTestState.interactiveCanvas, {
    ctrlKey: true,
    deltaY: -100,
  });
  expect([h.state.scrollX, h.state.scrollY, h.state.zoom.value]).toEqual([
    scrollX,
    scrollY,
    zoom.value,
  ]);
  act(() => window.excalidrawZHelper!.setLocalViewerFollowing(false));
  await waitFor(() =>
    expect(h.app.props.interaction).toEqual({ enabled: { navigation: true } }),
  );
  fireEvent.wheel(GlobalTestState.interactiveCanvas, {
    deltaX: 30,
    deltaY: 40,
  });
  expect([h.state.scrollX, h.state.scrollY]).not.toEqual([scrollX, scrollY]);
  fireEvent.wheel(GlobalTestState.interactiveCanvas, {
    ctrlKey: true,
    deltaY: -100,
  });
  expect(h.state.zoom.value).toBeGreaterThan(zoom.value);
  mouse.clickAt(20, 20);
  Keyboard.keyPress("Delete");
  Keyboard.keyPress("r");
  mouse.downAt(100, 100);
  mouse.moveTo(140, 140);
  mouse.up();
  expect(
    h.elements
      .filter((element) => !element.isDeleted)
      .map((element) => element.id),
  ).toEqual(["rect"]);
  expect(h.state.selectedElementIds).toEqual({});
  act(() => window.excalidrawZHelper!.setLocalViewerFollowing(true));
  await waitFor(() =>
    expect(h.app.props.interaction).toEqual({ enabled: { navigation: false } }),
  );
});

it("initializes the scene without saving it and restores normal editor behavior on role replacement", async () => {
  await render(<ExcalidrawApp />);
  const save = vi.spyOn(LocalData, "save");
  await startViewer(false);
  const remote = API.createElement({
    type: "rectangle",
    id: "remote",
    width: 100,
    height: 100,
  });
  act(() =>
    LocalSocket.current.onmessage!({
      data: JSON.stringify({
        protocolVersion: 1,
        sessionId: "room",
        role: "editor",
        senderId: "remote-editor",
        epoch: "epoch",
        sequence: 1,
        type: "snapshot",
        elements: [remote],
        files: {},
        appState: {
          viewBackgroundColor: "#abcdef",
          theme: "dark",
          gridModeEnabled: false,
          gridSize: 20,
          gridStep: 5,
        },
        bounds: [0, 0, 800, 600],
      }),
    }),
  );
  await waitFor(() => expect(h.elements[0]?.id).toBe("remote"));
  expect(h.state.theme).toBe("dark");
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    const pending = window.excalidrawZHelper!.startLocalViewerSession({
      role: "editor",
      sessionId: "room",
      transportURL: "ws://127.0.0.1:8486/viewer/room/editor",
    });
    LocalSocket.current.readyState = 1;
    LocalSocket.current.onopen!();
    await pending;
  });
  await waitFor(() => expect(h.state.viewModeEnabled).toBe(false));
  expect(getLocalViewerState().isViewer).toBe(false);
  expect(LocalData.isSavePaused()).toBe(false);
  API.updateScene({ elements: [] });
  expect(save).toHaveBeenCalled();
});

it("starts decoding incoming images against the newly applied scene", async () => {
  await render(<ExcalidrawApp />);
  mockMultipleHTMLImageElements([[100, 100]]);
  await startViewer(false);
  const fileId = "image" as FileId;
  const image = newImageElement({
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fileId,
    status: "saved",
  });
  const decode = vi.spyOn(h.app as any, "addNewImagesToImageCache");
  act(() =>
    LocalSocket.current.onmessage!({
      data: JSON.stringify({
        protocolVersion: 1,
        sessionId: "room",
        role: "editor",
        senderId: "editor",
        epoch: "epoch",
        sequence: 1,
        type: "snapshot",
        elements: [image],
        files: {
          [fileId]: {
            id: fileId,
            created: 1,
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AA==",
          },
        },
      }),
    }),
  );
  expect(decode).toHaveBeenCalled();
  const localId = (h.elements[0] as typeof image).fileId!;
  // The immediate addFiles decode, not the delayed renderer failsafe.
  expect(h.app.imageCache.has(localId)).toBe(true);
  await waitFor(() =>
    expect(h.app.imageCache.get(localId)?.image).not.toBeInstanceOf(Promise),
  );
});
