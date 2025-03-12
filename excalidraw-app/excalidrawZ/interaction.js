import { sendMessage } from "./message";
import { toggleToolbarAction } from "./actions";
import { keybardEvents } from "./keyboardEvent";
const getExcalidrawState = () => {
  try {
    const state = JSON.parse(localStorage.getItem("excalidraw-state"));
    return state;
  } catch {
    return null;
  }
};
// Pen
export const connectPencil = (flag) => {
  window.excalidrawZHelper.pencilConnected = flag;
};
export const togglePenMode = (flag) => {
  window.excalidrawZHelper.inPencilMode = flag;
  const state = getExcalidrawState();
  if (!state) {
    return;
  }
  if (!state.activeTool.locked && flag) {
    toggleToolbarAction("Q");
  } else if (state.activeTool.locked && !flag) {
    toggleToolbarAction("Q");
  }
};
export const togglePencilInterationMode = (mode) => {
  window.excalidrawZHelper.pencilInterationMode = mode;
};

document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "pen") {
      /**
       * if pencil is already connected,
       * current tool is cursor and pencil interation mode equals to 0,
       * auto toggle to last selected tool.
       * */
      if (
        window.excalidrawZHelper.pencilInterationMode === 0 &&
        window.excalidrawZHelper.pencilConnected &&
        window.excalidrawZHelper.inPencilMode
      ) {
        // ignore image
        if (window.excalidrawZHelper.lastToggleToolKey === "9") {
          window.excalidrawZHelper.lastToggleToolKey = "P";
        } else if (getExcalidrawState().activeTool.type === "selection") {
          toggleToolbarAction(
            window.excalidrawZHelper.lastToggleToolKey || "V",
          );
        }
        return;
      }

      /**
       * if pencil is first connected, auto toggle to pen tool.
       */
      if (!window.excalidrawZHelper.pencilConnected) {
        window.excalidrawZHelper.pencilConnected = true;
        toggleToolbarAction("P");
      }
      // auto open pencil mode
      if (!window.excalidrawZHelper.inPencilMode) {
        togglePenMode(true);
      }
      sendMessage({
        event: "didPenDown",
        data: {},
      });
    } else if (event.pointerType === "touch") {
      if (
        window.excalidrawZHelper.inPencilMode &&
        window.excalidrawZHelper.pencilConnected
      ) {
        if (window.excalidrawZHelper.pencilInterationMode === 0) {
          toggleToolbarAction("V");
        } else {
          document.dispatchEvent(
            new KeyboardEvent("keydown", keybardEvents.Space),
          );
        }
      }
    } else if (event.pointerType === "mouse") {
      // do nothing
    }
  },
  true,
);

document.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    if (window.excalidrawZHelper.inPencilMode) {
      if (window.excalidrawZHelper.pencilInterationMode === 0) {
      } else {
        document.dispatchEvent(new KeyboardEvent("keyup", keybardEvents.Space));
      }
    }
  }
});

let followingActoin = null;
// Redo & Undo with fingers
document.addEventListener("touchstart", (event) => {
  const touchCount = event.touches.length;
  if (touchCount === 2) {
    followingActoin = "undo";
  } else if (touchCount === 3) {
    followingActoin = "redo";
  }
  if (touchCount > 0) {
    setTimeout(() => {
      followingActoin = null;
    }, 100);
  }
});
document.addEventListener("touchmove", () => {
  followingActoin = null;
});
document.addEventListener("touchend", () => {
  if (followingActoin === "undo") {
    window.excalidrawZHelper.undo();
  } else if (followingActoin === "redo") {
    window.excalidrawZHelper.redo();
  }
});

export const toggleActionsMenu = (isPresented) => {
  const el = document.querySelector(".selected-shape-actions");
  if (!el) {
    return;
  }
  if (!isPresented && !el.classList.contains("transition-left")) {
    el.classList.add("transition-left");
  } else {
    el.classList.remove("transition-left");
  }
  setTimeout(() => {
    window.excalidrawZHelper.shouldHideActionsMenu = !isPresented;
  }, 200);
};
