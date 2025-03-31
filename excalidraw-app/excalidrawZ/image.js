/**
 *
 * @param {HTMLImageElement} img
 * @param {number} width
 * @param {number} height
 * @returns HTMLCanvas
 */
export const antiInvertImage = (img, width, height) => {
  const invertFactor = 0.93; // invert(93%)
  const hueRotateDegrees = 180; // hue-rotate(180deg)

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 处理像素数据
  for (let i = 0; i < data.length; i += 4) {
    // 反转 invert
    data[i] = clamp(data[i] + invertFactor * (255 - 2 * data[i])); // R
    data[i + 1] = clamp(data[i + 1] + invertFactor * (255 - 2 * data[i + 1])); // G
    data[i + 2] = clamp(data[i + 2] + invertFactor * (255 - 2 * data[i + 2]));

    // 反转 hue-rotate
    const [r, g, b] = applyHueRotation(
      data[i],
      data[i + 1],
      data[i + 2],
      -hueRotateDegrees,
    );
    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
    // Alpha 通道保持不变
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
};

// 色相旋转函数
function applyHueRotation(r, g, b, degrees) {
  // RGB -> HSL
  let [h, s, l] = rgbToHsl(r, g, b);
  h = (h + degrees) % 360;
  if (h < 0) {
    h += 360;
  }
  // HSL -> RGB
  return hslToRgb(h, s, l);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0; // 无色
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l; // 无色
  } else {
    const hue2rgb = function (p, q, t) {
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

export const toggleAntiInvertImageSettings = (payload) => {
  window.excalidrawZHelper.preventInvertImageFlags = {
    ...window.excalidrawZHelper.preventInvertImageFlags,
    ...payload,
  };
};
