import { getAppState } from "./_helpers";

/**
 * 用户绘图偏好设置
 * 这些是用户可以自定义并跨文件保持的设置
 */
const SETTING_KEYS = [
  "currentItemStrokeWidthKey",
  "currentItemStrokeVariability",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemStrokeStyle",
  "currentItemFillStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemRoundness",
  "currentItemArrowType",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
];

const collectUserSettings = (source) => {
  const settings = {};
  SETTING_KEYS.forEach((key) => {
    if (source[key] !== undefined) {
      settings[key] = source[key];
    }
  });

  if (
    settings.currentItemStrokeWidthKey === undefined &&
    source.currentItemStrokeWidth !== undefined
  ) {
    settings.currentItemStrokeWidth = source.currentItemStrokeWidth;
  }

  return settings;
};

/**
 * Get the current user settings from the live appState (zero latency).
 * Falls back to reading localStorage if the API isn't ready yet.
 * @returns {Object | null}
 */
export const getUserSettings = () => {
  const appState = getAppState();
  if (appState) {
    return collectUserSettings(appState);
  }

  // Fallback: API not ready yet — read from localStorage
  try {
    const raw = localStorage.getItem("excalidraw-state");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return collectUserSettings(parsed);
  } catch (error) {
    console.error("[ExcalidrawZ] Failed to get user settings:", error);
    return null;
  }
};

/**
 * 应用用户自定义设置
 * @param {Object} settings - 要应用的设置对象
 */
export const applyUserSettings = (settings) => {
  if (!settings || typeof settings !== "object") {
    console.warn("[ExcalidrawZ] Invalid settings provided to applyUserSettings");
    return;
  }

  try {
    // 发送自定义事件到 App.tsx 处理
    window.dispatchEvent(
      new CustomEvent("excalidrawz:applyUserSettings", {
        detail: settings,
      }),
    );

    console.info("[ExcalidrawZ] Dispatched applyUserSettings event:", settings);
  } catch (error) {
    console.error("[ExcalidrawZ] Failed to apply user settings:", error);
  }
};
