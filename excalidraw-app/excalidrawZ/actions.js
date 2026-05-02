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

  if (key === "lasso") {
    withDropdownMenu((container) => {
      container.children[0]?.children[3]?.click();
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
    withDropdownMenu((container) => {
      toggleGenerateAction(1);
    });
    return;
  }

  if (key === "wireframe") {
    toggleGenerateAction(2);
    return;
  }

  if (keybardEvents[key]) {
    document.dispatchEvent(new KeyboardEvent("keydown", keybardEvents[key]));
  }
};
