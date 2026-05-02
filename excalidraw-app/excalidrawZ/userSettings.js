import { getAppState } from "./_helpers";

/**
 * 用户绘图偏好设置
 * 这些是用户可以自定义并跨文件保持的设置
 */
const SETTING_KEYS = [
  "currentItemStrokeWidth",
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

/**
 * Get the current user settings from the live appState (zero latency).
 * Falls back to reading localStorage if the API isn't ready yet.
 * @returns {Object | null}
 */
export const getUserSettings = () => {
  const appState = getAppState();
  if (appState) {
    const settings = {};
    SETTING_KEYS.forEach((key) => {
      if (appState[key] !== undefined) {
        settings[key] = appState[key];
      }
    });
    return settings;
  }

  // Fallback: API not ready yet — read from localStorage
  try {
    const raw = localStorage.getItem("excalidraw-state");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const settings = {};
    SETTING_KEYS.forEach((key) => {
      if (parsed[key] !== undefined) {
        settings[key] = parsed[key];
      }
    });
    return settings;
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

