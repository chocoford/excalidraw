import { getRelativeFiles } from "./indexdb+";

const getReferencedFileIds = (elements) =>
  elements.reduce((fileIds, element) => {
    if (element?.fileId) {
      fileIds.add(element.fileId);
    }
    return fileIds;
  }, new Set());

/**
 * Resolve only the files referenced by the supplied elements.
 *
 * Live API files take precedence because newly inserted files may not have
 * reached IndexedDB yet. IndexedDB is queried only for references missing
 * from the live API.
 *
 * @param {{ getFiles?: () => Record<string, any> } | null} api
 * @param {readonly any[]} elements
 * @returns {Promise<Record<string, any>>}
 */
export const getReferencedFiles = async (api, elements) => {
  const referencedFileIds = getReferencedFileIds(elements);
  if (referencedFileIds.size === 0) {
    return {};
  }

  const liveFiles = api?.getFiles?.() ?? {};
  const files = {};
  const missingFileIds = new Set();

  referencedFileIds.forEach((fileId) => {
    if (liveFiles[fileId]) {
      files[fileId] = liveFiles[fileId];
    } else {
      missingFileIds.add(fileId);
    }
  });

  if (missingFileIds.size === 0) {
    return files;
  }

  const missingFileElements = elements.filter((element) =>
    missingFileIds.has(element?.fileId),
  );
  const fallbackFiles = await getRelativeFiles(missingFileElements);

  missingFileIds.forEach((fileId) => {
    if (fallbackFiles[fileId]) {
      files[fileId] = fallbackFiles[fileId];
    }
  });

  return files;
};
