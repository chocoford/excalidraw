import { THEME } from "@excalidraw/common";

import type { ExcalidrawElement } from "./types";

const EXCALIDRAWZ_CUSTOM_DATA_KEY = "excalidrawZ";
const EXCALIDRAWZ_MATH_ELEMENT_TYPE = "math";

export const getExcalidrawZMathData = (
  element: Pick<ExcalidrawElement, "customData">,
) => {
  const customData = element.customData?.[EXCALIDRAWZ_CUSTOM_DATA_KEY];

  if (
    !!customData &&
    typeof customData === "object" &&
    customData.type === EXCALIDRAWZ_MATH_ELEMENT_TYPE
  ) {
    return customData;
  }

  return null;
};

export const isExcalidrawZMathElement = (
  element: Pick<ExcalidrawElement, "customData">,
) => {
  return getExcalidrawZMathData(element) !== null;
};

export const shouldApplyExcalidrawZMathColorFilter = ({
  element,
  theme,
}: {
  element: Pick<ExcalidrawElement, "customData">;
  theme: string;
}) => {
  return theme === THEME.DARK && isExcalidrawZMathElement(element);
};
