import { sendMessage } from "./message";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getAPI = () => window.excalidrawZHelper?._api;

let _idCounter = 0;
const newSessionId = () => `ai-cam-${++_idCounter}-${Date.now()}`;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const getCurrentCamera = () => {
  const api = getAPI();
  if (!api) {
    return { scrollX: 0, scrollY: 0, zoom: 1 };
  }
  const s = api.getAppState();
  return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value };
};

/**
 * Resolve a target descriptor into a scene-space bounding box
 * { minX, minY, maxX, maxY }.
 *
 * For element targets, uses Excalidraw's `getCommonBounds` which correctly
 * handles rotation, line/arrow points, freedraw, and other edge cases.
 * Falls back to naive calculation only if getCommonBounds is unavailable.
 */
const resolveTarget = (target) => {
  if (target.type === "box") {
    return {
      minX: target.minX,
      minY: target.minY,
      maxX: target.maxX,
      maxY: target.maxY,
    };
  }
  if (target.type === "elements") {
    const api = getAPI();
    if (!api) {
      return null;
    }
    const idSet = new Set(target.ids);
    const els = api.getSceneElements().filter((el) => idSet.has(el.id));
    if (els.length === 0) {
      return null;
    }

    // Use Excalidraw's proper bounds calculation (handles rotation, lines, etc.)
    const getCommonBounds = window.excalidrawZHelper?._getCommonBounds;
    if (getCommonBounds) {
      const [minX, minY, maxX, maxY] = getCommonBounds(els);
      return { minX, minY, maxX, maxY };
    }

    // Fallback: naive bounds (inaccurate for rotated/line elements)
    console.warn("[aiCamera] getCommonBounds not available, using naive bbox");
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of els) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return { minX, minY, maxX, maxY };
  }
  return null;
};

/**
 * Given a bounding box and the current appState, compute the desired camera
 * state { scrollX, scrollY, zoom } that would frame the box.
 *
 * zoomBehavior semantics (evaluated against **padded** viewport):
 *
 *   "preserve"      — Never change zoom. Only pan.
 *
 *   "gentle"        — Allow zoom-out when target exceeds safe area.
 *                     Never zoom-in beyond the zoom level at session start
 *                     or the current level (whichever is smaller).
 *                     May zoom out repeatedly across updates if the target
 *                     keeps growing.
 *
 *   "fitWhenNeeded" — Zoom out when target exceeds safe area, and zoom back
 *                     in (up to maxZoom) when target shrinks significantly.
 *                     This is the most adaptive mode.
 *
 * Evaluation order:
 *   1. Mode logic determines desiredZoom
 *   2. minZoom / maxZoom clamp is applied last
 *
 * safeAreaRatio is evaluated against the **padded** viewport (i.e. after
 * viewportPadding is subtracted).
 */
const computeDesiredCamera = (bbox, appState, opts) => {
  const padding =
    typeof opts.viewportPadding === "number"
      ? {
          top: opts.viewportPadding,
          right: opts.viewportPadding,
          bottom: opts.viewportPadding,
          left: opts.viewportPadding,
        }
      : opts.viewportPadding || { top: 60, right: 60, bottom: 60, left: 60 };

  const vpW = appState.width - padding.left - padding.right;
  const vpH = appState.height - padding.top - padding.bottom;
  if (vpW <= 0 || vpH <= 0) {
    return {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom.value,
    };
  }

  const bboxW = bbox.maxX - bbox.minX;
  const bboxH = bbox.maxY - bbox.minY;
  const bboxCX = (bbox.minX + bbox.maxX) / 2;
  const bboxCY = (bbox.minY + bbox.maxY) / 2;

  const currentZoom = appState.zoom.value;
  const minZoom = opts.minZoom ?? 0.1;
  const maxZoom = opts.maxZoom ?? 2;
  const safeAreaRatio = opts.safeAreaRatio ?? 0.85;
  const zoomBehavior = opts.zoomBehavior ?? "fitWhenNeeded";

  // Safe area = padded viewport * safeAreaRatio
  const safeW = vpW * safeAreaRatio;
  const safeH = vpH * safeAreaRatio;

  // How much screen space the bbox occupies at current zoom
  const bboxScreenW = bboxW * currentZoom;
  const bboxScreenH = bboxH * currentZoom;
  const exceedsSafeArea = bboxScreenW > safeW || bboxScreenH > safeH;

  let desiredZoom = currentZoom;

  if (zoomBehavior === "preserve") {
    // 1. Never change zoom
    desiredZoom = currentZoom;
  } else if (zoomBehavior === "gentle") {
    // 2. Only zoom-out when exceeding safe area; never zoom-in
    if (exceedsSafeArea) {
      const fitZoom = Math.min(vpW / bboxW, vpH / bboxH);
      desiredZoom = Math.min(fitZoom, currentZoom);
    }
    // Cap: never zoom in beyond session start zoom
    const startZoom = opts._startZoom ?? currentZoom;
    desiredZoom = Math.min(desiredZoom, startZoom);
  } else if (zoomBehavior === "fitWhenNeeded") {
    // 3. Zoom-out when exceeding safe area, zoom back in when target shrinks
    if (exceedsSafeArea) {
      desiredZoom = Math.min(vpW / bboxW, vpH / bboxH);
    }
    // else: keep current zoom (content fits in safe area)
  }

  // Clamp applied last
  desiredZoom = clamp(desiredZoom, minZoom, maxZoom);

  // Compute scroll to center the bbox within the padded viewport.
  //
  // Excalidraw's scene → screen mapping:
  //   screenX = (sceneX + scrollX) * zoom + offsetLeft
  //   screenY = (sceneY + scrollY) * zoom + offsetTop
  //
  // scrollX/scrollY are in SCENE units (not screen pixels), and zoom is
  // applied to the SUM (sceneX + scrollX).
  //
  // We want the bbox center to land at the padded viewport center (in screen
  // coordinates relative to the canvas origin, i.e. after offsetLeft/Top):
  //   vpCenterX_screen = padding.left + vpW / 2
  //   vpCenterY_screen = padding.top  + vpH / 2
  //
  // Solving: (bboxCX + scrollX) * zoom = vpCenterX_screen
  //   →  scrollX = vpCenterX_screen / zoom - bboxCX
  const vpCenterX = padding.left + vpW / 2;
  const vpCenterY = padding.top + vpH / 2;
  const scrollX = vpCenterX / desiredZoom - bboxCX;
  const scrollY = vpCenterY / desiredZoom - bboxCY;

  return { scrollX, scrollY, zoom: desiredZoom };
};

// ---------------------------------------------------------------------------
// Session Controller (singleton)
// ---------------------------------------------------------------------------

/** @type {ActiveSession | null} */
let activeSession = null;

/**
 * @typedef {{
 *   id: string,
 *   state: 'active' | 'settling' | 'interrupted' | 'ended',
 *   mode: 'follow' | 'reframe' | 'settle',
 *   target: object | null,
 *   resolvedBBox: object | null,
 *   opts: object,
 *   desiredCamera: { scrollX: number, scrollY: number, zoom: number } | null,
 *   rafId: number | null,
 *   settleTimer: number | null,
 *   interruptCleanup: (() => void) | null,
 *   startedAt: number,
 *   lastRevision: number,
 * }} ActiveSession
 */

// ---------------------------------------------------------------------------
// User Interruption Watcher
// ---------------------------------------------------------------------------

const INTERRUPT_EVENTS = [
  "wheel",
  "pointerdown",
  "gesturestart",
  "touchstart",
];

/**
 * Install interruption listeners on the canvas element.
 * Returns a cleanup function.
 */
const watchInterruption = (session) => {
  const canvas =
    document.querySelector(".excalidraw__canvas") ||
    document.querySelector(".excalidraw-container");
  if (!canvas) {
    console.warn("[aiCamera] canvas element not found for interruption watch");
    return () => {};
  }

  const handler = (event) => {
    // pen drawing is not a camera gesture
    if (event.type === "pointerdown" && event.pointerType === "pen") {
      return;
    }
    doInterrupt(session, "user_interaction", event.type);
  };

  for (const evt of INTERRUPT_EVENTS) {
    canvas.addEventListener(evt, handler, { capture: true, passive: true });
  }

  return () => {
    for (const evt of INTERRUPT_EVENTS) {
      canvas.removeEventListener(evt, handler, { capture: true });
    }
  };
};

// ---------------------------------------------------------------------------
// Animation Loop
// ---------------------------------------------------------------------------

const CLOSE_ENOUGH_PX = 0.5;
const CLOSE_ENOUGH_ZOOM = 0.001;

const isCloseEnough = (current, desired) => {
  return (
    Math.abs(current.scrollX - desired.scrollX) < CLOSE_ENOUGH_PX &&
    Math.abs(current.scrollY - desired.scrollY) < CLOSE_ENOUGH_PX &&
    Math.abs(current.zoom - desired.zoom) < CLOSE_ENOUGH_ZOOM
  );
};

let lastFrameTime = 0;

const tick = () => {
  if (
    !activeSession ||
    activeSession.state === "interrupted" ||
    activeSession.state === "ended"
  ) {
    return;
  }

  const api = getAPI();
  if (!api) {
    activeSession.rafId = requestAnimationFrame(tick);
    return;
  }

  const now = performance.now();
  const dt = lastFrameTime
    ? Math.min((now - lastFrameTime) / 1000, 0.1)
    : 0.016;
  lastFrameTime = now;

  const appState = api.getAppState();
  const desired = activeSession.desiredCamera;

  if (!desired) {
    activeSession.rafId = requestAnimationFrame(tick);
    return;
  }

  const current = {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
  };

  // Check if we've arrived
  if (isCloseEnough(current, desired)) {
    if (activeSession.state === "settling") {
      finishSession(activeSession, "settled");
      return;
    }
    // In follow mode, keep the loop running for future target updates
    activeSession.rafId = requestAnimationFrame(tick);
    return;
  }

  // Exponential decay interpolation
  const followRate =
    activeSession.state === "settling"
      ? (activeSession.opts.settleFollowRate ?? 2.5)
      : (activeSession.opts.followRate ?? 6);

  // Zoom lerps slower than pan to avoid jitter
  const panAlpha = 1 - Math.exp(-followRate * dt);
  const zoomAlpha = 1 - Math.exp(-followRate * 0.6 * dt);

  const nextScrollX =
    current.scrollX + (desired.scrollX - current.scrollX) * panAlpha;
  const nextScrollY =
    current.scrollY + (desired.scrollY - current.scrollY) * panAlpha;
  const nextZoom = current.zoom + (desired.zoom - current.zoom) * zoomAlpha;

  api.updateScene({
    appState: {
      scrollX: nextScrollX,
      scrollY: nextScrollY,
      zoom: { value: nextZoom },
    },
  });

  activeSession.rafId = requestAnimationFrame(tick);
};

// ---------------------------------------------------------------------------
// Session Lifecycle (internal)
// ---------------------------------------------------------------------------

const emitEvent = (event, data) => {
  sendMessage({ event, data });
};

/**
 * Internal interrupt handler — shared by user-interaction and host-override.
 */
const doInterrupt = (session, reason, eventType) => {
  if (session.state === "interrupted" || session.state === "ended") {
    return;
  }

  const stateBeforeInterrupt = session.state;
  const camera = getCurrentCamera();

  if (session.rafId != null) {
    cancelAnimationFrame(session.rafId);
    session.rafId = null;
  }
  if (session.settleTimer != null) {
    clearTimeout(session.settleTimer);
    session.settleTimer = null;
  }
  if (session.interruptCleanup) {
    session.interruptCleanup();
    session.interruptCleanup = null;
  }

  session.state = "interrupted";

  emitEvent("onAICameraSessionInterrupted", {
    sessionId: session.id,
    reason,
    eventType: eventType || null,
    stateBeforeInterrupt,
    camera,
  });

  emitEvent("onAICameraSessionEnded", {
    sessionId: session.id,
    reason: "interrupted",
  });

  if (activeSession === session) {
    activeSession = null;
  }
};

const finishSession = (session, reason) => {
  if (session.state === "ended") {
    return;
  }

  if (session.rafId != null) {
    cancelAnimationFrame(session.rafId);
    session.rafId = null;
  }
  if (session.settleTimer != null) {
    clearTimeout(session.settleTimer);
    session.settleTimer = null;
  }
  if (session.interruptCleanup) {
    session.interruptCleanup();
    session.interruptCleanup = null;
  }

  session.state = "ended";

  if (reason === "settled") {
    emitEvent("onAICameraSessionSettled", { sessionId: session.id });
  }

  emitEvent("onAICameraSessionEnded", {
    sessionId: session.id,
    reason: reason || "ended",
  });

  if (activeSession === session) {
    activeSession = null;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Begin a new AI camera session. Only one session can be active at a time;
 * calling this while a session is active will end the previous one.
 *
 * @param {{
 *   mode?: 'follow' | 'reframe',
 *   followRate?: number,
 *   zoomBehavior?: 'preserve' | 'gentle' | 'fitWhenNeeded',
 *   viewportPadding?: number | { top: number, right: number, bottom: number, left: number },
 *   minZoom?: number,
 *   maxZoom?: number,
 *   safeAreaRatio?: number,
 *   settleFollowRate?: number,
 * }} opts
 * @returns {{ sessionId: string, state: string, startedAt: number }}
 */
export const beginAICameraSession = (opts = {}) => {
  // End any existing session
  if (activeSession) {
    finishSession(activeSession, "superseded");
  }

  const id = newSessionId();
  const startedAt = Date.now();

  // Capture start zoom for "gentle" zoomBehavior
  const startCamera = getCurrentCamera();

  /** @type {ActiveSession} */
  const session = {
    id,
    state: "active",
    mode: opts.mode || "follow",
    target: null,
    resolvedBBox: null,
    opts: { ...opts, _startZoom: startCamera.zoom },
    desiredCamera: null,
    rafId: null,
    settleTimer: null,
    interruptCleanup: null,
    startedAt,
    lastRevision: -1,
  };

  activeSession = session;

  // Install user interruption watcher
  session.interruptCleanup = watchInterruption(session);

  // Start the animation loop
  lastFrameTime = 0;
  session.rafId = requestAnimationFrame(tick);

  emitEvent("onAICameraSessionStarted", { sessionId: id });

  return { sessionId: id, state: "active", startedAt };
};

/**
 * Update the camera target for an active session.
 * The camera will smoothly follow the new target.
 *
 * If `opts.revision` is provided, updates with a revision <= the last
 * accepted revision are silently ignored (stale-update protection).
 *
 * @param {string} sessionId
 * @param {{ type: 'box', minX: number, minY: number, maxX: number, maxY: number }
 *        | { type: 'elements', ids: string[] }} target
 * @param {{
 *   mode?: 'follow' | 'reframe',
 *   followRate?: number,
 *   zoomBehavior?: 'preserve' | 'gentle' | 'fitWhenNeeded',
 *   viewportPadding?: number | { top: number, right: number, bottom: number, left: number },
 *   minZoom?: number,
 *   maxZoom?: number,
 *   safeAreaRatio?: number,
 *   revision?: number,
 * }} opts
 * @returns {{ accepted: boolean, state?: string, reason?: string }}
 */
export const updateAICameraTarget = (sessionId, target, opts = {}) => {
  if (!activeSession || activeSession.id !== sessionId) {
    return { accepted: false, reason: "not_found" };
  }

  if (
    activeSession.state === "interrupted" ||
    activeSession.state === "ended"
  ) {
    return { accepted: false, reason: activeSession.state };
  }

  // Revision gate: ignore stale updates
  if (
    opts.revision !== undefined &&
    opts.revision <= activeSession.lastRevision
  ) {
    return { accepted: false, reason: "stale_revision" };
  }

  // If we were settling, cancel settle and go back to active
  if (activeSession.state === "settling") {
    activeSession.state = "active";
    if (activeSession.settleTimer != null) {
      clearTimeout(activeSession.settleTimer);
      activeSession.settleTimer = null;
    }
  }

  // Merge per-update options (preserve _startZoom from begin)
  const { revision, ...restOpts } = opts;
  const mergedOpts = { ...activeSession.opts, ...restOpts };
  activeSession.opts = mergedOpts;

  if (opts.mode) {
    activeSession.mode = opts.mode;
  }

  // Resolve target to bbox
  const bbox = resolveTarget(target);
  if (!bbox) {
    return { accepted: false, reason: "unresolvable_target" };
  }

  activeSession.target = target;
  activeSession.resolvedBBox = bbox;
  if (revision !== undefined) {
    activeSession.lastRevision = revision;
  }

  // Compute desired camera
  const api = getAPI();
  if (!api) {
    return { accepted: false, reason: "api_not_ready" };
  }
  const appState = api.getAppState();
  activeSession.desiredCamera = computeDesiredCamera(
    bbox,
    appState,
    mergedOpts,
  );

  emitEvent("onAICameraSessionUpdated", { sessionId });

  return { accepted: true, state: activeSession.state };
};

/**
 * End an AI camera session gracefully.
 *
 * Modes:
 *   "settle"    — slow-decay to final position, then emit settled + ended
 *   "immediate" — stop instantly, emit ended
 *
 * @param {string} sessionId
 * @param {{
 *   mode?: 'settle' | 'immediate',
 *   settleDuration?: number,
 * }} opts
 */
export const endAICameraSession = (sessionId, opts = {}) => {
  if (!activeSession || activeSession.id !== sessionId) {
    return;
  }

  if (
    activeSession.state === "interrupted" ||
    activeSession.state === "ended"
  ) {
    return;
  }

  const { mode = "settle", settleDuration = 800 } = opts;

  if (mode === "immediate") {
    finishSession(activeSession, "ended");
    return;
  }

  // Settle mode: slow down followRate and let the loop converge
  activeSession.state = "settling";
  activeSession.opts.settleFollowRate = 2.5;

  // Safety timeout: if settle hasn't converged, force end
  activeSession.settleTimer = setTimeout(() => {
    if (
      activeSession &&
      activeSession.id === sessionId &&
      activeSession.state === "settling"
    ) {
      finishSession(activeSession, "settled");
    }
  }, settleDuration + 500);
};

/**
 * Cancel an AI camera session immediately (no settle).
 *
 * @param {string} sessionId
 * @param {string} [reason]
 */
export const cancelAICameraSession = (sessionId, reason) => {
  if (!activeSession || activeSession.id !== sessionId) {
    return;
  }
  finishSession(activeSession, reason || "cancelled");
};

/**
 * Host-side explicit interrupt. Distinct from cancel/end — signals that the
 * host needs to take over camera control temporarily. The session becomes
 * unusable; a new beginAICameraSession is required to resume.
 *
 * @param {string} sessionId
 * @param {{ reason?: string }} opts
 */
export const interruptAICameraSession = (sessionId, opts = {}) => {
  if (!activeSession || activeSession.id !== sessionId) {
    return;
  }
  doInterrupt(activeSession, opts.reason || "host_override", null);
};

/**
 * Get current session info (read-only snapshot).
 *
 * Without arguments: returns the currently active session (if any).
 * With sessionId: returns info only if it matches the active session.
 *
 * @param {string} [sessionId]
 * @returns {{ id: string, state: string, mode: string, startedAt: number } | null}
 */
export const getAICameraSession = (sessionId) => {
  if (!activeSession) {
    return null;
  }
  if (sessionId !== undefined && activeSession.id !== sessionId) {
    return null;
  }
  return {
    id: activeSession.id,
    state: activeSession.state,
    mode: activeSession.mode,
    startedAt: activeSession.startedAt,
  };
};
