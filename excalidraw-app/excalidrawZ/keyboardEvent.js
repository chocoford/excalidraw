export const keybardEvents = (() => {
  const eventInfo = {};
  for (let i = 0; i <= 9; i++) {
    const key = i.toString();
    const keyCode = 48 + i; // '0' 对应的 keyCode 是 48，依次类推
    eventInfo[i] = {
      key,
      code: `Digit${key}`,
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode,
      which: keyCode,
    };
  }
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i); // 'A' 对应的 ASCII 码是 65，依次类推
    const keyCode = 65 + i; // 'A' 对应的 keyCode 是 65，依次类推
    eventInfo[letter] = {
      key: letter,
      code: `Key${letter}`,
      altKey: false,
      shiftKey: false,
      composed: true,
      keyCode,
      which: keyCode,
    };
  }

  eventInfo.Escape = {
    key: "Escape",
    code: "Escape",
    altKey: false,
    shiftKey: false,
    composed: true,
    keyCode: 27, // ESC 对应的 keyCode 是 27
    which: 27,
  };

  eventInfo.Space = {
    key: " ",
    code: "Space",
    altKey: false,
    shiftKey: false,
    composed: true,
    keyCode: 32, // Space 对应的 keyCode 是 32
    which: 32,
  };

  return eventInfo;
})();
