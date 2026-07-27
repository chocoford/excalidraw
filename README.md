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

- Add `resetScene` after dropping excalidraw file in `packages/excalidraw/components/App.tsx` line 13295-13296.
- Return process while user drops `library file` in `packages/excalidraw/components/App.tsx` line 13325-13332.

### PDF Support

Uses browser native PDF rendering with **zero external dependencies**.

- Add PDF MIME type constant in `packages/common/src/constants.ts` line 249.
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
- Extend BinaryFileData type to support PDF in `packages/excalidraw/types.ts` line 118-143.
- Exclude PDF from image cache in `packages/element/src/image.ts` line 56.
- Add PDF to collision detection in `packages/element/src/collision.ts`:
  - Import `isPdfElement` at line 45.
  - Add PDF to `shouldTestInside` at line 90 (makes entire PDF area draggable, not just edges).
  - Add PDF to line intersection test at line 229.
- Integrate PDF rendering in `packages/excalidraw/components/App.tsx`:
  - Import `isPdfElement` and `ExcalidrawPdfElement` at line 156 and line 286.
  - Add PDF to `renderEmbeddables()` at line 1756-2075:
    - Include `isPdfElement(el)` in the filter at line 1772.
    - Update the type assertion to include `ExcalidrawPdfElement` at line 1767.
    - Render the PDF iframe from `this.files[element.fileId]?.dataURL` in `renderPdf()` at line 2169-2242.
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
      - Auto-scrolls viewport to show inserted content using `excalidrawAPI.setViewport()` with smooth animation.
      - Grid layout with wrapping: Use `itemsPerLine` to create multi-column (vertical) or multi-row (horizontal) layouts.
      - Batch insertion for better performance.
    - **Use case**: PDF rendering done on Swift side, JS side only handles image insertion.
- Event listeners in `excalidraw-app/App.tsx`:
  - `excalidrawz:createPdfElement` at line 677-734: Creates PDF viewer element.
  - `excalidrawz:createImageElements` at line 831-988: Batch creates image elements (for PDF pages) with smart positioning, grid layout, and auto-scroll (line 969-974 uses `setViewport`).
- Expose PDF APIs in `excalidraw-app/excalidrawZ/index.js` line 689-691:
  - `window.excalidrawZHelper.loadPDFTiles(pages, { x, y, gap, direction, itemsPerLine, autoScroll })`
  - `window.excalidrawZHelper.loadPDFViewer(pdfData, { x, y, width, height, totalPages })`
  - `window.excalidrawZHelper.handlePDFDrop(file, sceneX, sceneY)` - Handle PDF file drop (sends to Swift via `sendMessage`)
- PDF drag & drop support in `packages/excalidraw/components/App.tsx` line 13089-13109:
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
  - Line 578-584: Added `case "pdf"` in `restoreElement()` to restore PDF elements with `status`, `fileId`, `currentPage`, and `totalPages` properties.
- `excalidraw-app/App.tsx` line 1062-1065: Updated status checking to include PDF elements.
- `excalidraw-app/collab/Portal.tsx` line 125-126: Updated collab status checking to include PDF elements.

### Native Viewport Insets

- Add native safe-area bridge in `excalidraw-app/excalidrawZ/viewport.js` line 1-43:
  - `window.excalidrawZHelper.setNativeViewportInsets({ top, right, bottom, left })`
  - `window.excalidrawZHelper.getNativeViewportInsets()`
  - Stores normalized non-negative inset values, updates `nativeViewportInsets`, overrides CSS safe-area vars `--sat`, `--sar`, `--sab`, `--sal`, and dispatches `excalidrawz:nativeViewportInsetsChanged`.
- Import the viewport bridge in `excalidraw-app/excalidrawZ/index.js` line 50-52 and expose the native inset APIs on `window.excalidrawZHelper` line 647-649.
- Include native insets in editor UI camera offsets in `packages/excalidraw/components/App.viewport.ts` line 507-599 so `setViewport` avoids Swift-provided safe areas.
- Declare the helper API in `packages/excalidraw/global.d.ts` line 14-36.

### Tool Lock Unlock Behavior

- Update `packages/excalidraw/components/App.tsx` line 5236-5259 so `toggleLock()` only toggles `activeTool.locked`; unlocking preserves the currently selected tool instead of switching back to the preferred selection tool.
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
- Track, retain, and render hover actions from `packages/excalidraw/components/App.tsx` line 2077-2167 and line 2847. The retention margin keeps externally positioned action buttons clickable while the pointer moves from the element to the button.
- Add hover action styling in `packages/excalidraw/css/styles.scss` line 843-872.

### Insert Focus Modes

- Add `focusElements()` in `excalidraw-app/excalidrawZ/camera.js` line 182-223 to focus element IDs in three modes:
  - `"center"` centers the camera on the target elements while preserving the current zoom.
  - `"fitContent"` and `"fitViewport"` keep the existing zoom-to-fit behavior surfaces.
- Keep camera bridge viewport operations on `setViewport()` in `excalidraw-app/excalidrawZ/camera.js` line 76-80, line 124-145, line 158-163, and line 201-221, translating legacy bridge options into `animation` and `offsets`.
- Expose `focusElements()` on `window.excalidrawZHelper` in `excalidraw-app/excalidrawZ/index.js` line 71 and line 708.
- Extend `insertElements()` focus handling in `excalidraw-app/excalidrawZ/placement.js` line 111-122 and line 137-159 so callers can pass `focus: "center"` or `focus: { mode: "center" }`; `focus: true` remains the existing animated fit-to-viewport behavior.

### Skeleton Text Boxes

- Normalize standalone text skeletons with explicit `width` / `height` in `excalidraw-app/excalidrawZ/creators.js` line 42-106 after `convertToExcalidrawElements()` runs.
- Treat explicit text `width` as a fixed text box by default (`autoResize: false` unless the skeleton explicitly sets `autoResize: true`), preserve skeleton `(x, y)` as top-left, and rewrap text through Excalidraw's text wrapping helpers. This keeps centered titles and emoji/CJK fallback text from inheriting unstable measured widths.

### Pencil Interaction Mode

- Keep the one-finger policy API in `excalidraw-app/excalidrawZ/interaction.js` line 41-104 and expose it on `window.excalidrawZHelper` from `excalidraw-app/excalidrawZ/index.js` line 2-9 and line 661-671. `setPointerInputPolicy({ oneFingerAction })` and legacy `togglePencilInterationMode(mode)` both support `select` / `move` / `none`; `pan` is accepted as an alias for `move`, and numeric modes map as `0 = select`, `1 = move`, `2 = none`.
- Apply the one-finger behavior in `excalidraw-app/excalidrawZ/interaction.js` line 167-198: `select` switches touch input to the selection tool, `move` sends synthetic Space keydown/keyup with `bubbles: true` and `cancelable: true` for space-drag panning, and `none` leaves finger events untouched.
- Keep a thin ExcalidrawZ pointer input hook that only observes events: `excalidraw-app/excalidrawZ/interaction.js` line 121-128 and line 186-198 forwards document pointer phases, `excalidraw-app/excalidrawZ/index.js` line 671 exposes `_pointerInputHook`, and `packages/excalidraw/components/App.tsx` line 3906-3908, line 3983-3987, line 5192-5214, line 7784-7787, line 8552-8560, line 9013-9014, and line 9053-9057 invokes the hook while ignoring return values. The hook does not call `preventDefault()`, stop propagation, release pointer capture, switch tools, or mutate pan state.

### State Change Bridge

- Change `onStateChanged` to split content/appState dirty tracking in `excalidraw-app/excalidrawZ/index.js` line 189-323 and line 341-405:
  - Sends revision, dirty flag, `contentDirty`, `appStateDirty`, full `appState`, element counts, file element count, appState size, and current file id.
  - Avoids sending full `elements`, `dataString`, and image file data through the WebKit bridge on every edit; hosts should pull content only when `contentDirty` is true.
  - Suppresses dirty broadcasts during file loads through `_beginStateChangeSuppression` at line 271-286, skips per-change signature work while suppressed, resets the watcher baseline after load, and uses a suppression generation to ignore stale throttled callbacks at line 350-356 and line 398-404.
  - Keeps performance probes for the lightweight event and stores the latest revision on `window.excalidrawZHelper.lastStateChangeRevision` at line 607-611.
- Keep full document transfer as an explicit pull via `getCurrentFileSnapshot()` in `excalidraw-app/excalidrawZ/load+save.js` line 439-453. The snapshot includes `revision` so the host can match it to the latest dirty notification, and it no longer returns `dataString` to avoid synchronously stringifying large scenes before crossing the WebKit bridge.
- Optimize snapshot file lookup in `excalidraw-app/excalidrawZ/indexdb+.js` line 75-135 by collecting scene `fileId`s and reading only those files from IndexedDB instead of loading all stored files and filtering afterward.
- Summarize `onStateChanged` bridge logs in `excalidraw-app/excalidrawZ/message.js` line 1-76 so console logging stays small while preserving the actual message sent to the host.

### Viewport Image Export

- Add Promise-only `window.excalidrawZHelper.exportViewportToBlob(source?)` in `excalidraw-app/excalidrawZ/export.js` line 235-361 and expose it from `excalidraw-app/excalidrawZ/index.js` line 28-32 and line 615-617.
- `source` may contain `{ elements, appState, files }`; when present, the helper renders that snapshot in an offscreen canvas without mutating the live scene. When omitted, it exports the current live scene.
- Render the source viewport through Excalidraw's static renderer instead of DOM screenshotting, using helper-side canvas limit clamping and viewport element filtering in `excalidraw-app/excalidrawZ/export.js` line 42-114.
- Return `{ blobData, width, height, actualScale, scaleClamped, elementCount, fileCount, mimeType }` directly to the caller; no legacy `id` callback event is supported.
- The first version intentionally has no public export-style options: it reads viewport size, camera, zoom, theme, and background from the source `appState`, uses PNG output, and fixes scale at 1x except for safety clamping when WebKit canvas limits would be exceeded.
- Do not expose grid rendering for viewport export; the helper passes `renderGrid: false` at `excalidraw-app/excalidrawZ/export.js` line 337-346 to match Excalidraw image export behavior.

### Current File Save Stream

- Add `window.excalidrawZHelper.requestCurrentFileSaveStream(options)` in `excalidraw-app/excalidrawZ/load+save.js` line 455-553 and expose it from `excalidraw-app/excalidrawZ/index.js` line 16-26 and line 588-596.
- The API returns `{ supported: true }` immediately, then sends ordered native messages through `sendMessage`:
  - `currentFileSaveStreamStarted` with `streamId`, `revision`, `elementCount`, `fileCount`, and `totalBytes`.
  - `currentFileSaveStreamChunk` with `streamId`, sequential `index`, and base64-encoded bytes.
  - `currentFileSaveStreamFinished` with the same summary fields plus `sha256`, or `currentFileSaveStreamFailed` with `message`.
- Chunk bytes concatenate into a UTF-8 JSON document with shape `{ elements, appState, files }`; `revision`, byte count, and hash are stream metadata only.
- Clamp `chunkSize` to 1 KB...1 MB with a 64 KB default in `excalidraw-app/excalidrawZ/load+save.js` line 7-58, and yield between chunks so WebKit receives smaller ordered messages instead of one large snapshot object.
- Summarize chunk logging in `excalidraw-app/excalidrawZ/message.js` line 24-34 so base64 payloads are not printed to the console.

### File Load Completion

- Update `loadFileBuffer()` and `loadFileString()` completion waiting in `excalidraw-app/excalidrawZ/load+save.js` line 6-145 and line 180-325:
  - File loads now wait for the internal `excalidrawz:fileLoadDone` event instead of resolving on the first `onChange`.
  - Keep the pending request id and internal event dispatch in the ExcalidrawZ helper through `consumePendingFileLoadRequest()` at line 65-102.
  - Avoids pre-restoring or hashing every element in the helper, keeping large-file load overhead low.
  - Increases the load timeout to 30 seconds and summarizes large load logs instead of printing full file JSON to the console.
- Let `packages/excalidraw/components/App.tsx` line 12255-12365 consume the optional helper request and call `done()` after `.excalidraw` data has been applied, or on load errors, so helper promises do not hang.

### ExcalidrawZ File AppState

- Keep ExcalidrawZ's intentional `APP_STATE_STORAGE_CONF` divergence from upstream in `packages/excalidraw/appState.ts` line 155-251:
  - Upstream Excalidraw treats these as non-exported browser state. ExcalidrawZ treats them as file state because Native save/load depends on them surviving `cleanAppStateForExport()`.
  - Do not restore these fields to upstream `export: false` during merges unless the Native save/load contract is changed at the same time.
  - Persist current drawing defaults as per-file settings: `currentItemBackgroundColor`, `currentItemEndArrowhead`, `currentItemFillStyle`, `currentItemFontFamily`, `currentItemFontSize`, `currentItemRoundness`, `currentItemArrowType`, `currentItemOpacity`, `currentItemRoughness`, `currentItemStrokeVariability`, `currentItemStartArrowhead`, `currentItemStrokeColor`, `currentItemStrokeStyle`, `currentItemStrokeWidthKey`, and `currentItemTextAlign`.
  - Note the upstream field is now `currentItemStrokeWidthKey`; do not reintroduce the old `currentItemStrokeWidth` storage config entry.
  - Keep ExcalidrawZ user settings aligned with this field rename in `excalidraw-app/excalidrawZ/userSettings.js` line 7-40: emit `currentItemStrokeWidthKey`, preserve `currentItemStrokeWidth` only as a legacy fallback when the key field is missing.
  - Persist viewport camera state as file state: `scrollX`, `scrollY`, and `zoom`.
  - Other transient appState fields are still stripped by `cleanAppStateForExport()`.
  - `.excalidraw` file loads in `packages/excalidraw/data/blob.ts` line 170-181 continue to auto-center only when the imported file does not provide a complete scroll position.
