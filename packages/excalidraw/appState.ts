import {
  COLOR_PALETTE,
  ARROW_TYPE,
  DEFAULT_ELEMENT_PROPS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_ELEMENT_STROKE_WIDTH_KEY,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_GRID_SIZE,
  EXPORT_SCALES,
  STATS_PANELS,
  THEME,
  DEFAULT_GRID_STEP,
  isTestEnv,
} from "@excalidraw/common";

import type { AppState, NormalizedZoomValue } from "./types";

const defaultExportScale = EXPORT_SCALES.includes(devicePixelRatio)
  ? devicePixelRatio
  : 1;

export const getDefaultAppState = (): Omit<
  AppState,
  "offsetTop" | "offsetLeft" | "width" | "height"
> => {
  return {
    showWelcomeScreen: false,
    theme: THEME.LIGHT,
    collaborators: new Map(),
    currentItemBackgroundColor: DEFAULT_ELEMENT_PROPS.backgroundColor,
    currentItemEndArrowhead: "arrow",
    currentItemFillStyle: DEFAULT_ELEMENT_PROPS.fillStyle,
    currentItemFontFamily: DEFAULT_FONT_FAMILY,
    currentItemFontSize: DEFAULT_FONT_SIZE,
    currentItemOpacity: DEFAULT_ELEMENT_PROPS.opacity,
    currentItemRoughness: DEFAULT_ELEMENT_PROPS.roughness,
    currentItemStrokeVariability: "constant",
    currentItemStartArrowhead: null,
    currentItemStrokeColor: DEFAULT_ELEMENT_PROPS.strokeColor,
    currentItemRoundness: isTestEnv() ? "sharp" : "round",
    currentItemArrowType: ARROW_TYPE.round,
    currentItemStrokeStyle: DEFAULT_ELEMENT_PROPS.strokeStyle,
    currentItemStrokeWidthKey: DEFAULT_ELEMENT_STROKE_WIDTH_KEY,
    currentItemTextAlign: DEFAULT_TEXT_ALIGN,
    currentHoveredFontFamily: null,
    cursorButton: "up",
    activeEmbeddable: null,
    newElement: null,
    editingTextElement: null,
    editingGroupId: null,
    activeTool: {
      type: "selection",
      customType: null,
      locked: DEFAULT_ELEMENT_PROPS.locked,
      fromSelection: false,
      lastActiveTool: null,
    },
    preferredSelectionTool: {
      type: "selection",
      initialized: false,
    },
    penMode: false,
    penDetected: false,
    errorMessage: null,
    exportBackground: true,
    exportScale: defaultExportScale,
    exportEmbedScene: false,
    exportWithDarkMode: false,
    fileHandle: null,
    gridSize: DEFAULT_GRID_SIZE,
    gridStep: DEFAULT_GRID_STEP,
    gridModeEnabled: false,
    isBindingEnabled: true,
    bindingPreference: "enabled",
    isMidpointSnappingEnabled: true,
    defaultSidebarDockedPreference: false,
    isLoading: false,
    isResizing: false,
    isRotating: false,
    lastPointerDownWith: "mouse",
    multiElement: null,
    name: null,
    contextMenu: null,
    openMenu: null,
    openPopup: null,
    openSidebar: null,
    openDialog: null,
    previousSelectedElementIds: {},
    resizingElement: null,
    scrolledOutside: false,
    scrollX: 0,
    scrollY: 0,
    selectedElementIds: {},
    hoveredElementIds: {},
    selectedGroupIds: {},
    selectedElementsAreBeingDragged: false,
    selectionElement: null,
    shouldCacheIgnoreZoom: false,
    stats: {
      open: false,
      panels: STATS_PANELS.generalStats | STATS_PANELS.elementProperties,
    },
    suggestedBinding: null,
    frameRendering: { enabled: true, clip: true, name: true, outline: true },
    frameToHighlight: null,
    editingFrame: null,
    elementsToHighlight: null,
    toast: null,
    viewBackgroundColor: COLOR_PALETTE.white,
    zenModeEnabled: false,
    zoom: {
      value: 1 as NormalizedZoomValue,
    },
    viewModeEnabled: false,
    showHyperlinkPopup: false,
    selectedLinearElement: null,
    snapLines: [],
    originSnapOffset: {
      x: 0,
      y: 0,
    },
    objectsSnapModeEnabled: false,
    userToFollow: null,
    followedBy: new Set(),
    isCropping: false,
    croppingElementId: null,
    searchMatches: null,
    lockedMultiSelections: {},
    activeLockedId: null,
    bindMode: "orbit",
    boxSelectionMode: "contain",
  };
};

/**
 * Config containing all AppState keys. Used to determine whether given state
 *  prop should be stripped when exporting to given storage type.
 */
const APP_STATE_STORAGE_CONF = (<
  Values extends {
    /** whether to keep when storing to browser storage (localStorage/IDB) */
    browser: boolean;
    /** whether to keep when exporting to file/database */
    export: boolean;
    /** server (shareLink/collab/...) */
    server: boolean;
  },
  T extends Record<keyof AppState, Values>,
>(config: { [K in keyof T]: K extends keyof AppState ? T[K] : never }) =>
  config)({
  showWelcomeScreen: { browser: true, export: false, server: false },
  theme: { browser: true, export: false, server: false },
  collaborators: { browser: false, export: false, server: false },
  // [ExcalidrawZ] Export drawing preferences to preserve per-file settings
  currentItemBackgroundColor: { browser: true, export: true, server: false },
  currentItemEndArrowhead: { browser: true, export: true, server: false },
  currentItemFillStyle: { browser: true, export: true, server: false },
  currentItemFontFamily: { browser: true, export: true, server: false },
  currentItemFontSize: { browser: true, export: true, server: false },
  currentItemRoundness: {
    browser: true,
    export: true,
    server: false,
  },
  currentItemArrowType: {
    browser: true,
    export: true,
    server: false,
  },
  currentItemOpacity: { browser: true, export: true, server: false },
  currentItemRoughness: { browser: true, export: true, server: false },
  currentItemStrokeVariability: {
    browser: true,
    export: true,
    server: false,
  },
  currentItemStartArrowhead: { browser: true, export: true, server: false },
  currentItemStrokeColor: { browser: true, export: true, server: false },
  currentItemStrokeStyle: { browser: true, export: true, server: false },
  currentItemStrokeWidthKey: { browser: true, export: true, server: false },
  currentItemTextAlign: { browser: true, export: true, server: false },
  currentHoveredFontFamily: { browser: false, export: false, server: false },
  cursorButton: { browser: true, export: false, server: false },
  activeEmbeddable: { browser: false, export: false, server: false },
  newElement: { browser: false, export: false, server: false },
  editingTextElement: { browser: false, export: false, server: false },
  editingGroupId: { browser: true, export: false, server: false },
  activeTool: { browser: true, export: false, server: false },
  preferredSelectionTool: { browser: true, export: false, server: false },
  penMode: { browser: true, export: false, server: false },
  penDetected: { browser: true, export: false, server: false },
  errorMessage: { browser: false, export: false, server: false },
  exportBackground: { browser: true, export: false, server: false },
  exportEmbedScene: { browser: true, export: false, server: false },
  exportScale: { browser: true, export: false, server: false },
  exportWithDarkMode: { browser: true, export: false, server: false },
  fileHandle: { browser: false, export: false, server: false },
  gridSize: { browser: true, export: true, server: true },
  gridStep: { browser: true, export: true, server: true },
  gridModeEnabled: { browser: true, export: true, server: true },
  height: { browser: false, export: false, server: false },
  isBindingEnabled: { browser: true, export: false, server: false },
  boxSelectionMode: { browser: true, export: false, server: false },
  bindingPreference: { browser: true, export: false, server: false },
  isMidpointSnappingEnabled: { browser: true, export: false, server: false },
  defaultSidebarDockedPreference: {
    browser: true,
    export: false,
    server: false,
  },
  isLoading: { browser: false, export: false, server: false },
  isResizing: { browser: false, export: false, server: false },
  isRotating: { browser: false, export: false, server: false },
  lastPointerDownWith: { browser: true, export: false, server: false },
  multiElement: { browser: false, export: false, server: false },
  name: { browser: true, export: false, server: false },
  offsetLeft: { browser: false, export: false, server: false },
  offsetTop: { browser: false, export: false, server: false },
  contextMenu: { browser: false, export: false, server: false },
  openMenu: { browser: true, export: false, server: false },
  openPopup: { browser: false, export: false, server: false },
  openSidebar: { browser: true, export: false, server: false },
  openDialog: { browser: false, export: false, server: false },
  previousSelectedElementIds: { browser: true, export: false, server: false },
  resizingElement: { browser: false, export: false, server: false },
  scrolledOutside: { browser: true, export: false, server: false },
  // [ExcalidrawZ] Export viewport position to preserve user's view when saving/loading files
  scrollX: { browser: true, export: true, server: false },
  scrollY: { browser: true, export: true, server: false },
  selectedElementIds: { browser: true, export: false, server: false },
  hoveredElementIds: { browser: false, export: false, server: false },
  selectedGroupIds: { browser: true, export: false, server: false },
  selectedElementsAreBeingDragged: {
    browser: false,
    export: false,
    server: false,
  },
  selectionElement: { browser: false, export: false, server: false },
  shouldCacheIgnoreZoom: { browser: true, export: false, server: false },
  stats: { browser: true, export: false, server: false },
  suggestedBinding: { browser: false, export: false, server: false },
  frameRendering: { browser: false, export: false, server: false },
  frameToHighlight: { browser: false, export: false, server: false },
  editingFrame: { browser: false, export: false, server: false },
  elementsToHighlight: { browser: false, export: false, server: false },
  toast: { browser: false, export: false, server: false },
  viewBackgroundColor: { browser: true, export: true, server: true },
  width: { browser: false, export: false, server: false },
  zenModeEnabled: { browser: true, export: false, server: false },
  // [ExcalidrawZ] Export zoom to preserve user's view when saving/loading files
  zoom: { browser: true, export: true, server: false },
  viewModeEnabled: { browser: false, export: false, server: false },
  showHyperlinkPopup: { browser: false, export: false, server: false },
  selectedLinearElement: { browser: true, export: false, server: false },
  snapLines: { browser: false, export: false, server: false },
  originSnapOffset: { browser: false, export: false, server: false },
  objectsSnapModeEnabled: { browser: true, export: false, server: false },
  userToFollow: { browser: false, export: false, server: false },
  followedBy: { browser: false, export: false, server: false },
  isCropping: { browser: false, export: false, server: false },
  croppingElementId: { browser: false, export: false, server: false },
  searchMatches: { browser: false, export: false, server: false },
  lockedMultiSelections: { browser: true, export: true, server: true },
  activeLockedId: { browser: false, export: false, server: false },
  bindMode: { browser: true, export: false, server: false },
});

const _clearAppStateForStorage = <
  ExportType extends "export" | "browser" | "server",
>(
  appState: Partial<AppState>,
  exportType: ExportType,
) => {
  type ExportableKeys = {
    [K in keyof typeof APP_STATE_STORAGE_CONF]: typeof APP_STATE_STORAGE_CONF[K][ExportType] extends true
      ? K
      : never;
  }[keyof typeof APP_STATE_STORAGE_CONF];
  const stateForExport = {} as { [K in ExportableKeys]?: typeof appState[K] };
  for (const key of Object.keys(appState) as (keyof typeof appState)[]) {
    const propConfig = APP_STATE_STORAGE_CONF[key];
    if (propConfig?.[exportType]) {
      const nextValue = appState[key];

      // https://github.com/microsoft/TypeScript/issues/31445
      (stateForExport as any)[key] = nextValue;
    }
  }
  return stateForExport;
};

export const clearAppStateForLocalStorage = (appState: Partial<AppState>) => {
  return _clearAppStateForStorage(appState, "browser");
};

export const cleanAppStateForExport = (appState: Partial<AppState>) => {
  return _clearAppStateForStorage(appState, "export");
};

export const clearAppStateForDatabase = (appState: Partial<AppState>) => {
  return _clearAppStateForStorage(appState, "server");
};

export const isEraserActive = ({
  activeTool,
}: {
  activeTool: AppState["activeTool"];
}) => activeTool.type === "eraser";

export const isHandToolActive = ({
  activeTool,
}: {
  activeTool: AppState["activeTool"];
}) => {
  return activeTool.type === "hand";
};
