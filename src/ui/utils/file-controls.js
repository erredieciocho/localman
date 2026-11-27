export function setupFileControls(root, {
  supportsOpenPicker = false,
  onOpenFile,
  onLoadFile,
  onLoad,
  onRestoreFile,
  onSave,
  onExport,
  download,
  onError,
  notify = () => {},
  notifyWarning = notify,
}) {
  const openButton = root.querySelector("#open-button");
  const restoreButton = root.querySelector("#restore-file-button");
  const openRestorePair = root.querySelector("#open-restore-button-pair");
  const fileInput = root.querySelector("#file-input");
  const saveButton = root.querySelector("#save-button");
  const exportButton = root.querySelector("#export-button");
  const fileStatus = root.querySelector("#file-status");
  let hasDocument = false;
  let fileName = "";
  let formatId = "csv";
  let canSave = false;
  let readonly = false;
  let loadOperation = 0;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) await loadFile(file);
  });

  restoreButton?.addEventListener("click", async () => {
    restoreButton.disabled = true;
    const operation = ++loadOperation;
    try {
      const loaded = await onRestoreFile({ requestPermission: true });
      if (operation !== loadOperation) return;
      if (loaded) await showLoadedFile(loaded);
      setRestoreButtonHidden(true);
    } catch (error) {
      if (operation !== loadOperation) return;
      const details = error instanceof Error ? error.message : String(error);
      notifyWarning(`Could not restore the previously opened localisation file: ${details}`);
    } finally {
      restoreButton.disabled = false;
    }
  });

  openButton.addEventListener("click", async () => {
    if (!supportsOpenPicker) {
      fileInput.click();
      return;
    }
    try {
      const loaded = await onOpenFile();
      if (loaded) {
        loadOperation += 1;
        await showLoadedFile(loaded);
      }
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
      const suggestedName = getEditedFileName(fileName, formatId);
      const outputName = await onExport(suggestedName);
      if (!outputName) return;
      fileStatus.textContent = `Exported ${outputName}`;
      notify(`Exported ${outputName}.`);
    } catch (error) {
      if (error?.name !== "AbortError") showError(error);
    }
  });

  async function loadFile(file) {
    loadOperation += 1;
    fileStatus.textContent = `Reading ${file.name}...`;
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
    formatId = loaded.document?.formatId ?? "csv";
    readonly = Boolean(loaded.document?.readonly);
    canSave = Boolean(loaded.canSave) && !readonly;
    saveButton.disabled = readonly || !canSave;
    saveButton.title = readonly
      ? "Save is unavailable because this format is read-only"
      : canSave
        ? "Overwrite the currently open localisation file"
        : "Save requires a browser file picker; use Export to save a separate copy";
    exportButton.disabled = readonly;
    exportButton.title = readonly
      ? "Export is unavailable because this format is read-only"
      : "Export a separate copy of the currently open file";
    fileStatus.textContent = `${fileName} loaded`;
    setRestoreButtonHidden(true);
    notify(`Loaded ${fileName}.`);
    if (loaded.persistenceError) {
      const details = loaded.persistenceError instanceof Error
        ? loaded.persistenceError.message
        : String(loaded.persistenceError);
      notifyWarning(`Loaded ${fileName}, but its file handle could not be remembered: ${details}`);
    }
  }

  async function restoreLastFile() {
    if (typeof onRestoreFile !== "function") return;
    const operation = loadOperation;
    try {
      const loaded = await onRestoreFile();
      if (operation !== loadOperation) return;
      if (loaded) await showLoadedFile(loaded);
    } catch (error) {
      if (operation !== loadOperation) return;
      const details = error instanceof Error ? error.message : String(error);
      if (error?.name === "FileHandlePermissionError" && restoreButton) {
        setRestoreButtonHidden(false);
        notifyWarning("The previously opened localisation file needs read access. Select Restore last file to grant access.");
        return;
      }
      notifyWarning(`Could not reload the previously opened localisation file: ${details}`);
    }
  }

  function showError(error) {
    onError(error);
  }

  function setRestoreButtonHidden(hidden) {
    if (!restoreButton) return;
    restoreButton.hidden = hidden;
    openRestorePair?.classList.toggle("button-pair--single", hidden);
  }

  return {
    showError,
    restoreLastFile,
    download(contents, outputName) {
      download(contents, outputName);
    },
    setStatus(message) {
      fileStatus.textContent = message;
    },
    setUnsavedStatus(message = "Unsaved edits") {
      fileStatus.textContent = readonly
        ? `${message} — this file format is read-only`
        : canSave
        ? `${message} — Save to overwrite this file or Export to save a copy`
        : `${message} — Save is unavailable for this file; Export to save a copy`;
    },
  };
}

export function getEditedFileName(fileName, formatId = "csv") {
  const baseName = fileName.replace(/\.[^.]*$/u, "") || "localisation";
  const extension = formatId === "txt" ? "txt" : formatId === "cld" ? "cld" : "csv";
  return `${baseName}.edited.${extension}`;
}

export function getSectionExportFileName(fileName, sectionName, sectionIndex, formatId = "csv") {
  const baseName = fileName.replace(/\.[^.]*$/u, "") || "localisation";
  const sectionLabel = (sectionName || `section-${sectionIndex + 1}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/[. ]+$/u, "") || `section-${sectionIndex + 1}`;
  const extension = formatId === "txt" ? "txt" : "csv";
  return `${baseName}.${sectionLabel}.${extension}`;
}
