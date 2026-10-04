import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  deepCopyElement,
  getVisibleSceneBounds,
} from "@excalidraw/element";
import { reconcileElements } from "@excalidraw/excalidraw/data/reconcile";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  SocketId,
} from "@excalidraw/excalidraw/types";

import { LocalData } from "../data/LocalData";

import { getReferencedFiles } from "./referencedFiles";

export const localViewerProtocolVersion = 1;

export type LocalViewerPointerAppearance = {
  visible: boolean;
  color: string | null;
};

export type LocalViewerOptions = {
  role: "editor" | "viewer";
  sessionId: string;
  transportURL: string;
  followCamera?: boolean;
  pointerAppearance?: LocalViewerPointerAppearance;
};

type PointerUpdate = Parameters<
  NonNullable<ExcalidrawProps["onPointerUpdate"]>
>[0];
type Bounds = ReturnType<typeof getVisibleSceneBounds>;
type SyncedAppState = Pick<
  AppState,
  "viewBackgroundColor" | "theme" | "gridModeEnabled" | "gridSize" | "gridStep"
>;
type ViewerState = {
  isViewer: boolean;
  following: boolean;
  theme?: AppState["theme"];
};
type Message = {
  protocolVersion: 1;
  sessionId: string;
  role: LocalViewerOptions["role"];
  senderId: string;
  epoch: string;
  sequence: number;
  targetId?: string;
  type:
    | "hello"
    | "requestSnapshot"
    | "snapshot"
    | "update"
    | "camera"
    | "pointer"
    | "bye";
  elements?: readonly ExcalidrawElement[];
  files?: BinaryFiles;
  appState?: SyncedAppState;
  bounds?: Bounds;
  pointer?: Collaborator["pointer"] | null;
  button?: "up" | "down";
};

const sceneState = (state: AppState): SyncedAppState => ({
  viewBackgroundColor: state.viewBackgroundColor,
  theme: state.theme,
  gridModeEnabled: state.gridModeEnabled,
  gridSize: state.gridSize,
  gridStep: state.gridStep,
});

const elementVersion = (element: ExcalidrawElement) =>
  `${element.version}:${element.versionNonce}:${element.index}:${element.isDeleted}`;

/** One transport, independently owned by this WebView's Native helper. */
class LocalViewerSession {
  private socket: WebSocket | null = null;
  private epoch = "";
  private sequence = 0;
  private stopped = false;
  private opened = false;
  private reconnectAttempt = 0;
  private reconnectTimer = 0;
  private requestTimer = 0;
  private connectTimer = 0;
  private frame = 0;
  private sendingScene = false;
  private needsScene = false;
  private needsSnapshot = true;
  private snapshotTargets = new Set<string>();
  private versions = new Map<string, string>();
  private sentFiles: BinaryFiles = {};
  private fileIds = new Map<FileId, FileId>();
  private receivedFiles: BinaryFiles = {};
  private sentState = "";
  private sentBounds = "";
  private latestBounds: Bounds | null = null;
  private remoteEpoch: string | null = null;
  private retiredEpochs = new Set<string>();
  private remoteSequence = -1;
  private initialized = false;
  private viewerReady = false;
  private viewerReadyError: Error | null = null;
  private readyController: AbortController | null = null;
  private readyWaiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>();
  private collaboratorId: SocketId;
  private latestPointer: Pick<Collaborator, "pointer" | "button"> | null = null;
  private pointerAppearance: LocalViewerPointerAppearance;
  private subscriptions: (() => void)[] = [];
  private resolveStart!: () => void;
  private rejectStart!: (error: Error) => void;
  readonly ready = new Promise<void>((resolve, reject) => {
    this.resolveStart = resolve;
    this.rejectStart = reject;
  });
  private ownerWindow: Window & typeof globalThis;
  private senderId: string;

  constructor(
    private bridge: LocalViewerBridge,
    readonly options: LocalViewerOptions,
    private api: ExcalidrawImperativeAPI,
    private container: HTMLElement,
  ) {
    this.ownerWindow = container.ownerDocument.defaultView as Window &
      typeof globalThis;
    this.senderId = this.ownerWindow.crypto.randomUUID();
    this.collaboratorId =
      `excalidrawz-local-viewer:${this.senderId}` as SocketId;
    this.pointerAppearance = {
      visible: true,
      color: null,
      ...(options.role === "viewer" ? options.pointerAppearance : undefined),
    };
  }

  private isCurrent(socket = this.socket) {
    return (
      !this.stopped && this.bridge.session === this && socket === this.socket
    );
  }

  start() {
    const { api } = this;
    let dimensions = `${api.getAppState().width}:${api.getAppState().height}`;
    let lastElements: readonly ExcalidrawElement[] =
      api.getSceneElementsIncludingDeleted();
    let lastFiles = api.getFiles();
    let lastSceneState = JSON.stringify(sceneState(api.getAppState()));
    this.subscriptions.push(
      api.onIncrement((increment) => {
        if (
          this.options.role === "editor" &&
          Object.keys(increment.change.elements).length
        ) {
          this.needsScene = true;
          this.scheduleFrame();
        }
      }),
      api.onChange((elements, appState, files) => {
        const nextDimensions = `${appState.width}:${appState.height}`;
        const resized = dimensions !== nextDimensions;
        dimensions = nextDimensions;
        if (this.options.role === "editor") {
          // onIncrement excludes binary-file arrivals and some appState fields.
          const nextSceneState = JSON.stringify(sceneState(appState));
          if (
            elements !== lastElements ||
            files !== lastFiles ||
            nextSceneState !== lastSceneState
          ) {
            this.needsScene = true;
          }
          lastElements = elements;
          lastFiles = files;
          lastSceneState = nextSceneState;
          this.scheduleFrame();
        } else if (resized || (!this.viewerReady && !this.readyController)) {
          this.scheduleFrame();
        }
      }),
      api.onScrollChange(() => {
        if (this.options.role === "editor") {
          this.scheduleFrame();
        }
      }),
    );
    if (this.options.role === "editor") {
      this.subscriptions.push(
        api.onPointerDown((tool, state) =>
          this.send({
            type: "pointer",
            pointer: {
              ...state.origin,
              tool: tool.type === "laser" ? "laser" : "pointer",
            },
            button: "down",
          }),
        ),
        api.onPointerUp((tool, _state, event) =>
          this.send({
            type: "pointer",
            pointer: {
              ...viewportCoordsToSceneCoords(event, api.getAppState()),
              tool: tool.type === "laser" ? "laser" : "pointer",
            },
            button: "up",
          }),
        ),
      );
      const clearPointer = () =>
        this.send({ type: "pointer", pointer: null, button: "up" });
      this.container.addEventListener("pointerleave", clearPointer);
      this.ownerWindow.addEventListener("blur", clearPointer);
      this.subscriptions.push(() => {
        this.container.removeEventListener("pointerleave", clearPointer);
        this.ownerWindow.removeEventListener("blur", clearPointer);
      });
    }
    this.connectTimer = this.ownerWindow.setTimeout(() => {
      this.bridge.fail(this, new Error("Local Viewer connection timed out"));
    }, 10000);
    if (api.getAppState().isLoading) {
      this.subscriptions.push(
        api.onEvent("editor:initialize", () => {
          if (this.isCurrent()) {
            this.connect();
          }
        }),
      );
    } else {
      this.connect();
    }
  }

  private connect() {
    if (!this.isCurrent()) {
      return;
    }
    try {
      this.epoch = this.ownerWindow.crypto.randomUUID();
      this.sequence = 0;
      this.initialized = false;
      this.cancelReadyCheck();
      this.remoteSequence = -1;
      this.needsSnapshot = true;
      this.versions.clear();
      this.sentFiles = {};
      this.sentState = "";
      this.sentBounds = "";
      const socket = new this.ownerWindow.WebSocket(this.options.transportURL);
      this.socket = socket;
      this.ownerWindow.clearTimeout(this.connectTimer);
      this.connectTimer = this.ownerWindow.setTimeout(() => {
        if (!this.isCurrent(socket)) {
          return;
        }
        if (this.opened) {
          socket.close();
        } else {
          this.bridge.fail(
            this,
            new Error("Local Viewer connection timed out"),
          );
        }
      }, 10000);
      socket.onopen = () => {
        if (!this.isCurrent(socket)) {
          return;
        }
        this.reconnectAttempt = 0;
        this.send({ type: "hello" });
        if (this.options.role === "editor") {
          this.needsScene = true;
          this.scheduleFrame();
        } else {
          this.requestSnapshot();
        }
        this.opened = true;
        this.ownerWindow.clearTimeout(this.connectTimer);
        this.resolveStart();
      };
      socket.onmessage = (event) => {
        if (!this.isCurrent(socket) || typeof event.data !== "string") {
          return;
        }
        try {
          this.receive(JSON.parse(event.data));
        } catch (error) {
          console.warn("[localViewer] invalid message", error);
          if (this.options.role === "viewer") {
            this.requestSnapshot();
          }
        }
      };
      socket.onerror = () => {
        if (this.isCurrent(socket) && !this.opened) {
          this.bridge.fail(
            this,
            new Error("Local Viewer WebSocket connection failed"),
          );
        }
      };
      socket.onclose = () => {
        if (!this.isCurrent(socket)) {
          return;
        }
        this.clearCollaborator();
        this.initialized = false;
        this.cancelReadyCheck();
        this.ownerWindow.clearTimeout(this.requestTimer);
        if (!this.opened) {
          this.bridge.fail(
            this,
            new Error("Local Viewer WebSocket closed before connecting"),
          );
          return;
        }
        const delay = Math.min(500 * 2 ** this.reconnectAttempt++, 5000);
        this.reconnectTimer = this.ownerWindow.setTimeout(
          () => this.connect(),
          delay,
        );
      };
    } catch (error) {
      this.bridge.fail(
        this,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private send(message: Partial<Message> & Pick<Message, "type">) {
    if (!this.isCurrent() || this.socket?.readyState !== 1) {
      return false;
    }
    try {
      this.socket.send(
        JSON.stringify({
          ...message,
          protocolVersion: localViewerProtocolVersion,
          sessionId: this.options.sessionId,
          role: this.options.role,
          senderId: this.senderId,
          epoch: this.epoch,
          sequence: ++this.sequence,
        }),
      );
      return true;
    } catch {
      this.socket.close();
      return false;
    }
  }

  private requestSnapshot() {
    this.initialized = false;
    this.cancelReadyCheck();
    this.ownerWindow.clearTimeout(this.requestTimer);
    this.send({ type: "requestSnapshot" });
    this.requestTimer = this.ownerWindow.setTimeout(() => {
      if (this.isCurrent() && !this.initialized) {
        this.requestSnapshot();
      }
    }, 1000);
  }

  private receive(message: Message) {
    if (
      message?.protocolVersion !== localViewerProtocolVersion ||
      message.sessionId !== this.options.sessionId ||
      message.senderId === this.senderId ||
      typeof message.senderId !== "string" ||
      (message.targetId && message.targetId !== this.senderId) ||
      typeof message.epoch !== "string" ||
      !Number.isSafeInteger(message.sequence)
    ) {
      return;
    }
    if (this.options.role === "editor") {
      if (
        message.role === "viewer" &&
        (message.type === "hello" || message.type === "requestSnapshot")
      ) {
        this.snapshotTargets.add(message.senderId);
        this.needsScene = true;
        this.scheduleFrame();
      }
      return;
    }
    if (message.role !== "editor" || this.retiredEpochs.has(message.epoch)) {
      return;
    }
    if (message.type === "hello") {
      this.requestSnapshot();
      return;
    }
    if (message.type === "bye") {
      this.clearCollaborator();
      this.requestSnapshot();
      return;
    }
    if (
      message.type !== "snapshot" &&
      (!this.initialized || message.epoch !== this.remoteEpoch)
    ) {
      return;
    }
    if (
      message.epoch === this.remoteEpoch &&
      message.sequence <= this.remoteSequence
    ) {
      return;
    }
    if (message.type === "snapshot" || message.type === "update") {
      if (!Array.isArray(message.elements)) {
        throw new Error("Missing scene elements");
      }
      const full = message.type === "snapshot";
      if (full) {
        this.cancelReadyCheck();
      }
      // Files are immutable in Excalidraw's cache. Isolate them from a document
      // previously displayed in this WebView, including replacements of an id.
      const replacements = new Map<FileId, FileId>();
      let files: BinaryFiles[string][] = [];
      if (message.files) {
        files = Object.values(message.files).map((file) => {
          const previous = this.receivedFiles[file.id];
          if (
            previous &&
            (previous.dataURL !== file.dataURL ||
              previous.mimeType !== file.mimeType)
          ) {
            const oldId = this.localFileId(file.id);
            this.fileIds.delete(file.id);
            replacements.set(oldId, this.localFileId(file.id));
          }
          this.receivedFiles[file.id] = { ...file };
          return { ...file, id: this.localFileId(file.id) };
        });
      }
      const existing = full
        ? []
        : this.api.getSceneElementsIncludingDeleted().map((element) => {
            if (
              (element.type === "image" || element.type === "pdf") &&
              element.fileId &&
              replacements.has(element.fileId)
            ) {
              return { ...element, fileId: replacements.get(element.fileId)! };
            }
            return element;
          });
      const incoming = message.elements.map((element) => {
        if (
          (element.type === "image" || element.type === "pdf") &&
          element.fileId
        ) {
          return { ...element, fileId: this.localFileId(element.fileId) };
        }
        return element;
      });
      const restored = restoreElements(incoming, existing, {
        repairBindings: full,
      });
      const elements = full
        ? restored
        : reconcileElements(
            existing,
            restored as RemoteExcalidrawElement[],
            this.api.getAppState(),
          );
      this.api.updateScene({
        elements,
        appState: {
          ...(message.appState ?? sceneState(this.api.getAppState())),
          viewModeEnabled: true,
          selectedElementIds: {},
          previousSelectedElementIds: {},
          selectedGroupIds: {},
          editingTextElement: null,
          newElement: null,
          resizingElement: null,
          scrollConstraints: null,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      // addFiles starts decoding images referenced by the current scene.
      if (files.length) {
        this.api.addFiles(files);
      }
      if (message.appState?.theme) {
        this.bridge.setTheme(message.appState.theme);
      }
      if (full) {
        if (this.remoteEpoch && this.remoteEpoch !== message.epoch) {
          this.retiredEpochs.add(this.remoteEpoch);
        }
        if (this.remoteEpoch !== message.epoch) {
          this.clearCollaborator();
        }
        this.remoteEpoch = message.epoch;
        this.initialized = true;
        this.ownerWindow.clearTimeout(this.requestTimer);
        this.api.history.clear();
      }
    }
    if (message.bounds) {
      if (
        message.bounds.length !== 4 ||
        !message.bounds.every(Number.isFinite) ||
        message.bounds[2] <= message.bounds[0] ||
        message.bounds[3] <= message.bounds[1]
      ) {
        throw new Error("Invalid camera bounds");
      }
      this.latestBounds = message.bounds;
      this.scheduleFrame();
    }
    if (message.type === "pointer") {
      this.latestPointer = message.pointer
        ? { pointer: { ...message.pointer }, button: message.button ?? "up" }
        : null;
      this.applyPointerAppearance();
    }
    this.remoteSequence = message.sequence;
    if (message.type === "snapshot" || message.type === "update") {
      this.scheduleFrame();
    }
  }

  private localFileId(sourceId: FileId): FileId {
    let id = this.fileIds.get(sourceId);
    if (!id) {
      id = `local-viewer-${this.ownerWindow.crypto.randomUUID()}` as FileId;
      this.fileIds.set(sourceId, id);
    }
    return id;
  }

  private scheduleFrame() {
    if (!this.isCurrent() || this.frame) {
      return;
    }
    this.frame = this.ownerWindow.requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.isCurrent()) {
        return;
      }
      if (this.options.role === "viewer") {
        if (this.bridge.state.following && this.latestBounds) {
          this.api.setViewport({
            target: this.latestBounds,
            fit: "contain",
            animation: false,
            offsets: { ui: true },
          });
        }
        this.checkViewerReady();
      } else if (this.socket?.readyState === 1) {
        const bounds = getVisibleSceneBounds(this.api.getAppState());
        const signature = JSON.stringify(bounds);
        if (
          signature !== this.sentBounds &&
          bounds[2] > bounds[0] &&
          bounds[3] > bounds[1]
        ) {
          this.send({ type: "camera", bounds });
          this.sentBounds = signature;
        }
        if (this.needsScene && !this.sendingScene) {
          void this.sendScene();
        }
      }
    });
  }

  private async sendScene() {
    this.sendingScene = true;
    this.needsScene = false;
    const socket = this.socket;
    const targets = [...this.snapshotTargets];
    this.snapshotTargets.clear();
    try {
      const liveElements = this.api.getSceneElementsIncludingDeleted();
      const ids = new Set(liveElements.map((element) => element.id));
      const full =
        this.needsSnapshot ||
        [...this.versions.keys()].some((id) => !ids.has(id)) ||
        liveElements.some(
          (element) =>
            element.version <
            Number(this.versions.get(element.id)?.split(":")[0]),
        );
      const nextVersions = new Map(
        liveElements.map((element) => [element.id, elementVersion(element)]),
      );
      const changed = liveElements
        .filter(
          (element) =>
            this.versions.get(element.id) !== elementVersion(element),
        )
        .map(deepCopyElement);
      const elements =
        full || targets.length
          ? liveElements.map(deepCopyElement)
          : liveElements;
      const appState = sceneState(this.api.getAppState());
      const stateSignature = JSON.stringify(appState);
      const files = (await getReferencedFiles(
        this.api,
        elements,
      )) as BinaryFiles;
      if (!this.isCurrent(socket) || socket?.readyState !== 1) {
        return;
      }
      const changedFiles = Object.fromEntries(
        Object.entries(files).filter(([id, file]) => {
          const previous = this.sentFiles[id];
          return (
            !previous ||
            previous.dataURL !== file.dataURL ||
            previous.mimeType !== file.mimeType
          );
        }),
      );
      const bounds = getVisibleSceneBounds(this.api.getAppState());
      if (
        full ||
        changed.length ||
        Object.keys(changedFiles).length ||
        stateSignature !== this.sentState
      ) {
        this.send({
          type: full ? "snapshot" : "update",
          elements: full ? elements : changed,
          files: full ? files : changedFiles,
          appState,
          bounds,
        });
        this.versions = nextVersions;
        this.sentFiles = Object.fromEntries(
          Object.entries(files).map(([id, file]) => [id, { ...file }]),
        );
        this.sentState = stateSignature;
        this.needsSnapshot = false;
      }
      if (!full) {
        for (const targetId of targets) {
          this.send({
            type: "snapshot",
            targetId,
            elements,
            files,
            appState,
            bounds,
          });
        }
      }
    } catch (error) {
      console.warn("[localViewer] snapshot failed", error);
      this.needsSnapshot = true;
    } finally {
      this.sendingScene = false;
      if (this.isCurrent() && this.needsScene) {
        this.scheduleFrame();
      }
    }
  }

  pointer(payload: PointerUpdate) {
    if (this.options.role === "editor" && payload.pointersMap.size < 2) {
      this.send({
        type: "pointer",
        pointer: payload.pointer,
        button: payload.button,
      });
    }
  }

  followingChanged() {
    this.scheduleFrame();
  }

  waitForReady(): Promise<void> {
    if (!this.isCurrent() || this.options.role !== "viewer") {
      return Promise.reject(new Error("No active Local Viewer session"));
    }
    if (this.viewerReady) {
      return Promise.resolve();
    }
    if (this.viewerReadyError) {
      return Promise.reject(this.viewerReadyError);
    }
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.add({ resolve, reject });
      this.scheduleFrame();
    });
  }

  private cancelReadyCheck() {
    this.readyController?.abort(new Error("Local Viewer paint superseded"));
    this.readyController = null;
    this.viewerReadyError = null;
  }

  private checkViewerReady() {
    const state = this.api.getAppState();
    if (
      this.viewerReady ||
      this.viewerReadyError ||
      this.readyController ||
      !this.initialized ||
      state.isLoading ||
      state.width <= 0 ||
      state.height <= 0 ||
      (this.bridge.state.following && !this.latestBounds)
    ) {
      return;
    }
    const files = this.api.getFiles();
    if (
      this.api
        .getSceneElements()
        .some(
          (element) =>
            (element.type === "image" || element.type === "pdf") &&
            element.fileId &&
            !files[element.fileId],
        )
    ) {
      return;
    }
    const controller = new this.ownerWindow.AbortController();
    this.readyController = controller;
    const api = this.api as ExcalidrawImperativeAPI & {
      _excalidrawZ: {
        waitForSceneReady: (signal: AbortSignal) => Promise<void>;
      };
    };
    void Promise.resolve()
      .then(() => api._excalidrawZ.waitForSceneReady(controller.signal))
      .then(
        () => {
          if (!this.isCurrent() || this.readyController !== controller) {
            return;
          }
          this.readyController = null;
          const state = this.api.getAppState();
          if (state.width <= 0 || state.height <= 0) {
            return;
          }
          this.viewerReady = true;
          this.readyWaiters.forEach(({ resolve }) => resolve());
          this.readyWaiters.clear();
        },
        (error) => {
          if (!this.isCurrent() || this.readyController !== controller) {
            return;
          }
          this.readyController = null;
          this.viewerReadyError =
            error instanceof Error ? error : new Error(String(error));
          this.readyWaiters.forEach(({ reject }) =>
            reject(this.viewerReadyError!),
          );
          this.readyWaiters.clear();
        },
      );
  }

  setPointerAppearance(appearance: LocalViewerPointerAppearance) {
    if (!this.isCurrent() || this.options.role !== "viewer") {
      return;
    }
    this.pointerAppearance = { ...appearance };
    this.applyPointerAppearance();
  }

  private applyPointerAppearance() {
    const collaborators = new Map(this.api.getAppState().collaborators);
    if (this.pointerAppearance.visible && this.latestPointer?.pointer) {
      const { color } = this.pointerAppearance;
      collaborators.set(this.collaboratorId, {
        ...this.latestPointer,
        ...(color
          ? {
              pointer: { ...this.latestPointer.pointer, laserColor: color },
              color: { background: color, stroke: color },
            }
          : {}),
      });
    } else if (!collaborators.delete(this.collaboratorId)) {
      return;
    }
    this.api.updateScene({
      collaborators,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private clearCollaborator() {
    if (this.options.role !== "viewer") {
      return;
    }
    this.latestPointer = null;
    const collaborators = new Map(this.api.getAppState().collaborators);
    if (collaborators.delete(this.collaboratorId)) {
      this.api.updateScene({
        collaborators,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }

  stop(error = new Error("Local Viewer session stopped or superseded")) {
    this.send({ type: "bye" });
    this.stopped = true;
    this.cancelReadyCheck();
    this.readyWaiters.forEach(({ reject }) => reject(error));
    this.readyWaiters.clear();
    this.rejectStart(error);
    this.ownerWindow.clearTimeout(this.connectTimer);
    this.ownerWindow.clearTimeout(this.reconnectTimer);
    this.ownerWindow.clearTimeout(this.requestTimer);
    this.ownerWindow.cancelAnimationFrame(this.frame);
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
    if (this.socket) {
      this.socket.onopen =
        this.socket.onclose =
        this.socket.onerror =
        this.socket.onmessage =
          null;
      this.socket.close();
    }
    this.clearCollaborator();
  }
}

export class LocalViewerBridge {
  session: LocalViewerSession | null = null;
  state: ViewerState;
  constructor(
    private api: ExcalidrawImperativeAPI,
    private container: HTMLElement,
    private changed = () => {},
  ) {
    const isViewer =
      container.ownerDocument.defaultView?.__excalidrawZLocalViewer === true;
    this.state = { isViewer, following: isViewer };
  }

  private setState(state: ViewerState) {
    this.state = state;
    this.changed();
  }

  async start(options: LocalViewerOptions): Promise<void> {
    if (
      !options ||
      !["editor", "viewer"].includes(options.role) ||
      !options.sessionId?.trim()
    ) {
      throw new Error("Local Viewer requires a role and sessionId");
    }
    const url = new URL(options.transportURL);
    if (!["ws:", "wss:"].includes(url.protocol)) {
      throw new Error("Local Viewer requires a WebSocket URL");
    }
    if (this.api.isDestroyed) {
      throw new Error("Excalidraw API is destroyed");
    }
    this.session?.stop();
    const session = new LocalViewerSession(
      this,
      { ...options },
      this.api,
      this.container,
    );
    this.session = session;
    this.setState({
      isViewer: options.role === "viewer",
      following: options.role === "viewer" && options.followCamera !== false,
    });
    try {
      session.start();
      await session.ready;
    } catch (error) {
      if (this.session === session) {
        this.stop(options.sessionId);
      }
      throw error;
    }
  }

  fail(session: LocalViewerSession, error: Error) {
    if (this.session !== session) {
      return;
    }
    session.stop(error);
    this.session = null;
    this.setState({ ...this.state, following: false });
    console.warn("[localViewer] connection failed", error);
  }

  stop(sessionId: string) {
    if (this.session?.options.sessionId !== sessionId) {
      return;
    }
    this.session.stop();
    this.session = null;
    // A stopped Viewer keeps its read-only display and storage isolation.
    this.setState({ ...this.state, following: false });
  }

  setFollowing(enabled: boolean) {
    if (this.session?.options.role !== "viewer") {
      return;
    }
    this.setState({ ...this.state, following: !!enabled });
    this.session.followingChanged();
  }

  waitForReady(sessionId: string): Promise<void> {
    if (
      this.session?.options.role !== "viewer" ||
      this.session.options.sessionId !== sessionId
    ) {
      return Promise.reject(new Error("Local Viewer sessionId does not match"));
    }
    return this.session.waitForReady();
  }

  setTheme(theme: AppState["theme"]) {
    if (theme !== this.state.theme) {
      this.setState({ ...this.state, theme });
    }
  }

  setPointerAppearance(
    options: LocalViewerPointerAppearance & { sessionId: string },
  ) {
    if (
      this.session?.options.role !== "viewer" ||
      this.session.options.sessionId !== options.sessionId
    ) {
      return;
    }
    this.session.setPointerAppearance({
      visible: options.visible,
      color: options.color,
    });
  }

  pointer(payload: PointerUpdate) {
    this.session?.pointer(payload);
  }
}

let bridge: LocalViewerBridge | null = null;
const listeners = new Set<() => void>();
const emptyState: ViewerState = { isViewer: false, following: false };
const initialViewerState: ViewerState = { isViewer: true, following: true };
export const getLocalViewerState = () =>
  bridge?.state ??
  (window.__excalidrawZLocalViewer === true ? initialViewerState : emptyState);
export const isLocalViewer = () => getLocalViewerState().isViewer;
export const subscribeLocalViewer = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

export const attachLocalViewer = (
  api: ExcalidrawImperativeAPI,
  container: HTMLElement,
) => {
  const changed = () => {
    if (attached.state.isViewer) {
      LocalData.discardPendingSave();
      LocalData.pauseSave("localViewer");
    } else {
      LocalData.resumeSave("localViewer");
    }
    listeners.forEach((listener) => listener());
  };
  const attached = new LocalViewerBridge(api, container, changed);
  bridge = attached;
  changed();
  return () => {
    if (bridge !== attached) {
      return;
    }
    if (attached.session) {
      attached.stop(attached.session.options.sessionId);
    }
    bridge = null;
    LocalData.resumeSave("localViewer");
  };
};

export const startLocalViewerSession = async (options: LocalViewerOptions) => {
  if (!bridge) {
    throw new Error("Excalidraw API is not ready");
  }
  await bridge.start(options);
};
export const waitForLocalViewerReady = async (options: {
  sessionId: string;
}) => {
  if (!bridge) {
    throw new Error("Excalidraw API is not ready");
  }
  await bridge.waitForReady(options.sessionId);
};
export const setLocalViewerFollowing = (enabled: boolean) =>
  bridge?.setFollowing(enabled);
export const setLocalViewerPointerAppearance = (
  options: LocalViewerPointerAppearance & { sessionId: string },
) => bridge?.setPointerAppearance(options);
export const stopLocalViewerSession = (sessionId: string) =>
  bridge?.stop(sessionId);
export const broadcastLocalViewerPointer = (payload: PointerUpdate) =>
  bridge?.pointer(payload);
