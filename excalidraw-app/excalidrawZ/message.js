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
