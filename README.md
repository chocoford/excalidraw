# Excalidraw core for ExcalidrawZ

### What's changed

- Hide App bottom bar at `packages/excalidraw/components/MobileMenu.tsx` line 164.
- Prevent image invert at `packages/excalidraw/renderer/renderElement.ts` line 432.
- Hide canvas actions at `packages/excalidraw/components/LayerUI.tsx`.
- Hide footer at `packages/excalidraw/components/footer/Footer.tsx` line 38.
- Hide welcome screen actions at `packages/excalidraw/components/welcome-screen/WelcomeScreen.Center.tsx`.
- Watch activeTool changes at `excalidraw-app/App.tsx` line 596-600.
- Reset history after load file to canvas at `packages/excalidraw/components/App.tsx` line 9626.
- Remove the handler of `⌘P` at `packages/excalidraw/components/App.tsx` line 4137~4152.
- Disable the pen mode detecting at `packages/excalidraw/components/App.tsx` line 6231~6238.
- Add new ExcalidrawZFont in `packages/excalidraw/fonts`.
- Add YDSZST font folder in `packages/excalidraw/fonts`.
- Chnage `CJK_HAND_DRAWN_FALLBACK_FONT` to `YDSZST`. Relavent files:
  - `packages/excalidraw/constants.ts` line 120.
  - `packages/excalidraw/Fonts.ts` line 414.
- Remove Help&ImageExport keyboard shortcut in `packages/excalidraw/components/App.tsx` line 4184-4197. 
- Modify css style of `Excalidraw Modal` in `packages/excalidraw/components/Modal.scss` line 138-146.
- Modify css style of `Excalidraw TTD-Dialog` in `packages/excalidraw/components/TTDDialog/TTDDialog.scss` line 15.
- Add elements selection message in `packages/excalidraw/components/App.tsx` line 1536-1546.

- Add codes in `excalidraw-app/collab/Collab.tsx` to listen collaborators changes at line 848-871.

- Add codes in `excalidraw-app/collab/Collab.tsx` to trigger `onStateChanged`.

- Move codes out of hidden in `packages/excalidraw/components/LayerUI.tsx` in line 365-366.

- Hide `LiveCollaborationTrigger` in `excalidraw-app/App.tsx` at line 857.

- Use local fonts in `scripts/woff2/woff2-vite-plugins.js` line 1.

- Disable `Sitemap` plugin in `excalidraw-app/vite.config.mts` at line 57-63.

- Directly open url on click icon: `packages/excalidraw/components/App.tsx` line 5586-5591

- Support dark `exportToBlob`: `packages/utils/export.ts` line 126-134.

- Adjust the rendering thickness of freedraw to enhance the writing experience with the Apple Pencil. The code is located in `packages/excalidraw/renderer/renderElement.ts` line 1063. 

  - ```
    - size: element.strokeWidth * 4.25,
    + size: element.strokeWidth * 1.8,
    ```

- Add `resetScene` after dropping excalidraw file in `packages/excalidraw/components/App.tsx` line 10397.
- Return process while user drops `library file` in `packages/excalidraw/components/App.tsx` line 10423.

### PDF Support

Uses browser native PDF rendering with **zero external dependencies**.

- Add PDF MIME type constant in `packages/common/src/constants.ts` line 254.
- Define `ExcalidrawPdfElement` type in `packages/element/src/types.ts` line 163-173.
  - Properties: `fileId`, `status`, `currentPage`, `totalPages`.
- Add PDF element to union type in `packages/element/src/types.ts` line 236.
- Create `newPdfElement()` factory function in `packages/element/src/newElement.ts` line 552-569.
- Add PDF type checks in `packages/element/src/typeChecks.ts`:
  - Import types at line 19-20.
  - Add `isPdfElement()` function at line 49-53.
  - Add `isInitializedPdfElement()` function at line 55-59.
  - Add PDF case to element type switch at line 281.
- Add PDF placeholder rendering in `packages/element/src/renderElement.ts` line 519-541.
- Add PDF to renderElement switch in `packages/element/src/renderElement.ts` line 884.
- Add PDF to generateRoughOptions in `packages/element/src/shape.ts` line 240-244.
- Add PDF to generateElementShape in `packages/element/src/shape.ts` line 827 (returns null, no shape needed).
- Add PDF SVG export in `packages/excalidraw/renderer/staticSvgScene.ts` line 179-211 (renders placeholder).
- Extend BinaryFileData type to support PDF in `packages/excalidraw/types.ts` line 115.
- Exclude PDF from image cache in `packages/element/src/image.ts` line 56.
- Add PDF to collision detection in `packages/element/src/collision.ts`:
  - Import `isPdfElement` at line 45.
  - Add PDF to `shouldTestInside` at line 90 (makes entire PDF area draggable, not just edges).
  - Add PDF to line intersection test at line 229.
- Integrate PDF rendering in `packages/excalidraw/components/App.tsx`:
  - Import `isPdfElement` and `ExcalidrawPdfElement` at line 147, 259.
  - Add PDF to `renderEmbeddables()` method at line 993-1305:
    - Include `isPdfElement(el)` in filter at line 1008.
    - Update type assertion to include `ExcalidrawPdfElement` at line 1003.
    - Render PDF iframe from `this.files[el.fileId]?.dataURL` at line 1252-1273.
    - **Benefits**: Automatic position updates on scroll/zoom, unified architecture with embeddables.
- Create PDF loading utilities at `excalidraw-app/excalidrawZ/pdf.js`:
  - `loadPDFViewer(pdfData, options)` - Load PDF as interactive viewer element.
    - Creates single PDF element with browser native rendering.
    - Options: `x`, `y`, `width`, `height`, `totalPages`.
  - `loadPDFTiles(pages, options)` - Load PDF as tiled images (all pages rendered separately).
    - Dispatches single `excalidrawz:createImageElements` event with all pages.
    - Options:
      - `x`, `y` (default: undefined) - Starting position. If undefined, auto-finds empty space.
      - `gap` (default: 20) - Gap between pages.
      - `direction` (default: "vertical") - Layout direction ("vertical" or "horizontal").
      - `itemsPerLine` (default: undefined) - Number of items per row/column before wrapping. If undefined, no wrapping.
      - `autoScroll` (default: true) - Auto scroll viewport to inserted images.
    - Pages format: `Array<{imageData: Blob|ArrayBuffer|string, width: number, height: number}>`.
    - **Smart features** (implemented in event handler):
      - Auto-finds empty space: If canvas has content, places PDF to the right; if empty, centers in viewport.
      - Auto-scrolls viewport to show inserted content using `excalidrawAPI.scrollToContent()` with smooth animation.
      - Grid layout with wrapping: Use `itemsPerLine` to create multi-column (vertical) or multi-row (horizontal) layouts.
      - Batch insertion for better performance.
    - **Use case**: PDF rendering done on Swift side, JS side only handles image insertion.
- Event listeners in `excalidraw-app/App.tsx`:
  - `excalidrawz:createPdfElement` at line 603-666: Creates PDF viewer element.
  - `excalidrawz:createImageElements` at line 668-810: Batch creates image elements (for PDF pages) with smart positioning, grid layout, and auto-scroll (line 802-810 uses `scrollToContent` API).
- Expose PDF APIs in `excalidraw-app/excalidrawZ/index.js` line 432-434:
  - `window.excalidrawZHelper.loadPDFTiles(pages, { x, y, gap, direction, itemsPerLine, autoScroll })`
  - `window.excalidrawZHelper.loadPDFViewer(pdfData, { x, y, width, height, totalPages })`
  - `window.excalidrawZHelper.handlePDFDrop(file, sceneX, sceneY)` - Handle PDF file drop (sends to Swift via `sendMessage`)
- PDF drag & drop support in `packages/excalidraw/components/App.tsx` line 10281-10302:
  - Detects PDF file drops (checks `file?.type === PDF_MIME_TYPE`)
  - Calls `window.excalidrawZHelper.handlePDFDrop()` to send PDF data to Swift side
  - PDF data sent includes: fileName, fileSize, base64Data, sceneX, sceneY
  - Implementation in `excalidraw-app/excalidrawZ/pdf.js` line 220-248: `handlePDFDrop()` function

**Dependencies**: None.
- For `loadPDFViewer`: Page count must be provided by caller.
- For `loadPDFTiles`: PDF rendering (to images) must be done by caller (e.g., Swift side).

**Persistence**: PDF files are persisted to IndexedDB and restored correctly.
- `excalidraw-app/data/FileManager.ts`:
  - Line 100-102: Modified `saveFiles()` to handle both image and PDF elements.
  - Line 182-183: Modified `shouldPreventUnload()` to check both image and PDF elements.
  - Line 207-215: Added `shouldUpdatePdfElementStatus()` helper for PDF element status updates.
- `packages/excalidraw/data/restore.ts`:
  - Line 314-320: Added `case "pdf"` in `restoreElement()` to restore PDF elements with `status`, `fileId`, `currentPage`, and `totalPages` properties.
- `excalidraw-app/App.tsx` line 887-888: Updated status checking to include PDF elements.
- `excalidraw-app/collab/Portal.tsx` line 125-126: Updated collab status checking to include PDF elements.

### Native Viewport Insets

- Add native safe-area bridge in `excalidraw-app/excalidrawZ/viewport.js` line 1-43:
  - `window.excalidrawZHelper.setNativeViewportInsets({ top, right, bottom, left })`
  - `window.excalidrawZHelper.getNativeViewportInsets()`
  - Stores normalized non-negative inset values, updates `nativeViewportInsets`, overrides CSS safe-area vars `--sat`, `--sar`, `--sab`, `--sal`, and dispatches `excalidrawz:nativeViewportInsetsChanged`.
- Import the viewport bridge in `excalidraw-app/excalidrawZ/index.js` line 41-45 and expose the native inset APIs on `window.excalidrawZHelper` line 451-454.
- Include native insets in editor UI camera offsets in `packages/excalidraw/components/App.tsx` line 4797-4841 so zoom/scroll-to-content avoids Swift-provided safe areas.
- Declare the helper API in `packages/excalidraw/global.d.ts` line 14-36.

### Tool Lock Unlock Behavior

- Update `packages/excalidraw/components/App.tsx` line 4345-4364 so `toggleLock()` only toggles `activeTool.locked`; unlocking preserves the currently selected tool instead of switching back to the preferred selection tool.
- Add regression coverage in `packages/excalidraw/tests/selection.test.tsx` line 1050-1065 to ensure unlocking keeps the current drawing tool active.

### Math Image Editing

- Add ExcalidrawZ math metadata helpers in `packages/element/src/excalidrawZ.ts` line 1-38:
  - Treats image elements tagged with `customData.excalidrawZ.type === "math"` as semantic math images.
  - Enables a math-specific dark-mode color filter from the math tag and current theme, without depending on image cache MIME metadata.
- Export the helper from `packages/element/src/index.ts` line 79 so UI integrations can share the same predicate.
- Add `applyDarkModeFilterToRGB()` in `packages/common/src/colors.ts` line 106-119 so canvas image pixels can reuse the same `invert(93%) hue-rotate(180deg)` formula as `DARK_THEME_FILTER`; unit coverage is in `packages/common/src/colors.test.ts` line 1-22.
- Apply the math color filter in canvas image rendering with a small pixel canvas fallback at `packages/element/src/renderElement.ts` line 388-463, then use it from the image draw path at line 549-560.
- Apply the same CSS filter in static SVG export at `packages/excalidraw/renderer/staticSvgScene.ts` line 557-565.
- Add unit coverage in `packages/element/tests/excalidrawZ.test.ts` line 1-60 for math tag detection and dark-theme filtering.
- Add math image helper APIs in `excalidraw-app/excalidrawZ/math.js`:
  - `createMathImage()` at line 153-217 builds a tagged image element plus the matching SVG binary file map.
  - `insertMathImage()` at line 230-245 inserts the tagged formula image through the normal placement pipeline.
  - `updateMathImage()` at line 258-308 replaces an existing formula image with a fresh file id so Excalidraw's non-replacing `addFiles()` behavior does not keep stale SVG data.
- Expose the math image APIs on `window.excalidrawZHelper` in `excalidraw-app/excalidrawZ/index.js` line 29 and line 436-439.
- Add a generic hover action overlay in `packages/excalidraw/components/ElementHoverActions.tsx` line 1-156. The first registered action is math image editing, which sends `requestEditMathImage` through `window.excalidrawZHelper.sendMessage` and renders outside the element's top-right bounds.
- Track, retain, and render hover actions from `packages/excalidraw/components/App.tsx` line 1886-1965 and line 2566. The retention margin keeps externally positioned action buttons clickable while the pointer moves from the element to the button.
- Add hover action styling in `packages/excalidraw/css/styles.scss` line 843-872.

### Insert Focus Modes

- Add `focusElements()` in `excalidraw-app/excalidrawZ/camera.js` line 164-229 to focus element IDs in three modes:
  - `"center"` centers the camera on the target elements while preserving the current zoom.
  - `"fitContent"` and `"fitViewport"` keep the existing zoom-to-fit behavior surfaces.
- Expose `focusElements()` on `window.excalidrawZHelper` in `excalidraw-app/excalidrawZ/index.js` line 58-69 and line 510-518.
- Extend `insertElements()` focus handling in `excalidraw-app/excalidrawZ/placement.js` line 111-122 and line 137-159 so callers can pass `focus: "center"` or `focus: { mode: "center" }`; `focus: true` remains the existing animated fit-to-viewport behavior.
