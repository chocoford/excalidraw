export const getIsDark = () => {
  const container = document
    .getElementsByClassName("excalidraw-container")
    .item(0);
  if (!container) {
    return false;
  }
  return container.classList.contains(`theme--dark`);
};

/**
 *
 * @param {'dark' | 'light' | undefined} theme
 */
export const toggleColorTheme = (theme = undefined) => {
  const isDark = getIsDark();
  if (theme !== "dark") {
    window.excalidrawZHelper.shouldPreventInvertImage = false;
  }
  if ((theme === "dark") === isDark) {
    return;
  }
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Î",
      code: "KeyD",
      altKey: true,
      shiftKey: true,
      composed: true,
      keyCode: 68,
      which: 68,
    }),
  );
};
