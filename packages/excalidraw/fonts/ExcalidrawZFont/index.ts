import YRDZST from "./YRDZST-Regular.ttf";
import SetoFont from "./SetoFont.ttf";
import BinggraeSamanco from "./BinggraeSamanco.otf";
import Excalidrawfont_0 from "../Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

export const ExcalidrawZFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: Excalidrawfont_0,
    descriptors: {
      unicodeRange:
        "U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212",
    },
  },
  {
    uri: YRDZST,
  },
  {
    uri: SetoFont,
  },
  {
    uri: BinggraeSamanco,
  },
];
