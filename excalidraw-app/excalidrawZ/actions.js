import { keybardEvents } from "./keyboardEvent";

const getAPI = () => window.excalidrawZHelper?._api;

/**
 * Map of legacy key strings → Excalidraw ToolType.
 * Accepts:
 *   - digits ("1"–"9") matching toolbar numeric shortcuts
 *   - letter shortcuts (both upper/lower case) for hand/frame/laser/etc.
 *   - explicit tool-type strings ("selection", "lasso", "hand", ...)
 */
const KEY_TO_TOOL_TYPE = {
  // numeric toolbar shortcuts
  "1": "selection",
  "2": "rectangle",
  "3": "diamond",
  "4": "ellipse",
  "5": "arrow",
  "6": "line",
  "7": "freedraw",
  "8": "text",
  "9": "image",
  // letter shortcuts
  V: "selection",
  v: "selection",
  P: "freedraw",
  p: "freedraw",
  H: "hand",
  h: "hand",
  F: "frame",
  f: "frame",
  K: "laser",
  k: "laser",
  E: "eraser",
  e: "eraser",
  // explicit strings
  selection: "selection",
  lasso: "lasso",
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  text: "text",
  image: "image",
  hand: "hand",
  frame: "frame",
  magicframe: "magicframe",
  embeddable: "embeddable",
  laser: "laser",
  eraser: "eraser",
};

export const toggleToolbarAction = (key) => {
  const api = getAPI();

  // Tool lock (Q) — direct API call, no synthetic keyboard event needed
  if (key === "Q" || key === "q") {
    if (api?.toggleLock) {
      api.toggleLock();
    } else {
      document.dispatchEvent(
        new KeyboardEvent("keydown", keybardEvents.Q),
      );
    }
    return;
  }

  // Tool switching — direct setActiveTool, no DOM clicks or synthetic events
  const toolType = KEY_TO_TOOL_TYPE[key];
  if (toolType && api?.setActiveTool) {
    api.setActiveTool({ type: toolType });
    return;
  }

  // -------------------------------------------------------------------------
  // Dropdown-menu items below — still DOM-based pending step 2 of the
  // refactor (switch to openDialog / actionManager calls).
  // -------------------------------------------------------------------------

  const withDropdownMenu = (action) => {
    if (!!document.querySelector("[data-testid=dropdown-menu]")) {
      action(document.querySelector("[data-testid=dropdown-menu]"));
    } else {
      document.querySelector("[data-testId=dropdown-menu-button]")?.click();
      setTimeout(() => {
        action(document.querySelector("[data-testid=dropdown-menu]"));
      }, 50);
    }
  };

  if (key === "webEmbed") {
    withDropdownMenu((container) => {
      container.children[0]?.children[1]?.click();
    });
    return;
  }

  const toggleGenerateAction = (index) => {
    withDropdownMenu((container) => {
      let node = container.querySelector(".dropdown-menu-container > div");
      for (let i = 0; i <= index; i++) {
        node = node?.nextSibling;
      }
      node?.click();
    });
  };

  if (key === "text2diagram") {
    toggleGenerateAction(0);
    return;
  }

  if (key === "mermaid") {
    withDropdownMenu(() => {
      toggleGenerateAction(1);
    });
    return;
  }

  if (key === "wireframe") {
    toggleGenerateAction(2);
    return;
  }

  // Fallback — dispatch synthetic keyboard event for anything else
  // (Escape, Space, Backspace, and any caller-supplied keys we don't map)
  if (keybardEvents[key]) {
    document.dispatchEvent(new KeyboardEvent("keydown", keybardEvents[key]));
  }
};
