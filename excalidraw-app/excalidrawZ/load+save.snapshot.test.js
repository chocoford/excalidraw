import { MIME_TYPES } from "@excalidraw/common";
import * as blobData from "@excalidraw/excalidraw/data/blob";

import * as indexDB from "./indexdb+";
import {
  getCurrentFileSnapshot,
  loadFileBuffer,
  requestCurrentFileSaveStream,
} from "./load+save";

const createFile = (id) => ({
  id,
  dataURL: `data:image/png;base64,${id}`,
  mimeType: "image/png",
  created: 1,
});

const createAPI = ({ elements, files }) => ({
  getSceneElementsIncludingDeleted: vi.fn(() => elements),
  getAppState: vi.fn(() => ({ theme: "light" })),
  getFiles: vi.fn(() => files),
});

const decodeStreamDocument = (messages) => {
  const chunks = messages
    .filter((message) => message.event === "currentFileSaveStreamChunk")
    .sort((a, b) => a.data.index - b.data.index);
  const bytes = chunks.flatMap((message) =>
    Array.from(window.atob(message.data.base64), (char) => char.charCodeAt(0)),
  );
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
};

describe("current file snapshot files", () => {
  let originalCrypto;
  let getRelativeFilesMock;

  beforeEach(() => {
    originalCrypto = window.crypto;
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: {
        ...originalCrypto,
        subtle: {
          ...originalCrypto?.subtle,
          digest: vi.fn(async () => new Uint8Array(32).buffer),
        },
      },
    });
    getRelativeFilesMock = vi
      .spyOn(indexDB, "getRelativeFiles")
      .mockResolvedValue({});
  });

  afterEach(() => {
    getRelativeFilesMock.mockRestore();
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
    delete window.webkit;
    delete window.excalidrawZHelper;
  });

  it("uses a referenced file available only through the live API", async () => {
    const liveFile = createFile("live-file");
    const unreferencedFile = createFile("unreferenced-live");
    const elements = [{ type: "image", fileId: liveFile.id }];
    const api = createAPI({
      elements,
      files: {
        [liveFile.id]: liveFile,
        [unreferencedFile.id]: unreferencedFile,
      },
    });
    window.excalidrawZHelper = { _api: api };

    const snapshot = await getCurrentFileSnapshot();

    expect(snapshot.files).toEqual({ [liveFile.id]: liveFile });
    expect(getRelativeFilesMock).not.toHaveBeenCalled();
  });

  it("falls back to IndexedDB for files absent from the live API", async () => {
    const indexedDBFile = createFile("indexeddb-file");
    const elements = [
      { id: "shape", type: "rectangle" },
      { id: "image", type: "image", fileId: indexedDBFile.id },
    ];
    const api = createAPI({ elements, files: {} });
    window.excalidrawZHelper = { _api: api };
    getRelativeFilesMock.mockResolvedValue({
      [indexedDBFile.id]: indexedDBFile,
    });

    const snapshot = await getCurrentFileSnapshot();

    expect(snapshot.files).toEqual({
      [indexedDBFile.id]: indexedDBFile,
    });
    expect(getRelativeFilesMock).toHaveBeenCalledWith([elements[1]]);
  });

  it("streams live and fallback files while excluding unreferenced files", async () => {
    const liveFile = createFile("live-file");
    const indexedDBFile = createFile("indexeddb-file");
    const unreferencedLive = createFile("unreferenced-live");
    const unreferencedIndexedDB = createFile("unreferenced-indexeddb");
    const elements = [
      { type: "image", fileId: liveFile.id },
      { type: "image", fileId: indexedDBFile.id },
    ];
    const api = createAPI({
      elements,
      files: {
        [liveFile.id]: liveFile,
        [unreferencedLive.id]: unreferencedLive,
      },
    });
    const postMessage = vi.fn();
    window.webkit = {
      messageHandlers: {
        excalidrawZ: { postMessage },
      },
    };
    window.excalidrawZHelper = { _api: api };
    getRelativeFilesMock.mockResolvedValue({
      [indexedDBFile.id]: indexedDBFile,
      [unreferencedIndexedDB.id]: unreferencedIndexedDB,
    });

    expect(
      requestCurrentFileSaveStream({
        streamId: "save-stream",
        includeFiles: true,
      }),
    ).toEqual({ supported: true });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "currentFileSaveStreamFinished",
        }),
      );
    });

    const document = decodeStreamDocument(
      postMessage.mock.calls.map(([message]) => message),
    );
    expect(document.files).toEqual({
      [liveFile.id]: liveFile,
      [indexedDBFile.id]: indexedDBFile,
    });
    expect(getRelativeFilesMock).toHaveBeenCalledWith([elements[1]]);
  });
});

describe("loadFileBuffer completion", () => {
  const mockFileRestore = () => {
    vi.spyOn(indexDB, "getRelativeFiles").mockResolvedValue({});
    vi.spyOn(blobData, "normalizeFile").mockImplementation(
      async (file) => file,
    );
    vi.spyOn(blobData, "loadSceneOrLibraryFromBlob").mockResolvedValue({
      type: MIME_TYPES.excalidraw,
      data: {
        elements: [{ id: "loaded-element" }],
        appState: {},
        files: {},
      },
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.excalidrawZHelper;
  });

  it("waits for async scene application before updating the file identity", async () => {
    mockFileRestore();

    let resolveApplication;
    const application = new Promise((resolve) => {
      resolveApplication = resolve;
    });
    const applyFileScene = vi.fn(() => application);
    window.excalidrawZHelper = {
      currentFileId: "previous-file",
      _beginStateChangeSuppression: vi.fn(() => vi.fn()),
      _api: {
        getAppState: () => ({}),
        getSceneElementsIncludingDeleted: () => [],
        _excalidrawZ: { applyFileScene },
      },
    };

    let settled = false;
    const loadPromise = loadFileBuffer(
      new TextEncoder().encode("{}"),
      "next-file",
      "load-request",
    );
    loadPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => {
      expect(applyFileScene).toHaveBeenCalledTimes(1);
    });
    expect(settled).toBe(false);
    expect(window.excalidrawZHelper.currentFileId).toBe("previous-file");

    resolveApplication({ elementCount: 1 });
    await expect(loadPromise).resolves.toMatchObject({
      requestId: "load-request",
      fileId: "next-file",
      elementCount: 1,
    });
    expect(window.excalidrawZHelper.currentFileId).toBe("next-file");
  });

  it("does not let superseded async scene application finish the old load", async () => {
    mockFileRestore();

    let resolveFirstApplication;
    const firstApplication = new Promise((resolve) => {
      resolveFirstApplication = resolve;
    });
    const applyFileScene = vi
      .fn()
      .mockReturnValueOnce(firstApplication)
      .mockResolvedValueOnce({ elementCount: 1 });
    window.excalidrawZHelper = {
      currentFileId: "previous-file",
      _beginStateChangeSuppression: vi.fn(() => vi.fn()),
      _api: {
        getAppState: () => ({}),
        getSceneElementsIncludingDeleted: () => [],
        _excalidrawZ: { applyFileScene },
      },
    };

    const firstLoad = loadFileBuffer(
      new TextEncoder().encode("{}"),
      "first-file",
      "first-request",
    );
    await vi.waitFor(() => {
      expect(applyFileScene).toHaveBeenCalledTimes(1);
    });

    const secondLoad = loadFileBuffer(
      new TextEncoder().encode("{}"),
      "second-file",
      "second-request",
    );

    await expect(firstLoad).rejects.toMatchObject({
      status: "superseded",
      requestId: "first-request",
      fileId: "first-file",
    });
    await expect(secondLoad).resolves.toMatchObject({
      requestId: "second-request",
      fileId: "second-file",
      elementCount: 1,
    });
    expect(window.excalidrawZHelper.currentFileId).toBe("second-file");

    resolveFirstApplication({ elementCount: 1 });
  });
});
