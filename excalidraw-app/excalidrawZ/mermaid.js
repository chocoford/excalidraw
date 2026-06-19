import { convertToExcalidrawElements } from "@excalidraw/element";

import { insertElements } from "./placement";

/**
 * Lazily import @excalidraw/mermaid-to-excalidraw so the (sizeable) mermaid
 * runtime isn't pulled into the initial bundle. The first call awaits the
 * dynamic import; subsequent calls reuse the resolved module.
 */
let _mermaidLibPromise = null;
const loadMermaidLib = () => {
  if (!_mermaidLibPromise) {
    _mermaidLibPromise = import("@excalidraw/mermaid-to-excalidraw");
  }
  return _mermaidLibPromise;
};

/**
 * Convert a Mermaid definition to Excalidraw elements.
 *
 * Pure converter — does NOT touch the scene. Host can take the returned
 * `{ elements, files }` and either preview them, insert via `addElements` /
 * `insertElements`, or save them as a new file.
 *
 * @param {string} definition  Mermaid diagram source.
 * @param {{
 *   regenerateIds?: boolean,
 *   mermaidConfig?: {
 *     startOnLoad?: boolean,
 *     flowchart?: { curve?: "linear" | "basis" },
 *     themeVariables?: { fontSize?: string },
 *     maxEdges?: number,
 *     maxTextSize?: number,
 *   },
 * }} [opts]
 *   - `regenerateIds` (default true): assign fresh IDs to converted elements
 *     so they don't collide with existing scene elements when inserted.
 *   - `mermaidConfig`: forwarded to `parseMermaidToExcalidraw`.
 * @returns {Promise<{ elements: any[], files: { [id: string]: any } }>}
 * @throws if the definition cannot be parsed
 */
export const mermaidToElements = async (definition, opts = {}) => {
  const { regenerateIds = true, mermaidConfig } = opts;
  const lib = await loadMermaidLib();
  const { elements: skeleton, files = {} } = await lib.parseMermaidToExcalidraw(
    definition,
    mermaidConfig,
  );
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds });
  return { elements, files };
};

/**
 * Convert a Mermaid definition and insert the result into the scene.
 *
 * Thin wrapper over `mermaidToElements` + `insertElements`. Keeps the
 * mermaid-specific options (`mermaidConfig`, `regenerateIds`) and forwards
 * everything else (`position`, `focus`, `captureUpdate`, ...) straight to
 * `insertElements`. See `placement.js` for the full position/focus surface.
 *
 * @param {string} definition  Mermaid diagram source.
 * @param {{
 *   position?: object | string,
 *   focus?: boolean | "center" | "fitViewport" | "fitContent" | object,
 *   regenerateIds?: boolean,
 *   mermaidConfig?: object,
 *   captureUpdate?: string,
 *   sanitize?: boolean,
 * }} [opts]
 *   `position` defaults to `"auto"` (mermaid output starts near origin, so
 *   the user almost always wants it auto-placed). Override to `undefined`
 *   to insert at the raw skeleton coordinates.
 *
 * @returns {Promise<{
 *   elementIds: string[],
 *   insertedAt: { x: number, y: number },
 *   bounds: { x: number, y: number, width: number, height: number },
 * }>}
 *
 * @throws if excalidrawAPI isn't ready or the definition can't be parsed.
 */
export const insertFromMermaid = async (definition, opts = {}) => {
  const {
    position = "auto",
    focus = false,
    regenerateIds = true,
    mermaidConfig,
    captureUpdate,
    sanitize,
  } = opts;

  const { elements, files } = await mermaidToElements(definition, {
    regenerateIds,
    mermaidConfig,
  });

  return insertElements(elements, {
    position,
    focus,
    files,
    captureUpdate,
    sanitize,
  });
};
