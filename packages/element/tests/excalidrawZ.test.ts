import {
  getExcalidrawZMathData,
  isExcalidrawZMathElement,
  shouldApplyExcalidrawZMathColorFilter,
} from "../src/excalidrawZ";

describe("excalidrawZ", () => {
  it("detects ExcalidrawZ math elements", () => {
    const mathData = { type: "math", latex: "x^2" };

    expect(
      isExcalidrawZMathElement({
        customData: { excalidrawZ: mathData },
      }),
    ).toBe(true);
    expect(
      getExcalidrawZMathData({
        customData: { excalidrawZ: mathData },
      }),
    ).toBe(mathData);

    expect(
      isExcalidrawZMathElement({
        customData: { excalidrawZ: { type: "image" } },
      }),
    ).toBe(false);
    expect(
      getExcalidrawZMathData({
        customData: { excalidrawZ: { type: "image" } },
      }),
    ).toBe(null);
  });

  it("applies math color filtering only in dark theme", () => {
    const mathElement = {
      customData: { excalidrawZ: { type: "math" } },
    };

    expect(
      shouldApplyExcalidrawZMathColorFilter({
        element: mathElement,
        theme: "dark",
      }),
    ).toBe(true);

    expect(
      shouldApplyExcalidrawZMathColorFilter({
        element: mathElement,
        theme: "light",
      }),
    ).toBe(false);

    expect(
      shouldApplyExcalidrawZMathColorFilter({
        element: { customData: undefined },
        theme: "dark",
      }),
    ).toBe(false);
  });
});
