import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// import { registerSW } from "virtual:pwa-register";

import "./excalidrawZ/index.js";
import ExcalidrawApp from "./App";

const rootElement = document.getElementById("root")!;
const ownerWindow = rootElement.ownerDocument.defaultView!;

// the entry's JavaScript and CSS loaded and ran (`scripts/stats/perf.mjs`)
ownerWindow.performance.mark("excalidraw:app-start");
ownerWindow.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

const root = createRoot(rootElement);
// registerSW();
root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
