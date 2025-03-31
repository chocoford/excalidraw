// overwrite clipboard
async function clipboardItemsToBase64(clipboardItems) {
  const base64Promises = clipboardItems.map(async (item) => {
    // console.warn(item)
    return Promise.all(
      item.types.map(async (type) => {
        const value = item.getType(type);
        // 检查value是否为Promise，如果是，则等待其解析
        const data = value instanceof Promise ? await value : value;
        if (data instanceof Blob) {
          // 如果数据是Blob，转换为Base64字符串
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ type, data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(data);
          });
        } else if (typeof data === "string") {
          return { type, data };
        }
        // 对于其他类型的数据，这里可以根据需要添加更多的处理分支
      }),
    );
  });

  // 等待所有Promise完成
  const results = await Promise.all(base64Promises);
  return results.flat(); // 返回一个扁平化的数组，包含所有类型的Base64字符串
}
navigator.clipboard.write = async (data) => {
  const items = await clipboardItemsToBase64(data);
  // console.log(data, items)
  window.webkit.messageHandlers.excalidrawZ.postMessage({
    event: "copy",
    data: items,
  });
};
navigator.clipboard.writeText = async (string) => {
  // console.log(string)
  window.webkit.messageHandlers.excalidrawZ.postMessage({
    event: "copy",
    data: [{ type: "text", data: string }],
  });
};
