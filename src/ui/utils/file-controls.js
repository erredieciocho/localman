export function setupFileControls(root, {
  supportsOpenPicker = false,
  onOpenFile,
  onLoadFile,
  onLoad,
  onSave,
  onExport,
  download,
  onError,
  notify = () => {},
}) {
  const openButton = root.querySelector("#open-button");
  const fileInput = root.querySelector("#file-input");
  const saveButton = root.querySelector("#save-button");
  const exportButton = root.querySelector("#export-button");
  const fileStatus = root.querySelector("#file-status");
  let hasDocument = false;
  let fileName = "";
  let canSave = false;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) await loadFile(file);
  });

  openButton.addEventListener("click", async () => {
    if (!supportsOpenPicker) {
      fileInput.click();
      return;
    }
    try {
      const loaded = await onOpenFile();
      if (loaded) await showLoadedFile(loaded);
    } catch (error) {
      if (error?.name !== "AbortError") {
        fileStatus.textContent = hasDocument ? `${fileName} loaded` : "No file loaded";
        showError(error);
      }
    }
  });

  saveButton.addEventListener("click", async () => {
    if (!hasDocument || !canSave) return;
    try {
      const savedName = await onSave();
      const name = savedName || fileName;
      fileStatus.textContent = `Saved ${name}`;
      notify(`Saved ${name} successfully.`);
    } catch (error) {
      fileStatus.textContent = `Could not save ${fileName}`;
      const details = error instanceof Error ? error.message : String(error);
      showError(new Error(`Could not save ${fileName}: ${details}`, { cause: error }));
    }
  });

  exportButton.addEventListener("click", async () => {
    if (!hasDocument) {
      return;
    }
    try {
      const suggestedName = getEditedFileName(fileName);
      const outputName = await onExport(suggestedName);
      if (!outputName) return;
      fileStatus.textContent = `Exported ${outputName}`;
      notify(`Exported ${outputName}.`);
    } catch (error) {
      if (error?.name !== "AbortError") showError(error);
    }
  });

  async function loadFile(file) {
    fileStatus.textContent = `Reading ${file.name}…`;
    try {
      await showLoadedFile(await onLoadFile(file));
    } catch (error) {
      fileStatus.textContent = hasDocument ? `${fileName} loaded` : "No file loaded";
      showError(error);
    }
  }

  async function showLoadedFile(loaded) {
    await onLoad(loaded);
    hasDocument = true;
    fileName = loaded.fileName;
    canSave = loaded.canSave;
    saveButton.disabled = !canSave;
    saveButton.title = canSave
      ? "Overwrite the currently open localisation file"
      : "Save requires a browser file picker; use Export to save a separate copy";
    exportButton.disabled = false;
    fileStatus.textContent = `${fileName} loaded`;
    notify(`Loaded ${fileName}.`);
  }

  function showError(error) {
    onError(error);
  }

  return {
    showError,
    download(contents, outputName) {
      download(contents, outputName);
    },
    setStatus(message) {
      fileStatus.textContent = message;
    },
    setUnsavedStatus(message = "Unsaved edits") {
      fileStatus.textContent = canSave
        ? `${message} — Save to overwrite this file or Export to save a copy`
        : `${message} — Save is unavailable for this file; Export to save a copy`;
    },
  };
}

export function getEditedFileName(fileName) {
  const baseName = fileName.replace(/\.[^.]*$/u, "") || "localisation";
  return `${baseName}.edited.csv`;
}

export function getSectionExportFileName(fileName, sectionName, sectionIndex) {
  const baseName = fileName.replace(/\.[^.]*$/u, "") || "localisation";
  const sectionLabel = (sectionName || `section-${sectionIndex + 1}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/[. ]+$/u, "") || `section-${sectionIndex + 1}`;
  return `${baseName}.${sectionLabel}.csv`;
}
