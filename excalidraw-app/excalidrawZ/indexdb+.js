import { sendMessage } from "./message";

/** @type IDBDatabase */
export let filesStoreConnection = null;
export const connectFileStore = async () => {
  filesStoreConnection = await new Promise((resolve, reject) => {
    const filesStoreConnection = indexedDB.open("files-db", 1);
    filesStoreConnection.onsuccess = function (event) {
      const db = event.target.result;
      resolve(db);
    };
    filesStoreConnection.onerror = function (event) {
      reject(`获取所有数据出错: ${event.target.error}`);
    };
  });
};

/**
 * Insert files to IndexedDB.
 * @param {string} filesJSONString The files to be inseted in the form fo json stringified string.
 */
export const insertMedias = async (filesJSONString) => {
  const files = JSON.parse(filesJSONString);
  console.info("Start insertMedias");
  return await new Promise((resolve, reject) => {
    const transaction = filesStoreConnection.transaction(
      ["files-store"],
      "readwrite",
    );
    const objectStore = transaction.objectStore("files-store");
    for (const file of files) {
      objectStore.put(file, file.id);
    }

    transaction.oncomplete = function () {
      console.info("All records added successfully!");
      resolve();
    };

    transaction.onerror = function (event) {
      console.error("Transaction error:", event.target.error);
      reject(event.target.error);
    };
  });
};

export const getAllFiles = async () => {
  /**
   * @type {{
   *  created: Date;
   *  dataURL: string;
   *  id: string;
   *  lastRetrieved: number;
   *  mimeType: string;
   * }[]}
   */
  const files = await new Promise((resolve, reject) => {
    const transaction = filesStoreConnection.transaction(
      ["files-store"],
      "readonly",
    );
    const objectStore = transaction.objectStore("files-store");
    const request = objectStore.getAll();
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
    request.onerror = function (event) {
      reject(`获取所有数据出错: ${event.target.error}`);
    };
  });

  return files;
};
/// extracts relative files from indexed-db.
export const getRelativeFiles = async (elements) => {
  const files = await getAllFiles();

  const usedFiles = files.filter((file) => {
    if (elements.find((e) => e.fileId === file.id)) {
      return true;
    }
    return false;
  });

  /**
   * @type {{[id: string]: {
   *  created: Date;
   *  dataURL: string;
   *  id: string;
   *  lastRetrieved: number;
   *  mimeType: string;
   * }}}
   */
  const filesDict = usedFiles.reduce((pre, cur) => {
    return {
      ...pre,
      [cur.id]: cur,
    };
  }, {});

  return filesDict;
};

/**
 * Get all media files from the indexed-db store.
 *
 * Returns a Promise resolving with `{ files }`. Also emits the
 * `getAllMedias` event for backward compat with hosts that use
 * `evaluateJavaScript` + id-based event matching. Hosts using
 * `callAsyncJavaScript` should pass `null` for `id` and `await` the
 * return value.
 *
 * @param {string|null} id  Legacy request id (ignored when awaiting).
 * @returns {Promise<{ files: any[] }>}
 * @throws on indexed-db read failure
 */
export const getAllMedias = async (id) => {
  try {
    const files = await getAllFiles();
    const result = { files };

    sendMessage({
      event: "getAllMedias",
      data: { id, ...result },
    });

    return result;
  } catch (error) {
    console.error("[getAllMedias] failed", error);
    const errMessage = error?.message || String(error);

    sendMessage({
      event: "getAllMedias",
      data: { id, error: errMessage },
    });

    throw error;
  }
};
