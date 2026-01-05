import { sendMessage } from "./message";

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
 * 从 localStorage 获取当前的用户设置
 * @returns {Object} 用户设置对象
 */
export const getUserSettings = () => {
  try {
    const appStateData = localStorage.getItem("excalidraw-state");
    if (!appStateData) {
      return null;
    }

    const appState = JSON.parse(appStateData);
    const settings = {};

    // 只提取我们关心的设置
    SETTING_KEYS.forEach((key) => {
      if (appState[key] !== undefined) {
        settings[key] = appState[key];
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

/**
 * 监听设置变化并同步到 Swift 侧
 */
export const watchUserSettings = () => {
  let lastSettings = getUserSettings();

  // 监听 localStorage 变化
  const observer = new MutationObserver(() => {
    const currentSettings = getUserSettings();

    // 检查是否有变化
    if (JSON.stringify(currentSettings) !== JSON.stringify(lastSettings)) {
      lastSettings = currentSettings;

      // 发送到 Swift 侧
      sendMessage({
        event: "onUserSettingsChanged",
        data: currentSettings,
      });

      console.info(
        "[ExcalidrawZ] User settings changed, synced to native:",
        currentSettings,
      );
    }
  });

  // 观察 localStorage 的变化
  // 由于 MutationObserver 不能直接观察 localStorage，
  // 我们需要观察可能触发设置变化的 DOM 元素
  const container = document.querySelector(".excalidraw-container");
  if (container) {
    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  // 也监听直接的 storage 事件
  window.addEventListener("storage", (e) => {
    if (e.key === "excalidraw-state") {
      const currentSettings = getUserSettings();
      if (JSON.stringify(currentSettings) !== JSON.stringify(lastSettings)) {
        lastSettings = currentSettings;
        sendMessage({
          event: "onUserSettingsChanged",
          data: currentSettings,
        });
      }
    }
  });

  // 初始同步
  if (lastSettings) {
    sendMessage({
      event: "onUserSettingsChanged",
      data: lastSettings,
    });
  }
};

/**
 * 定期检查设置变化（备用方案）
 * 因为某些 Excalidraw 的更新可能不触发 DOM 变化或 storage 事件
 */
export const startSettingsPolling = (intervalMs = 2000) => {
  let lastSettings = getUserSettings();

  const checkInterval = setInterval(() => {
    const currentSettings = getUserSettings();

    if (JSON.stringify(currentSettings) !== JSON.stringify(lastSettings)) {
      lastSettings = currentSettings;

      sendMessage({
        event: "onUserSettingsChanged",
        data: currentSettings,
      });

      console.info(
        "[ExcalidrawZ] User settings changed (polled):",
        currentSettings,
      );
    }
  }, intervalMs);

  // 返回清理函数
  return () => clearInterval(checkInterval);
};
