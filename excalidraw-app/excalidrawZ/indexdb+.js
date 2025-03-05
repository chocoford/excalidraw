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
 * Send media files to client.
 * @param {string} id The id used to map message from ExcalidrawZ.
 * @param {any[]} files Media files.
 */
export const getAllMedias = async (id) => {
  const files = await getAllFiles();
  sendMessage({
    event: "getAllMedias",
    data: {
      id,
      files,
    },
  });
};
