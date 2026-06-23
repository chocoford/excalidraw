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
  const logPayload = summarizeMessageForLog({ event, data });

  if (
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.excalidrawZ
  ) {
    console.info("sendMessage", logPayload);
    try {
      window.webkit.messageHandlers.excalidrawZ.postMessage({
        event,
        data,
      });
    } catch (error) {
      console.error(error);
    }
  } else {
    console.error("can not send message", logPayload);
  }
};
