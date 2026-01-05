import { keybardEvents } from "./keyboardEvent";

export const toggleToolbarAction = (key) => {
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

  if (key === "text2diagram") {
    withDropdownMenu((container) => {
      container.children[0]?.children[4]?.click();
    });
    return;
  }

  if (key === "mermaid") {
    withDropdownMenu((container) => {
      container.children[0]?.children[5]?.click();
    });
    return;
  }

  if (key === "wireframe") {
    withDropdownMenu((container) => {
      container.children[0]?.children[6]?.click();
    });
    return;
  }

  if (keybardEvents[key]) {
    document.dispatchEvent(new KeyboardEvent("keydown", keybardEvents[key]));
  }
};
