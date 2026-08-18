type ExcalidrawZScreenAnnotationDocument = {
  type: "excalidraw";
  version: number;
  source: string;
  elements: Record<string, any>[];
  appState: Record<string, any>;
  files: Record<
    string,
    {
      id: string;
      dataURL: string;
      mimeType: string;
      created: number;
      lastRetrieved?: number;
      version?: number;
    }
  >;
};

type ExcalidrawZScreenAnnotationRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ExcalidrawZCanvasTool =
  | "selection"
  | "lasso"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "hand"
  | "frame"
  | "magicframe"
  | "embeddable"
  | "laser";

type ExcalidrawZColorPickerType =
  | "canvasBackground"
  | "elementBackground"
  | "elementStroke";

type ExcalidrawZNativeEyeDropperResult =
  | {
      cancelled: true;
      reason?: string;
    }
  | {
      cancelled: false;
      color: string;
      altKey: boolean;
    };

interface Window {
  ClipboardItem: any;
  __EXCALIDRAW_SHA__: string | undefined;
  EXCALIDRAW_ASSET_PATH: string | string[] | undefined;
  EXCALIDRAW_THROTTLE_RENDER: boolean | undefined;
  DEBUG_FRACTIONAL_INDICES: boolean | undefined;
  EXCALIDRAW_EXPORT_SOURCE: string;
  gtag: Function;
  sa_event: Function;
  fathom: { trackEvent: Function };
  excalidrawZHelper?: {
    sendMessage: (payload: { event: string; data?: any }) => void;
    currentFileId?: string;
    loadFileBuffer: (
      buffer: number[] | ArrayBuffer | Uint8Array,
      fileId: string,
      requestId: string,
    ) => Promise<{
      requestId: string;
      fileId: string;
      elementCount: number;
      durationMs: number;
    }>;
    nativeViewportInsets?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    setNativeViewportInsets?: (insets: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    }) => {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    getNativeViewportInsets?: () => {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    setNativeEyeDropperEnabled?: (enabled: boolean) => {
      enabled: boolean;
    };
    getNativeEyeDropperEnabled?: () => boolean;
    completeNativeEyeDropper?: (result: {
      requestId: string;
      color?: string;
      cancelled?: boolean;
      altKey?: boolean;
    }) => {
      accepted: boolean;
      cancelled?: boolean;
      reason?: string;
    };
    _requestNativeEyeDropper?: (options: {
      colorPickerType: ExcalidrawZColorPickerType;
      theme: "light" | "dark";
    }) => {
      requestId: string;
      promise: Promise<ExcalidrawZNativeEyeDropperResult>;
      cancel: (reason?: string) => boolean;
    } | null;
    setCanvasTransparent?: (enabled: boolean) => {
      enabled: boolean;
      applied: boolean;
      viewBackgroundColor: string | null;
    };
    prepareCanvas?: (options?: {
      reset?: boolean;
      clearHistory?: boolean;
      transparent?: boolean;
      activeTool?: ExcalidrawZCanvasTool;
      appState?: Record<string, any>;
    }) => Promise<{
      reset: boolean;
      historyCleared: boolean;
      transparent: boolean;
      activeTool: ExcalidrawZCanvasTool | null;
      appliedAppStateKeys: string[];
    }>;
    clearCanvas?: (options?: {
      clearHistory?: boolean;
    }) => Promise<{
      cleared: true;
      historyCleared: boolean;
    }>;
    createScreenAnnotationDocument?: (
      options: {
        mode?: "raw" | "bitmap";
        image: {
          dataURL: string;
          mimeType: string;
          width: number;
          height: number;
          created?: number;
        };
      } & (
        | {
            viewportRect: ExcalidrawZScreenAnnotationRect;
            selectionRect?: ExcalidrawZScreenAnnotationRect;
          }
        | {
            viewportRect?: ExcalidrawZScreenAnnotationRect;
            selectionRect: ExcalidrawZScreenAnnotationRect;
          }
      ),
    ) => ExcalidrawZScreenAnnotationDocument;
    insertScreenAnnotationDocument?: (
      document: ExcalidrawZScreenAnnotationDocument,
      options?: {
        columns?: number;
        gap?: number;
        focus?:
          | boolean
          | {
              mode?: "center" | "fitContent" | "fitViewport";
              animate?: boolean;
              duration?: number;
              canvasOffsets?: {
                top?: number;
                right?: number;
                bottom?: number;
                left?: number;
              };
            };
        captureUpdate?: "IMMEDIATELY" | "EVENTUALLY" | "NEVER";
      },
    ) => {
      frameId: string;
      elementIds: string[];
      index: number;
      bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
    clearPreviousSelection?: () => boolean;
    getUserSettings: () => Record<string, any> | null;
    applyUserSettings: (settings: Record<string, any>) => void;
  };
}

interface CanvasRenderingContext2D {
  // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect
  roundRect?: (
    x: number,
    y: number,
    width: number,
    height: number,
    radii:
      | number // [all-corners]
      | [number] // [all-corners]
      | [number, number] // [top-left-and-bottom-right, top-right-and-bottom-left]
      | [number, number, number] // [top-left, top-right-and-bottom-left, bottom-right]
      | [number, number, number, number], // [top-left, top-right, bottom-right, bottom-left]
  ) => void;
}

interface Clipboard extends EventTarget {
  write(data: any[]): Promise<void>;
}

// PNG encoding/decoding
// -----------------------------------------------------------------------------
type TEXtChunk = { name: "tEXt"; data: Uint8Array };

declare module "png-chunk-text" {
  function encode(
    name: string,
    value: string,
  ): { name: "tEXt"; data: Uint8Array };
  function decode(data: Uint8Array): { keyword: string; text: string };
}
declare module "png-chunks-encode" {
  function encode(chunks: TEXtChunk[]): Uint8Array<ArrayBuffer>;
  export = encode;
}
declare module "png-chunks-extract" {
  function extract(buffer: Uint8Array): TEXtChunk[];
  export = extract;
}
// -----------------------------------------------------------------------------

interface Blob {
  handle?: FileSystemFileHandle;
  name?: string;
}

declare module "*.scss";

// --------------------------------------------------------------------------—
// ensure Uint8Array isn't assignable to ArrayBuffer
// (due to TS structural typing)
// https://github.com/microsoft/TypeScript/issues/31311#issuecomment-490690695
interface ArrayBuffer {
  _brand?: "ArrayBuffer";
}
interface Uint8Array {
  _brand?: "Uint8Array";
}
// --------------------------------------------------------------------------—

// https://github.com/nodeca/image-blob-reduce/issues/23#issuecomment-783271848
declare module "image-blob-reduce" {
  import type { PicaResizeOptions, Pica } from "pica";
  namespace ImageBlobReduce {
    interface ImageBlobReduce {
      toBlob(file: File, options: ImageBlobReduceOptions): Promise<Blob>;
      _create_blob(
        this: { pica: Pica },
        env: {
          out_canvas: HTMLCanvasElement;
          out_blob: Blob;
        },
      ): Promise<any>;
    }

    interface ImageBlobReduceStatic {
      new (options?: any): ImageBlobReduce;

      (options?: any): ImageBlobReduce;
    }

    interface ImageBlobReduceOptions extends PicaResizeOptions {
      max: number;
    }
  }
  const reduce: ImageBlobReduce.ImageBlobReduceStatic;
  export = reduce;
}

interface CustomMatchers {
  toBeNonNaNNumber(): void;
  toCloselyEqualPoints(
    points: readonly [number, number][],
    precision?: number,
  ): void;
}

declare namespace jest {
  interface Expect extends CustomMatchers {}
  interface Matchers extends CustomMatchers {}
}
