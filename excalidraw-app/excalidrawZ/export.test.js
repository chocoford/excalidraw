import * as exportUtils from "../../packages/utils/src";

import { exportElementsToBlob, exportElementsToSvg } from "./export";

describe("exportElementsToBlob", () => {
  let exportSceneMock;

  beforeEach(() => {
    exportSceneMock = vi
      .spyOn(exportUtils, "exportScene")
      .mockResolvedValue(new Blob(["export"], { type: "image/png" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses exportingFrame for bounds without rendering the frame", async () => {
    const exportingFrame = {
      id: "export-frame",
      type: "frame",
      x: 10,
      y: 20,
      width: 640,
      height: 480,
      isDeleted: false,
    };
    const content = {
      id: "content",
      type: "rectangle",
      isDeleted: false,
    };
    const deleted = {
      id: "deleted",
      type: "rectangle",
      isDeleted: true,
    };

    await exportElementsToBlob(
      [exportingFrame, content, deleted],
      {},
      { exportingFrame },
    );

    expect(exportSceneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "png",
        data: expect.objectContaining({ elements: [content] }),
        config: expect.objectContaining({ exportingFrame }),
      }),
    );
  });

  it("passes Native SVG settings through the new export API", async () => {
    exportSceneMock.mockResolvedValue(
      document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    );
    const element = { id: "content", type: "rectangle", isDeleted: false };

    await exportElementsToSvg([element], {}, true, false, true, 2, "#123456");

    expect(exportSceneMock).toHaveBeenCalledWith({
      type: "svg",
      data: {
        elements: [element],
        files: {},
        appState: { viewBackgroundColor: "#123456" },
      },
      config: {
        embedScene: true,
        canvasBackgroundColor: false,
        theme: "dark",
        scale: 2,
      },
    });
  });
});
