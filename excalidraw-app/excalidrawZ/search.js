import { sendMessage } from "./message";

const getAPI = () => window.excalidrawZHelper?._api;
const getCompute = () => window.excalidrawZHelper?._computeSearchMatches;

/**
 * Normalize Excalidraw's preview shape `{ previewText, indexInSearchQuery,
 * moreBefore, moreAfter }` into the public preview shape used by the bridge.
 */
const normalizePreview = (preview, matchLength) => ({
  text: preview.previewText,
  matchStart: preview.indexInSearchQuery,
  matchLength,
  moreBefore: preview.moreBefore,
  moreAfter: preview.moreAfter,
});

// ---------------------------------------------------------------------------
// Public: search
// ---------------------------------------------------------------------------

/**
 * Search across text elements (originalText) and frame elements (name).
 * Returns a flat array of matches sorted: frames first, then text by Y.
 *
 * Internally calls Excalidraw's `computeSearchMatches` (bridged via
 * `_computeSearchMatches`) so character-precise highlight metrics
 * (matchedLines) stay consistent with the built-in SearchMenu.
 *
 * @param {string} query
 * @param {{
 *   caseSensitive?: boolean,         // default false (matches Excalidraw built-in)
 *   highlightOnCanvas?: boolean,     // default false; if true, also sets appState.searchMatches so Excalidraw paints highlights on canvas
 * }} opts
 * @returns {Array<{
 *   elementId: string,
 *   elementType: 'text' | 'frame',
 *   matchIndex: number,
 *   matchLength: number,
 *   preview: { text: string, matchStart: number, matchLength: number, moreBefore: boolean, moreAfter: boolean },
 * }>}
 */
export const searchElements = (query, opts = {}) => {
  const { caseSensitive = false, highlightOnCanvas = false } = opts;

  const api = getAPI();
  const compute = getCompute();
  if (!api || !compute || !query || typeof query !== "string") {
    if (highlightOnCanvas && api) {
      api.updateScene({ appState: { searchMatches: null } });
    }
    return [];
  }

  const elements = api.getSceneElements();
  const zoom = api.getAppState().zoom.value;

  // Raw results include `matchedLines` (character-precise highlight metrics)
  const raw = compute(query, elements, zoom, { caseSensitive });

  // Public-facing shape: normalize preview and drop matchedLines from the
  // bridge payload (host doesn't need glyph geometry; we keep it internally
  // for setCanvasHighlights).
  const results = raw.map((r) => ({
    elementId: r.elementId,
    elementType: r.elementType,
    matchIndex: r.matchIndex,
    matchLength: r.matchLength,
    preview: normalizePreview(r.preview, r.matchLength),
  }));

  if (highlightOnCanvas) {
    setCanvasHighlightsFromRaw(raw);
  }

  return results;
};

/**
 * Push search results into appState.searchMatches so Excalidraw paints
 * highlight boxes on canvas. If results carry `matchedLines` (the raw
 * shape from `computeSearchMatches`), highlights are character-precise;
 * otherwise they fall back to element-bbox granularity.
 *
 * Pass null/[] to clear.
 *
 * @param {Array | null} results
 */
export const setCanvasHighlights = (results) => {
  const api = getAPI();
  if (!api) {
    return;
  }
  if (!results || results.length === 0) {
    api.updateScene({ appState: { searchMatches: null } });
    return;
  }
  setCanvasHighlightsFromRaw(results);
};

/**
 * Internal: results may be either the public bridge shape (no matchedLines)
 * or the raw shape from computeSearchMatches (with matchedLines).
 */
const setCanvasHighlightsFromRaw = (results) => {
  const api = getAPI();
  if (!api || !results || results.length === 0) {
    return;
  }
  api.updateScene({
    appState: {
      searchMatches: {
        focusedId: results[0].elementId,
        matches: results.map((r) => ({
          id: r.elementId,
          focus: false,
          matchedLines: r.matchedLines || [],
        })),
      },
    },
  });
};

/**
 * Clear any canvas highlights painted by `setCanvasHighlights` /
 * `searchElements({ highlightOnCanvas: true })`.
 */
export const clearCanvasHighlights = () => {
  setCanvasHighlights(null);
};

// ---------------------------------------------------------------------------
// Public: focus a result
// ---------------------------------------------------------------------------

/**
 * Scroll to and select a search result element.
 *
 * Default behavior is tuned for reading: the element occupies ~50% of the
 * viewport (leaving breathing room around it), capped at 2.5x zoom so small
 * labels aren't ridiculously magnified, and clamped at 0.3x zoom so huge
 * elements don't disappear.
 *
 * Pass `mode: 'center'` to keep current zoom and just pan; pass
 * `mode: 'fitContent'` for the cap-at-100% behavior; or override
 * `viewportZoomFactor` for a tighter/looser fit.
 *
 * @param {string} elementId
 * @param {{
 *   select?: boolean,               // default true
 *   mode?: 'center' | 'fitContent' | 'fitViewport',
 *   viewportZoomFactor?: number,    // 0.1 .. 1, default 0.5 (50% of viewport)
 *   maxZoom?: number,               // default 2.5
 *   minZoom?: number,               // default 0.3
 *   animate?: boolean,              // default true
 *   duration?: number,              // default 300
 * }} opts
 */
export const focusSearchResult = (elementId, opts = {}) => {
  const helper = window.excalidrawZHelper;
  if (!helper) {
    return;
  }

  const {
    select = true,
    mode = "fitViewport",
    viewportZoomFactor = 0.5,
    maxZoom = 2.5,
    minZoom = 0.3,
    animate = true,
    duration = 300,
  } = opts;

  // Use the existing camera helper for the actual scroll/zoom math
  helper.scrollToElement?.(elementId, {
    mode,
    viewportZoomFactor,
    maxZoom,
    minZoom,
    animate,
    duration,
  });

  if (select) {
    helper.setSelectedElementIds?.([elementId]);
  }
};

// ---------------------------------------------------------------------------
// Public: convenience event broadcast
// ---------------------------------------------------------------------------

/**
 * Broadcast a search result count back to the host. Useful when search is
 * triggered programmatically and the host wants a notification (e.g. from a
 * keyboard shortcut bridge). Most hosts won't need this — they call
 * `searchElements()` and use the returned array directly.
 */
export const sendSearchResults = (query, results) => {
  sendMessage({
    event: "onSearchResults",
    data: {
      query,
      count: results.length,
      results,
    },
  });
};
