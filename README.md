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
