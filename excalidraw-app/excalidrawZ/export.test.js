import * as exportUtils from "../../packages/utils/src";

import { exportElementsToBlob } from "./export";

describe("exportElementsToBlob", () => {
  let exportToBlobMock;

  beforeEach(() => {
    exportToBlobMock = vi
      .spyOn(exportUtils, "exportToBlob")
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

    expect(exportToBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        elements: [content],
        exportingFrame,
      }),
    );
  });
});
