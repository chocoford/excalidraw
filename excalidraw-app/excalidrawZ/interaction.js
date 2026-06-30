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

const dispatchSpaceKey = (type) => {
  document.dispatchEvent(
    new KeyboardEvent(type, {
      ...keybardEvents.Space,
      bubbles: true,
      cancelable: true,
    }),
  );
};

let oneFingerMoveActive = false;

const normalizeOneFingerAction = (value) => {
  const action = typeof value === "string" ? value.toLowerCase() : value;

  if (action === 0 || action === "0" || action === "select") {
    return "select";
  }
  if (
    action === 1 ||
    action === "1" ||
    action === "move" ||
    action === "pan"
  ) {
    return "move";
  }
  if (action === 2 || action === "2" || action === "none") {
    return "none";
  }

  return "select";
};

const oneFingerActionToLegacyMode = (action) => {
  if (action === "move") {
    return 1;
  }
  if (action === "none") {
    return 2;
  }
  return 0;
};

const syncPointerInputPolicy = (oneFingerAction) => {
  const policy = {
    ...(window.excalidrawZHelper.pointerInputPolicy || {}),
    oneFingerAction,
  };
  window.excalidrawZHelper.pointerInputPolicy = policy;
  window.excalidrawZHelper.pencilInterationMode =
    oneFingerActionToLegacyMode(oneFingerAction);

  if (oneFingerAction !== "move") {
    endOneFingerMove();
  }

  return policy;
};

export const setPointerInputPolicy = (policy = {}) => {
  const oneFingerAction = normalizeOneFingerAction(
    policy?.oneFingerAction ?? policy?.oneFingerMode ?? policy?.mode ?? policy,
  );
  return syncPointerInputPolicy(oneFingerAction);
};

export const getPointerInputPolicy = () => {
  const oneFingerAction = normalizeOneFingerAction(
    window.excalidrawZHelper.pencilInterationMode ??
      window.excalidrawZHelper.pointerInputPolicy?.oneFingerAction,
  );
  return { oneFingerAction };
};

export const togglePencilInterationMode = (mode) => {
  setPointerInputPolicy({ oneFingerAction: mode });
};

const beginOneFingerMove = () => {
  if (!oneFingerMoveActive) {
    dispatchSpaceKey("keydown");
    oneFingerMoveActive = true;
  }
};

function endOneFingerMove() {
  if (oneFingerMoveActive) {
    dispatchSpaceKey("keyup");
    oneFingerMoveActive = false;
  }
}

const runPointerInputHookCapture = (phase, event) => {
  window.excalidrawZHelper?._runPointerInputHook?.(phase, event);
};

document.addEventListener(
  "pointerdown",
  (event) => {
    runPointerInputHookCapture("onPointerDown", event);

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
        const { oneFingerAction } = getPointerInputPolicy();
        if (oneFingerAction === "select") {
          toggleToolbarAction("V");
        } else if (oneFingerAction === "move") {
          beginOneFingerMove();
        }
      }
    } else if (event.pointerType === "mouse") {
      // do nothing
    }
  },
  true,
);

document.addEventListener("pointerup", (event) => {
  runPointerInputHookCapture("onPointerUp", event);
  if (event.pointerType === "touch") {
    endOneFingerMove();
  }
});

document.addEventListener("pointercancel", (event) => {
  runPointerInputHookCapture("onPointerCancel", event);
  if (event.pointerType === "touch") {
    endOneFingerMove();
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
