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
