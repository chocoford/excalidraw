import {
  completeNativeEyeDropper,
  getNativeEyeDropperEnabled,
  requestNativeEyeDropper,
  setNativeEyeDropperEnabled,
} from "./eyeDropper";

const installNativeMessageHandler = () => {
  const postMessage = vi.fn();
  window.webkit = {
    messageHandlers: {
      excalidrawZ: { postMessage },
    },
  };
  return postMessage;
};

describe("native eye dropper bridge", () => {
  afterEach(() => {
    setNativeEyeDropperEnabled(false);
    delete window.webkit;
    vi.restoreAllMocks();
  });

  it("uses the native bridge only after the host enables it", () => {
    const postMessage = installNativeMessageHandler();

    expect(
      requestNativeEyeDropper({
        colorPickerType: "elementStroke",
        theme: "light",
      }),
    ).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
    expect(getNativeEyeDropperEnabled()).toBe(false);
  });

  it("requests a native color and completes the matching request", async () => {
    const postMessage = installNativeMessageHandler();
    setNativeEyeDropperEnabled(true);

    const request = requestNativeEyeDropper({
      colorPickerType: "elementBackground",
      theme: "dark",
    });

    expect(request).not.toBeNull();
    expect(postMessage).toHaveBeenCalledWith({
      event: "requestNativeEyeDropper",
      data: {
        requestId: request.requestId,
        colorPickerType: "elementBackground",
        theme: "dark",
      },
    });

    expect(
      completeNativeEyeDropper({
        requestId: request.requestId,
        color: "#FF3B30",
      }),
    ).toEqual({ accepted: true, cancelled: false });
    await expect(request.promise).resolves.toEqual({
      cancelled: false,
      color: "#ff3b30",
      altKey: false,
    });
  });

  it("supports host cancellation and rejects stale or invalid results", async () => {
    installNativeMessageHandler();
    setNativeEyeDropperEnabled(true);

    const request = requestNativeEyeDropper({
      colorPickerType: "canvasBackground",
      theme: "light",
    });

    expect(
      completeNativeEyeDropper({
        requestId: "stale-request",
        color: "#ffffff",
      }),
    ).toEqual({ accepted: false, reason: "request-not-found" });
    expect(
      completeNativeEyeDropper({
        requestId: request.requestId,
        color: "red",
      }),
    ).toEqual({ accepted: false, reason: "invalid-color" });
    expect(
      completeNativeEyeDropper({
        requestId: request.requestId,
        cancelled: true,
      }),
    ).toEqual({ accepted: true, cancelled: true });
    await expect(request.promise).resolves.toEqual({
      cancelled: true,
      reason: "host-cancelled",
    });
  });

  it("notifies the host when Excalidraw cancels an active request", async () => {
    const postMessage = installNativeMessageHandler();
    setNativeEyeDropperEnabled(true);
    const request = requestNativeEyeDropper({
      colorPickerType: "elementStroke",
      theme: "light",
    });

    expect(request.cancel("unmounted")).toBe(true);
    expect(postMessage).toHaveBeenLastCalledWith({
      event: "cancelNativeEyeDropper",
      data: { requestId: request.requestId, reason: "unmounted" },
    });
    await expect(request.promise).resolves.toEqual({
      cancelled: true,
      reason: "unmounted",
    });
  });

  it("falls back to canvas sampling when the native handler is unavailable", () => {
    setNativeEyeDropperEnabled(true);

    expect(
      requestNativeEyeDropper({
        colorPickerType: "elementStroke",
        theme: "light",
      }),
    ).toBeNull();
  });
});
