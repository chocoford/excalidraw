import { sendMessage } from "./message";

const COLOR_PICKER_TYPES = new Set([
  "canvasBackground",
  "elementBackground",
  "elementStroke",
]);
const SRGB_HEX_COLOR = /^#[0-9a-f]{6}$/i;

let nativeEyeDropperEnabled = false;
let activeRequest = null;
let fallbackRequestId = 0;

const createRequestId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  fallbackRequestId += 1;
  return `native-eye-dropper-${Date.now()}-${fallbackRequestId}`;
};

const settleRequest = (request, result) => {
  if (activeRequest === request) {
    activeRequest = null;
  }
  request.resolve(result);
};

const cancelRequest = (request, reason, notifyHost = true) => {
  if (!request || activeRequest !== request) {
    return false;
  }

  if (notifyHost) {
    sendMessage({
      event: "cancelNativeEyeDropper",
      data: { requestId: request.requestId, reason },
    });
  }

  settleRequest(request, { cancelled: true, reason });
  return true;
};

export const setNativeEyeDropperEnabled = (enabled) => {
  nativeEyeDropperEnabled = enabled === true;

  if (!nativeEyeDropperEnabled) {
    cancelRequest(activeRequest, "disabled");
  }

  return { enabled: nativeEyeDropperEnabled };
};

export const getNativeEyeDropperEnabled = () => nativeEyeDropperEnabled;

export const requestNativeEyeDropper = ({ colorPickerType, theme } = {}) => {
  if (!nativeEyeDropperEnabled) {
    return null;
  }

  if (!COLOR_PICKER_TYPES.has(colorPickerType)) {
    console.warn(
      `[nativeEyeDropper] Unsupported colorPickerType: ${colorPickerType}`,
    );
    return null;
  }

  cancelRequest(activeRequest, "superseded");

  const requestId = createRequestId();
  let resolve;
  const promise = new Promise((resolveRequest) => {
    resolve = resolveRequest;
  });
  const request = { requestId, resolve };
  activeRequest = request;

  const sent = sendMessage({
    event: "requestNativeEyeDropper",
    data: { requestId, colorPickerType, theme },
  });

  if (!sent) {
    cancelRequest(request, "native-handler-unavailable", false);
    return null;
  }

  return {
    requestId,
    promise,
    cancel: (reason = "cancelled") => cancelRequest(request, reason),
  };
};

export const completeNativeEyeDropper = ({
  requestId,
  color,
  cancelled = false,
  altKey = false,
} = {}) => {
  const request = activeRequest;

  if (!request || request.requestId !== requestId) {
    return { accepted: false, reason: "request-not-found" };
  }

  if (cancelled) {
    settleRequest(request, { cancelled: true, reason: "host-cancelled" });
    return { accepted: true, cancelled: true };
  }

  if (typeof color !== "string" || !SRGB_HEX_COLOR.test(color)) {
    return { accepted: false, reason: "invalid-color" };
  }

  settleRequest(request, {
    cancelled: false,
    color: color.toLowerCase(),
    altKey: altKey === true,
  });

  return { accepted: true, cancelled: false };
};
