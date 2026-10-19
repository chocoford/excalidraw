# @excalidraw/utils

## Install

```bash
npm install @excalidraw/utils
```

If you prefer Yarn over npm, use this command to install the Excalidraw utils package:

```bash
yarn add @excalidraw/utils
```

## API

### `serializeAsJSON`

See [`serializeAsJSON`](https://github.com/excalidraw/excalidraw/blob/master/src/packages/excalidraw/README.md#serializeAsJSON) for API and description.

### `exportScene` (async)

Export a scene as a canvas, PNG or JPEG [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob), or SVG element. Choose the result with `type: "canvas" | "png" | "jpeg" | "svg"`. Pass scene contents in `data` and rendering options in `config`.

## Usage

With a module bundler, import the export function:

```js
import { exportScene } from "@excalidraw/utils";
```

Here's `exportScene` in action:

```js
const excalidrawDiagram = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    {
      id: "vWrqOAfkind2qcm7LDAGZ",
      type: "ellipse",
      x: 414,
      y: 237,
      width: 214,
      height: 214,
      angle: 0,
      strokeColor: "#000000",
      backgroundColor: "#15aabf",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 1041657908,
      version: 120,
      versionNonce: 1188004276,
      isDeleted: false,
      boundElementIds: null,
    },
  ],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: null,
  },
};

const data = {
  elements: excalidrawDiagram.elements,
  appState: excalidrawDiagram.appState,
  files: {},
};

// Export an SVG element or a PNG Blob.
const svg = await exportScene({ type: "svg", data });
const png = await exportScene({ type: "png", data });
console.log(svg.outerHTML, URL.createObjectURL(png));
```
