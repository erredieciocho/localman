export function createBrowserFileSystem(appWindow, {
  download,
  openFilePicker,
  saveFilePicker,
} = {}) {
  appWindow ??= globalThis.window;
  const openPicker = openFilePicker ?? appWindow?.showOpenFilePicker?.bind(appWindow);
  const savePicker = saveFilePicker ?? (download
    ? null
    : appWindow?.showSaveFilePicker?.bind(appWindow));
  const downloadFile = download ?? ((contents, fileName, contentType) =>
    downloadBlob(contents, fileName, appWindow, contentType));
  const TextDecoderClass = appWindow?.TextDecoder ?? globalThis.TextDecoder;

  async function writeFile(handle, contents) {
    const writable = await handle.createWritable();
    try {
      await writable.write(contents);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch (abortError) {
        throw new AggregateError(
          [error, abortError],
          "Writing the localisation file and aborting the write both failed.",
        );
      }
      throw error;
    }
  }

  return Object.freeze({
    supportsOpenPicker: Boolean(openPicker),
    async openFile() {
      if (!openPicker) return null;
      const [handle] = await openPicker({
        types: [{ description: "Localisation CSV", accept: { "text/csv": [".csv"] } }],
      });
      return handle ? { file: await handle.getFile(), handle } : null;
    },
    async readFile(file) {
      if (typeof file?.arrayBuffer === "function") {
        return decodeFileBytes(new Uint8Array(await file.arrayBuffer()), TextDecoderClass);
      }
      if (typeof file?.text === "function") {
        const contents = await file.text();
        return {
          contents,
          encoding: "utf-8",
          hasByteOrderMark: contents.startsWith("\uFEFF"),
        };
      }
      throw new TypeError("The selected file cannot be read as text.");
    },
    encodeText(contents, { encoding = "utf-8", hasByteOrderMark = false } = {}) {
      return encodeFileText(contents, { encoding, hasByteOrderMark });
    },
    writeFile,
    downloadFile,
    async exportFile(contents, suggestedName, sourceHandle) {
      if (!savePicker) {
        downloadFile(contents, suggestedName);
        return suggestedName;
      }
      const handle = await savePicker({
        suggestedName,
        types: [{ description: "Localisation CSV", accept: { "text/csv": [".csv"] } }],
      });
      if (!handle) return null;
      if (sourceHandle && await handle.isSameEntry?.(sourceHandle)) {
        throw new Error("Export must use a separate file; use Save to overwrite the currently open file.");
      }
      await writeFile(handle, contents);
      return handle.name || suggestedName;
    },
  });
}

function downloadBlob(contents, fileName, appWindow, contentType) {
  if (!appWindow?.document || !appWindow.URL || !appWindow.Blob) {
    throw new Error("Browser downloads are unavailable in this environment.");
  }
  const blob = new appWindow.Blob([contents], { type: contentType || getCsvContentType(contents) });
  const url = appWindow.URL.createObjectURL(blob);
  const link = appWindow.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  appWindow.document.body.append(link);
  link.click();
  link.remove();
  appWindow.setTimeout(() => appWindow.URL.revokeObjectURL(url), 0);
}

function getCsvContentType(contents) {
  if (contents instanceof Uint8Array) {
    if (startsWithBytes(contents, [0xff, 0xfe])) return "text/csv;charset=utf-16le";
    if (startsWithBytes(contents, [0xfe, 0xff])) return "text/csv;charset=utf-16be";
    return "text/csv";
  }
  return "text/csv;charset=utf-8";
}

function decodeFileBytes(bytes, TextDecoderClass) {
  let encoding = "utf-8";
  let hasByteOrderMark = false;
  let offset = 0;
  if (startsWithBytes(bytes, [0x00, 0x00, 0xfe, 0xff])
    || startsWithBytes(bytes, [0xff, 0xfe, 0x00, 0x00])) {
    throw new Error("UTF-32 localisation files are not supported; convert the file to UTF-8 or UTF-16.");
  }
  if (startsWithBytes(bytes, [0xef, 0xbb, 0xbf])) {
    hasByteOrderMark = true;
    offset = 3;
  } else if (startsWithBytes(bytes, [0xff, 0xfe])) {
    encoding = "utf-16le";
    hasByteOrderMark = true;
    offset = 2;
  } else if (startsWithBytes(bytes, [0xfe, 0xff])) {
    encoding = "utf-16be";
    hasByteOrderMark = true;
    offset = 2;
  }
  if (typeof TextDecoderClass !== "function") {
    throw new Error("Text decoding is unavailable in this browser.");
  }
  try {
    const contents = new TextDecoderClass(encoding, { fatal: true, ignoreBOM: true })
      .decode(bytes.subarray(offset));
    return { contents, encoding, hasByteOrderMark };
  } catch {
    throw new Error(
      `Could not decode the localisation file as ${encoding.toUpperCase()}; only UTF-8 and BOM-marked UTF-16 are supported.`,
    );
  }
}

function encodeFileText(contents, { encoding, hasByteOrderMark }) {
  if (typeof contents !== "string" || typeof hasByteOrderMark !== "boolean") {
    throw new TypeError("File output requires text and valid byte-order-mark metadata.");
  }
  if (encoding === "utf-8") {
    return hasByteOrderMark && !contents.startsWith("\uFEFF")
      ? `\uFEFF${contents}`
      : contents;
  }
  if (encoding !== "utf-16le" && encoding !== "utf-16be") {
    throw new Error(`Saving files encoded as "${encoding}" is not supported.`);
  }
  const text = hasByteOrderMark && contents.startsWith("\uFEFF") ? contents.slice(1) : contents;
  const byteOrderMarkSize = hasByteOrderMark ? 2 : 0;
  const bytes = new Uint8Array(byteOrderMarkSize + text.length * 2);
  if (hasByteOrderMark) {
    bytes[0] = encoding === "utf-16le" ? 0xff : 0xfe;
    bytes[1] = encoding === "utf-16le" ? 0xfe : 0xff;
  }
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    const offset = byteOrderMarkSize + index * 2;
    bytes[offset + (encoding === "utf-16le" ? 0 : 1)] = codeUnit & 0xff;
    bytes[offset + (encoding === "utf-16le" ? 1 : 0)] = codeUnit >> 8;
  }
  return bytes;
}

function startsWithBytes(bytes, prefix) {
  return prefix.every((byte, index) => bytes[index] === byte);
}
