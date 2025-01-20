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