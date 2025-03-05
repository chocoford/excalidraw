export const sendMessage = ({ event, data }) => {
  if (
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.excalidrawZ
  ) {
    console.info("sendMessage", { event, data });
    try {
      window.webkit.messageHandlers.excalidrawZ.postMessage({
        event,
        data,
      });
    } catch (error) {
      console.error(error);
    }
  } else {
    console.error("can not send message", { event, data });
  }
};
