const getObjectKeyCount = (value) =>
  value && typeof value === "object" ? Object.keys(value).length : 0;

const summarizeMessageForLog = ({ event, data }) => {
  if (event === "currentFileSaveStreamChunk") {
    return {
      event,
      data: {
        streamId: data?.streamId,
        index: data?.index,
        base64Chars:
          typeof data?.base64 === "string" ? data.base64.length : undefined,
      },
    };
  }

  if (event !== "onStateChanged") {
    return { event, data };
  }

  const stateData = data?.data;

  return {
    event,
    data: {
      revision: stateData?.revision,
      dirty: stateData?.dirty,
      contentDirty: stateData?.contentDirty,
      appStateDirty: stateData?.appStateDirty,
      elementCount: Array.isArray(stateData?.elements)
        ? stateData.elements.length
        : stateData?.elementCount,
      deletedElementCount: stateData?.deletedElementCount,
      fileElementCount: stateData?.fileElementCount,
      fileCount: stateData?.fileCount ?? getObjectKeyCount(stateData?.files),
      appStateKeyCount:
        stateData?.appStateKeyCount ?? getObjectKeyCount(stateData?.appState),
      appStateChars: stateData?.appStateChars,
      dataStringChars:
        typeof stateData?.dataString === "string"
          ? stateData.dataString.length
          : undefined,
    },
  };
};

export const sendMessage = ({ event, data }) => {
  const messageHandler =
    typeof window !== "undefined"
      ? window.webkit?.messageHandlers?.excalidrawZ
      : null;

  if (!messageHandler) {
    return false;
  }

  console.info("sendMessage", { event, data });
  try {
    messageHandler.postMessage({
      event,
      data,
    });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
