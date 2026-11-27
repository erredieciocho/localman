export function createLocalisationService({ parsers, fileSystem } = {}) {
  if (!parsers || !fileSystem) {
    throw new TypeError("A parser registry and file-system adapter are required.");
  }
  let fileHandle = null;
  let restoreHandle = null;
  let hasUnsavedChanges = false;

  async function loadFile(file, options = {}, selectedFileHandle = null) {
    if (typeof file?.name !== "string" || !/\.(?:csv|cld|txt)$/iu.test(file.name)) {
      throw new Error("Unsupported localisation file extension. Open a .csv, .cld or .txt file.");
    }
    const document = await readDocument(file, options);
    fileHandle = selectedFileHandle;
    restoreHandle = selectedFileHandle;
    hasUnsavedChanges = false;
    const persistenceError = await persistFileHandle(selectedFileHandle);
    return {
      document,
      fileName: file.name,
      encoding: document.encoding,
      hasByteOrderMark: document.hasByteOrderMark,
      canSave: Boolean(fileHandle) && !document.readonly,
      persistenceError,
    };
  }

  async function persistFileHandle(handle) {
    try {
      const persist = handle
        ? fileSystem.saveFileHandleData?.("localisation", handle)
        : fileSystem.removeFileHandleData?.("localisation");
      if (!persist) return null;
      await persist;
      return null;
    } catch (error) {
      return error;
    }
  }

  async function readDocument(file, options = {}) {
    const result = await fileSystem.readFile(file);
    const fileData = typeof result === "string" ? { contents: result } : result;
    if (!fileData || typeof fileData.contents !== "string") {
      throw new TypeError("The file-system adapter must return decoded file contents.");
    }
    const encoding = fileData.encoding ?? "utf-8";
    const hasByteOrderMark = fileData.hasByteOrderMark ?? fileData.contents.startsWith("\uFEFF");
    if (typeof encoding !== "string" || typeof hasByteOrderMark !== "boolean") {
      throw new TypeError("The file-system adapter returned invalid encoding metadata.");
    }
    return parsers.parse(fileData.contents, { ...options, encoding, hasByteOrderMark });
  }

  function encodeDocument(contents, document) {
    if (typeof fileSystem.encodeText !== "function") {
      throw new TypeError("The file-system adapter must encode output using the document encoding.");
    }
    return fileSystem.encodeText(contents, {
      encoding: document.encoding,
      hasByteOrderMark: document.hasByteOrderMark,
    });
  }

  function prepareSectionExport(document, sectionIndex) {
    if (!document) throw new Error("Load a localisation file before exporting a section.");
    if (document.readonly) throw new Error("This localisation format is read-only.");
    const text = parsers.serializeSection(document, sectionIndex);
    return Object.freeze({
      text,
      contents: encodeDocument(text, document),
    });
  }

  return Object.freeze({
    supportsOpenPicker: Boolean(fileSystem.supportsOpenPicker),
    get hasUnsavedChanges() {
      return hasUnsavedChanges;
    },
    markDocumentChanged() {
      hasUnsavedChanges = true;
    },
    async openFile(options) {
      const selected = await fileSystem.openFile();
      return selected ? loadFile(selected.file, options, selected.handle) : null;
    },
    async restoreFile(options, { requestPermission = false } = {}) {
      if (!fileSystem.supportsPersistentHandles
        || typeof fileSystem.getFileHandleData !== "function") return null;
      const handle = restoreHandle ?? await fileSystem.getFileHandleData("localisation");
      if (!handle) return null;
      restoreHandle = handle;
      const file = await fileSystem.readFileHandle(handle, { requestPermission });
      return loadFile(file, options, handle);
    },
    loadFile(file, options) {
      return loadFile(file, options);
    },
    parse(contents, options) {
      return parsers.parse(contents, options);
    },
    parseFile(file, options) {
      return readDocument(file, options);
    },
    supportsSectionOperations(document) {
      return parsers.supportsSectionOperations(document);
    },
    serialize(document) {
      return parsers.serialize(document);
    },
    serializeSection(document, sectionIndex) {
      return prepareSectionExport(document, sectionIndex).contents;
    },
    prepareSectionExport(document, sectionIndex) {
      return prepareSectionExport(document, sectionIndex);
    },
    reparseDocument(document, options) {
      if (!document) throw new Error("Load a localisation file before applying document options.");
      const reparse = parsers.reparse
        ? (inputOptions) => parsers.reparse(document, inputOptions)
        : (inputOptions) => parsers.parse(parsers.serialize(document), inputOptions);
      return reparse({
        ...options,
        encoding: document.encoding,
        hasByteOrderMark: document.hasByteOrderMark,
      });
    },
    async saveFile(document) {
      if (!document) throw new Error("Load a localisation file before saving.");
      if (document.readonly) throw new Error("This localisation format is read-only.");
      if (!fileHandle) throw new Error("Save requires a writable handle for the opened file.");
      await fileSystem.writeFile(fileHandle, encodeDocument(parsers.serialize(document), document));
      hasUnsavedChanges = false;
      return fileHandle.name;
    },
    async exportFile(document, suggestedName) {
      if (!document) throw new Error("Load a localisation file before exporting.");
      if (document.readonly) throw new Error("This localisation format is read-only.");
      const outputName = await fileSystem.exportFile(
        encodeDocument(parsers.serialize(document), document),
        suggestedName,
        fileHandle,
      );
      if (outputName) hasUnsavedChanges = false;
      return outputName;
    },
    async importSection(document, sectionIndex, file) {
      if (!document) throw new Error("Load a localisation file before importing a section.");
      if (document.readonly) throw new Error("This localisation format is read-only.");
      if (typeof sectionIndex !== "number") {
        throw new Error("Select an individual section before importing.");
      }
      const target = document.sections[sectionIndex];
      if (!target) throw new RangeError(`Section index ${sectionIndex} does not exist.`);

      const imported = await readDocument(file);
      const sameName = imported.sections.filter((section) => section.name === target.name);
      const matchingSections = sameName.filter((section) =>
        section.columns.length === target.columns.length
        && section.columns.every((column, index) => column === target.columns[index]));
      if (matchingSections.length !== 1) {
        if (sameName.length && matchingSections.length === 0) {
          throw new Error(`The imported section "${target.name ?? "unnamed"}" has different columns.`);
        }
        throw new Error(`The imported file must contain exactly one section named "${target.name ?? "unnamed"}".`);
      }

      const replacedDocument = parsers.replaceSection(
        document,
        sectionIndex,
        imported,
        matchingSections[0].index,
      );
      hasUnsavedChanges = true;
      return {
        document: replacedDocument,
        sectionName: target.name || `section ${sectionIndex + 1}`,
      };
    },
  });
}
