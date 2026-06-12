const DEFAULT_NATIVE_VIEWPORT_INSETS = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const nativeViewportInsets = { ...DEFAULT_NATIVE_VIEWPORT_INSETS };

const normalizeInsetValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const normalizeNativeViewportInsets = (insets = {}) => ({
  top: normalizeInsetValue(insets.top),
  right: normalizeInsetValue(insets.right),
  bottom: normalizeInsetValue(insets.bottom),
  left: normalizeInsetValue(insets.left),
});

const applyNativeViewportInsetsToCSS = (insets) => {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--sat", `${insets.top}px`);
  rootStyle.setProperty("--sar", `${insets.right}px`);
  rootStyle.setProperty("--sab", `${insets.bottom}px`);
  rootStyle.setProperty("--sal", `${insets.left}px`);
};

export const getNativeViewportInsets = () => ({ ...nativeViewportInsets });

export const setNativeViewportInsets = (insets) => {
  Object.assign(nativeViewportInsets, normalizeNativeViewportInsets(insets));

  applyNativeViewportInsetsToCSS(nativeViewportInsets);
  window.dispatchEvent(
    new CustomEvent("excalidrawz:nativeViewportInsetsChanged", {
      detail: getNativeViewportInsets(),
    }),
  );

  return getNativeViewportInsets();
};
