import { sendMessage } from "./message";

const getAPI = () => window.excalidrawZHelper?._api;

/**
 * Bitmap values for `stats.panels` — match upstream STATS_PANELS.
 * Combine with bitwise OR. Example: GENERAL_STATS | ELEMENT_PROPERTIES = 3.
 */
export const STATS_PANELS = {
  GENERAL_STATS: 1,
  ELEMENT_PROPERTIES: 2,
};

/**
 * Canvas-level preferences that map directly to appState fields.
 *
 * Persistence (per upstream APP_STATE_STORAGE_CONF):
 *   - viewBackgroundColor, gridModeEnabled  → localStorage + .excalidraw file + collab
 *   - theme, zenModeEnabled, objectsSnapModeEnabled,
 *     isMidpointSnappingEnabled, bindingPreference,
 *     preferredSelectionTool, boxSelectionMode, stats   → localStorage only
 *   - viewModeEnabled                                   → NOT persisted (per-session)
 *
 * Note: tool lock is intentionally NOT included here — it lives on
 * `appState.activeTool.locked` and is already controllable via
 * `toggleToolbarAction("Q")`.
 *
 * Two related-but-distinct fields:
 *   - boxSelectionMode: 'contain' | 'overlap'
 *       Controls box-select behavior — whether elements must be FULLY
 *       contained in the selection rectangle ('contain'/Wrap) or just
 *       overlap it ('overlap'). This is the "Select on Wrap/Overlap"
 *       toggle in the main menu.
 *   - preferredSelectionTool: 'selection' | 'lasso'
 *       Which selection tool to use by default — the standard cursor
 *       ('selection') or the lasso ('lasso'). Setting this also activates
 *       the tool immediately, mirroring Excalidraw's UI behavior.
 */
const PREF_KEYS = [
  "theme",
  "viewBackgroundColor",
  "gridModeEnabled",
  "zenModeEnabled",
  "viewModeEnabled",
  "objectsSnapModeEnabled",
  "isMidpointSnappingEnabled",
  "bindingPreference",
  "boxSelectionMode",
  "preferredSelectionTool",
  "stats",
];

/**
 * Read the current canvas preferences from live appState.
 * Returns a flat snapshot. `preferredSelectionTool` is normalized to
 * its `type` string for convenience.
 *
 * @returns {object | null}
 */
export const getCanvasPreferences = () => {
  const api = getAPI();
  if (!api) {
    return null;
  }
  const s = api.getAppState();
  return {
    theme: s.theme,
    viewBackgroundColor: s.viewBackgroundColor,
    gridModeEnabled: !!s.gridModeEnabled,
    zenModeEnabled: !!s.zenModeEnabled,
    viewModeEnabled: !!s.viewModeEnabled,
    objectsSnapModeEnabled: !!s.objectsSnapModeEnabled,
    isMidpointSnappingEnabled: !!s.isMidpointSnappingEnabled,
    bindingPreference: s.bindingPreference,
    boxSelectionMode: s.boxSelectionMode,
    preferredSelectionTool: s.preferredSelectionTool?.type,
    stats: s.stats,
  };
};

/**
 * Update one or more canvas preferences. Only listed keys in `partial`
 * are touched.
 *
 * @param {{
 *   theme?: 'light' | 'dark',
 *   viewBackgroundColor?: string,
 *   gridModeEnabled?: boolean,
 *   zenModeEnabled?: boolean,
 *   viewModeEnabled?: boolean,
 *   objectsSnapModeEnabled?: boolean,
 *   isMidpointSnappingEnabled?: boolean,
 *   bindingPreference?: 'enabled' | 'disabled',
 *   boxSelectionMode?: 'contain' | 'overlap',
 *   preferredSelectionTool?: 'selection' | 'lasso',
 *   stats?: boolean | { open?: boolean, panels?: number },
 * }} partial
 * @returns {boolean} true if applied
 */
export const setCanvasPreferences = (partial) => {
  const api = getAPI();
  if (!api || !partial || typeof partial !== "object") {
    return false;
  }
  const current = api.getAppState();
  const update = {};

  if ("theme" in partial) update.theme = partial.theme;
  if ("viewBackgroundColor" in partial) update.viewBackgroundColor = partial.viewBackgroundColor;
  if ("gridModeEnabled" in partial) update.gridModeEnabled = !!partial.gridModeEnabled;
  if ("zenModeEnabled" in partial) update.zenModeEnabled = !!partial.zenModeEnabled;
  if ("viewModeEnabled" in partial) update.viewModeEnabled = !!partial.viewModeEnabled;
  if ("objectsSnapModeEnabled" in partial) update.objectsSnapModeEnabled = !!partial.objectsSnapModeEnabled;
  if ("isMidpointSnappingEnabled" in partial) update.isMidpointSnappingEnabled = !!partial.isMidpointSnappingEnabled;
  if ("bindingPreference" in partial) update.bindingPreference = partial.bindingPreference;
  if ("boxSelectionMode" in partial) update.boxSelectionMode = partial.boxSelectionMode;

  // `stats` is an object { open: boolean, panels: number } on appState.
  // Accept three input shapes for ergonomics:
  //   - boolean  → toggle visibility, preserve current panels selection
  //   - object   → merge into current { open?, panels? }
  //   - anything else is ignored
  if ("stats" in partial) {
    const currentStats = current.stats || {
      open: false,
      panels: STATS_PANELS.GENERAL_STATS | STATS_PANELS.ELEMENT_PROPERTIES,
    };
    if (typeof partial.stats === "boolean") {
      update.stats = { ...currentStats, open: partial.stats };
    } else if (partial.stats && typeof partial.stats === "object") {
      update.stats = { ...currentStats, ...partial.stats };
    }
  }

  // preferredSelectionTool is an object on appState, not a plain string.
  // We DO NOT push it through `update` — it requires a coordinated change
  // (setActiveTool + setAppState) that mirrors Excalidraw's own UI behavior;
  // pushing it via updateScene alone leaves activeTool out of sync, causing
  // the active tool to silently flip to the new preference at the next
  // "auto-revert" moment (e.g. after finishing a draw action).
  let preferredSelectionToolType;
  if ("preferredSelectionTool" in partial) {
    preferredSelectionToolType = partial.preferredSelectionTool;
  }

  if (Object.keys(update).length > 0) {
    api.updateScene({ appState: update });
  }

  if (
    preferredSelectionToolType === "selection" ||
    preferredSelectionToolType === "lasso"
  ) {
    // Mirror Excalidraw's own toolbar handler (Actions.tsx onToolChange):
    // immediately switch the active tool AND persist the preference.
    api.setActiveTool({ type: preferredSelectionToolType });
    api.updateScene({
      appState: {
        preferredSelectionTool: {
          type: preferredSelectionToolType,
          initialized: true,
        },
      },
    });
  }

  return true;
};

// ---------------------------------------------------------------------------
// Change tracking
// ---------------------------------------------------------------------------

let trackingStarted = false;
let lastSnapshot = null;

const isStatsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.open === b.open && a.panels === b.panels;
};

const diffPrefs = (prev, next) => {
  if (!prev) {
    return { ...next };
  }
  const diff = {};
  for (const key of PREF_KEYS) {
    if (key === "stats") {
      if (!isStatsEqual(prev[key], next[key])) {
        diff[key] = next[key];
      }
    } else if (prev[key] !== next[key]) {
      diff[key] = next[key];
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
};

/**
 * Start broadcasting canvas preference changes to the native client.
 * Emits `onCanvasPreferencesChanged` with only the diff (changed fields),
 * not the full snapshot — keeps bridge traffic low.
 *
 * Idempotent — calling more than once is a no-op.
 */
export const startCanvasPreferencesTracking = () => {
  if (trackingStarted) {
    return;
  }
  const api = getAPI();
  if (!api || typeof api.onChange !== "function") {
    return;
  }
  trackingStarted = true;
  lastSnapshot = getCanvasPreferences();

  api.onChange(() => {
    const next = getCanvasPreferences();
    if (!next) {
      return;
    }
    const diff = diffPrefs(lastSnapshot, next);
    if (diff) {
      lastSnapshot = next;
      sendMessage({
        event: "onCanvasPreferencesChanged",
        data: diff,
      });
    }
  });
};
