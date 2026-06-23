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

export const getFilesByIds = async (fileIds) => {
  const ids = Array.from(fileIds ?? []).filter(Boolean);
  if (!ids.length) {
    return [];
  }

  const files = await new Promise((resolve, reject) => {
    const transaction = filesStoreConnection.transaction(
      ["files-store"],
      "readonly",
    );
    const objectStore = transaction.objectStore("files-store");
    const files = [];

    ids.forEach((id) => {
      const request = objectStore.get(id);
      request.onsuccess = function (event) {
        if (event.target.result) {
          files.push(event.target.result);
        }
      };
    });

    transaction.oncomplete = function () {
      resolve(files);
    };
    transaction.onerror = function (event) {
      reject(`获取指定文件出错: ${event.target.error}`);
    };
  });

  return files;
};

/// extracts relative files from indexed-db.
export const getRelativeFiles = async (elements) => {
  const fileIds = elements.reduce((ids, element) => {
    if (element?.fileId) {
      ids.add(element.fileId);
    }
    return ids;
  }, new Set());

  const usedFiles = await getFilesByIds(fileIds);

  /**
   * @type {{[id: string]: {
   *  created: Date;
   *  dataURL: string;
   *  id: string;
   *  lastRetrieved: number;
   *  mimeType: string;
   * }}}
   */
  const filesDict = {};
  usedFiles.forEach((file) => {
    filesDict[file.id] = file;
  });

  return filesDict;
};

/**
 * Get all media files from the indexed-db store.
 *
 * Two call styles (host backwards compat):
 *   - **New**: `await getAllMedias()` → `Promise<{ files }>`
 *   - **Old**: `getAllMedias(id)` → fires `getAllMedias` event with
 *     `{ id, files }`. Still returns Promise.
 *
 * @returns {Promise<{ files: any[] }>}
 * @throws on indexed-db read failure
 */
export const getAllMedias = async (id) => {
  const files = await getAllFiles();
  if (id !== undefined) {
    sendMessage({ event: "getAllMedias", data: { id, files } });
  }
  return { files };
};
