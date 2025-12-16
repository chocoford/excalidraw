/**
 * PDF loading utilities for ExcalidrawZ
 * Uses browser native PDF rendering (0 dependencies)
 */

import { sendMessage } from "./message";

/**
 * Load PDF in viewer mode (interactive reader with browser native rendering)
 * @param {File|ArrayBuffer} pdfData - PDF file or buffer
 * @param {Object} options - Configuration options
 * @param {number} options.x - X position (default: 0)
 * @param {number} options.y - Y position (default: 0)
 * @param {number} options.width - Element width (default: 600)
 * @param {number} options.height - Element height (default: 800)
 * @param {number} options.totalPages - Total pages (required, must be provided by caller)
 * @returns {Promise<string>} - File ID
 */
export const loadPDFViewer = async (pdfData, options = {}) => {
  const { x = 0, y = 0, width = 600, height = 800, totalPages = 1 } = options;

  try {
    // Convert File to ArrayBuffer if needed
    let pdfBuffer;
    if (pdfData instanceof File) {
      pdfBuffer = await pdfData.arrayBuffer();
    } else if (pdfData instanceof ArrayBuffer) {
      pdfBuffer = pdfData;
    } else {
      throw new Error("Invalid PDF data type");
    }

    // Generate file ID (similar to image loading)
    const fileId = await generateFileId(pdfBuffer);

    // Dispatch event to create PDF element
    const container = document.querySelector(".excalidraw-container");
    if (!container) {
      throw new Error("Excalidraw container not found");
    }

    // Create a custom event with PDF data
    const event = new CustomEvent("excalidrawz:createPdfElement", {
      detail: {
        fileId,
        pdfBuffer,
        x,
        y,
        width,
        height,
        totalPages,
      },
    });

    container.dispatchEvent(event);

    // Store PDF data in IndexedDB (implementation in App.tsx)
    // The event listener will handle storage

    return fileId;
  } catch (error) {
    console.error("Failed to load PDF viewer:", error);
    throw error;
  }
};

/**
 * Generate file ID from buffer (SHA-1 hash)
 */
const generateFileId = async (buffer) => {
  const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
};

/**
 * Load PDF as tiled images (all pages rendered as separate image elements)
 * @param {Array<{imageData: Blob|ArrayBuffer|string, width: number, height: number}>} pages - Array of page images
 * @param {Object} options - Configuration options
 * @param {number | undefined} options.x - Starting X position (if undefined, auto-find empty space)
 * @param {number | undefined} options.y - Starting Y position (if undefined, auto-find empty space)
 * @param {number | undefined} options.gap - Gap between pages (default: 20)
 * @param {string | undefined} options.direction - Layout direction: "vertical" or "horizontal" (default: "vertical")
 * @param {number | undefined} options.itemsPerLine - Number of items per row/column before wrapping (default: unlimited)
 * @param {boolean | undefined} options.autoScroll - Auto scroll viewport to inserted images (default: true)
 * @returns {Promise<string[]>} - Array of image file IDs
 */
export const loadPDFTiles = async (pages, options = {}) => {
  const { x = undefined, y = undefined, gap = 20, direction = "vertical", itemsPerLine = undefined, autoScroll = true } = options;

  try {
    const container = document.querySelector(".excalidraw-container");
    if (!container) {
      throw new Error("Excalidraw container not found");
    }

    // Process all pages and prepare data
    const processedPages = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { imageData, width, height } = page;

      // Convert image data to ArrayBuffer if needed
      let imageBuffer;
      if (typeof imageData === "string") {
        // Base64 string
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }
        imageBuffer = bytes.buffer;
      } else if (imageData instanceof Blob) {
        imageBuffer = await imageData.arrayBuffer();
      } else if (imageData instanceof ArrayBuffer) {
        imageBuffer = imageData;
      } else {
        throw new Error("Invalid image data type");
      }

      // Generate file ID
      const fileId = await generateFileId(imageBuffer);

      // Create Data URL
      const base64 = arrayBufferToBase64(imageBuffer);
      const mimeType = detectImageMimeType(imageBuffer);
      const dataUrl = `data:${mimeType};base64,${base64}`;

      processedPages.push({
        fileId,
        dataUrl,
        width,
        height,
        mimeType,
      });
    }

    // Dispatch single event with all pages
    const event = new CustomEvent("excalidrawz:createImageElements", {
      detail: {
        pages: processedPages,
        options: {
          x,
          y,
          gap,
          direction,
          itemsPerLine,
          autoScroll,
        },
      },
    });

    container.dispatchEvent(event);

    return processedPages.map((p) => p.fileId);
  } catch (error) {
    console.error("Failed to load PDF as images:", error);
    throw error;
  }
};

/**
 * Convert ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Detect image MIME type from buffer
 */
const detectImageMimeType = (buffer) => {
  const bytes = new Uint8Array(buffer);

  // PNG signature
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  // JPEG signature
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP signature
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // Default to PNG
  return "image/png";
};

/**
 * Handle PDF file drop - send to Swift side for processing
 * @param {File} file - PDF file
 * @param {number} sceneX - X position in scene coordinates
 * @param {number} sceneY - Y position in scene coordinates
 * @returns {Promise<void>}
 */
export const handlePDFDrop = async (file, sceneX, sceneY) => {
  try {
    // Read PDF file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Convert ArrayBuffer to base64 string for transmission
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    // Send to Swift via webkit message handler
    sendMessage({
      event: "onDropPDF",
      data: {
        fileName: file.name,
        fileSize: file.size,
        base64Data: base64,
        sceneX,
        sceneY,
      },
    });
  } catch (error) {
    console.error("Failed to handle PDF drop:", error);
    throw error;
  }
};
