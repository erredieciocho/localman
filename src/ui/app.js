import { createParserRegistry } from "../core/parser/index.js";
import { isMapSection } from "../core/document/index.js";
import { getVisibleTextLength } from "../core/text/index.js";
import { collectValidationIssues, isWordExcluded } from "../core/validation/index.js";
import { createLocalisationService } from "../application/index.js";
import { tcoaalFormats } from "../plugins/TCOAAL/index.js";
import { createBrowserFileSystem } from "../platform/browser/file-system.js";
import { createBrowserStorage } from "../platform/browser/storage.js";
import { setupDashboard } from "./containers/dashboard.js";
import { setupEditor } from "./containers/editor.js";
import { setupCompare } from "./containers/compare.js";
import { setupMaps } from "./containers/maps.js";
import { setupQA } from "./containers/qa.js";
import { setupAbout } from "./containers/about.js";
import {
  SETTINGS_STORAGE_KEY,
  createSettingsController,
} from "./containers/settings.js";
import {
  collectTerminology,
  renderTerminology,
  selectTerminologyEntry,
} from "./containers/terminology.js";
import { setupModalComponents } from "./components/modal.js";
import { setupNotifications } from "./components/notifications.js";
import { setupTableComponents } from "./components/table.js";
import { setupDictionary } from "./utils/dictionary.js";
import { getSectionExportFileName, setupFileControls } from "./utils/file-controls.js";
import { setupOccurrences } from "./utils/occurrences.js";
import {
  createSourceColorStore,
  renderSourceColorLegend,
  SOURCE_COLORS_STORAGE_KEY,
} from "./utils/source-colors.js";
import {
  clearConfiguration,
  createConfiguration,
  parseConfiguration,
  persistConfiguration,
  THEME_STORAGE_KEY,
} from "./utils/configuration.js";

const TAB_DESCRIPTIONS = {
  dashboard: "Translation progress and statistics.",
  editor: "Edit localisation entries and review section checks.",
  compare: "Compare the open localisation with another file.",
  qa: "Review and track localisation quality issues.",
  terminology: "Review glossary terms and their usage.",
  maps: "Browse the map catalogue and matching localisation entries.",
  settings: "Configure application preferences.",
  about: "Read about LOCALMAN and how to use it.",
};
const READ_ONLY_UNAVAILABLE_TABS = new Set(["compare", "qa", "terminology", "maps"]);

export function initApp(root = document, { download, openFilePicker, saveFilePicker } = {}) {
  setupModalComponents(root);
  setupTableComponents(root);
  setupAbout(root);
  const notifications = setupNotifications(root);
  const showError = (error) => {
    notifications.error(error instanceof Error ? error.message : String(error));
  };
  const searchTerms = root.querySelector("#term-search");
  const termTypeFilter = root.querySelector("#term-type-filter");
  const state = {
    localisation: null,
    fileName: "",
    terminology: [],
    activeTab: "about",
    preferences: null,
    validationIssues: [],
    validationDirty: true,
    terminologyDirty: true,
    hasLoadedFile: false,
    mapDataStatus: "unknown",
  };
  const dictionaryExclusionExport = root.querySelector("#dictionary-exclusions-export-button");
  const dictionaryExclusionClear = root.querySelector("#dictionary-exclusions-clear-button");
  const dictionaryExclusionPair = dictionaryExclusionExport.parentElement;
  const configurationExport = root.querySelector("#configuration-export");
  const configurationClearAll = root.querySelector("#configuration-clear-all");
  const configurationPair = configurationExport.parentElement;
  let configurationStorageReadError = "";
  let configurationHandleReadError = "";
  let configurationVisibilityRequest = 0;
  let editor = null;
  let dashboard = null;
  let terminologyInitialized = false;
  let maps = null;
  const appWindow = root.ownerDocument?.defaultView ?? root.defaultView ?? globalThis.window;
  const fileSystem = createBrowserFileSystem(appWindow, { download, openFilePicker, saveFilePicker });
  const application = createLocalisationService({
    parsers: createParserRegistry(tcoaalFormats),
    fileSystem,
  });
  const compare = setupCompare(root, {
    onLoadTarget: (file) => application.parseFile(file),
    onError: showError,
    onOpenSection: (sectionName, sectionIndex) => {
      if (typeof sectionIndex === "number") navigateMapOrEditor(sectionIndex);
      else if (isMapSection(sectionName)) navigateToMapName(sectionName);
      else showError(new Error("This unnamed section exists only in the comparison target file."));
    },
    onOpenEntry: (sectionIndex, rowIndex, sectionName, entryId) => {
      if (typeof sectionIndex === "number") {
        navigate(sectionIndex, rowIndex);
      } else {
        showError(new Error(
          `Entry "${entryId}" in ${sectionName || "the unnamed section"} exists only in the comparison target file.`,
        ));
      }
    },
    onSourceClick: openSourceDetails,
    getSourceColor: (source) => sourceColors.get(source),
  });
  appWindow.addEventListener("beforeunload", (event) => {
    if (!application.hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
  const settingsStorage = createBrowserStorage(appWindow);
  const sourceColors = createSourceColorStore(settingsStorage);
  let lastSourceColorError = "";
  let wasReadOnly = false;
  const settings = createSettingsController(root, {
    onError: showError,
    onChange: updateConfigurationExportVisibility,
    notify: (type, message) => notifications.show(type, message),
    storage: settingsStorage,
  });
  state.preferences = settings.preferences;
  renderDictionaryExclusionsPreview();
  const theme = setupThemeToggle(root, appWindow, showError, settingsStorage);
  root.querySelector("#theme-toggle").addEventListener("click", updateConfigurationExportVisibility);
  updateConfigurationExportVisibility();
  const dictionary = setupDictionary(root, () => state.preferences, () => {
    state.validationDirty = true;
    refreshIssues();
    renderDashboard();
  }, showError, fileSystem, (language, variant) => {
    settings.update({
      dictionaryVariants: {
        ...settings.preferences.dictionaryVariants,
        [language]: variant,
      },
    }, { notify: false });
    state.preferences = settings.preferences;
  });
  dictionary.renderStatus();
  const navigate = (sectionIndex, rowIndex, untranslated = false) => {
    ensureEditor().setSelection(sectionIndex, rowIndex, untranslated ? "untranslated" : "");
    activateTab("editor");
  };
  const showOccurrences = setupOccurrences(
    root,
    (sectionIndex) => navigateMapOrEditor(sectionIndex),
    (sectionIndex, rowIndex) => navigate(sectionIndex, rowIndex),
  );
  setupSelectWheelNavigation(root);
  const qa = setupQA(root, {
    onError: showError,
    notify: (message) => notifications.success(message),
    onOpenSection: (sectionIndex) => navigateMapOrEditor(sectionIndex),
    onOpenEntry: (sectionIndex, rowIndex) => navigate(sectionIndex, rowIndex),
    download: fileSystem.downloadFile,
    storage: settingsStorage,
    onChange: ({ updateEditor = true } = {}) => {
      if (!root.querySelector("#panel-dashboard").hidden) {
        dashboard?.updateIssueCounts(qa.getUnresolvedIssueCounts());
      }
      if (updateEditor) {
        editor?.updateIssues(qa.getUnresolvedIssues(), dictionary.dictionary);
      }
    },
  });

  const fileControls = setupFileControls(root, {
    supportsOpenPicker: application.supportsOpenPicker,
    onOpenFile: () => application.openFile({ sectionIds: state.preferences.sectionIds }),
    onLoadFile: (file) => application.loadFile(file, { sectionIds: state.preferences.sectionIds }),
    onRestoreFile: ({ requestPermission = false } = {}) => application.restoreFile(
      { sectionIds: state.preferences.sectionIds },
      { requestPermission },
    ),
    download: fileSystem.downloadFile,
    notify: (message) => notifications.success(message),
    notifyWarning: (message) => notifications.warning(message),
    onLoad(loaded) {
      qa.reset();
      state.localisation = loaded.document;
      state.fileName = loaded.fileName;
      settings.setFormat(loaded.document.formatId);
      state.preferences = settings.preferences;
      editor?.setSelection(null);
      state.validationDirty = true;
      state.terminologyDirty = true;
      searchTerms.disabled = false;
      termTypeFilter.disabled = false;
      renderLoadedDocument();
      updateTabsAvailability(true);
      void updateConfigurationExportVisibility();
      if (!state.hasLoadedFile) {
        state.hasLoadedFile = true;
        activateTab("dashboard");
      }
    },
    onSave() {
      if (!state.localisation) throw new Error("Load a localisation file before saving.");
      return application.saveFile(state.localisation);
    },
    onExport(suggestedName) {
      if (!state.localisation) throw new Error("Load a localisation file before exporting.");
      return application.exportFile(state.localisation, suggestedName);
    },
    onError: showError,
  });

  for (const button of root.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  }
  updateTabsAvailability(false);

  const exclusionsInput = root.querySelector("#dictionary-exclusions-import");
  root.querySelector("#dictionary-exclusions-import-button").addEventListener("click", () => exclusionsInput.click());
  exclusionsInput.addEventListener("change", async () => {
    const [file] = exclusionsInput.files ?? [];
    if (!file) return;
    try {
      const exclusions = [...settings.preferences.dictionaryExclusions];
      const seen = new Set(exclusions.map((word) => word.toLocaleLowerCase()));
      let added = 0;
      for (const word of (await file.text()).split(/\r\n?|\n/u).map((value) => value.trim()).filter(Boolean)) {
        const key = word.toLocaleLowerCase();
        if (seen.has(key)) continue;
        exclusions.push(word);
        seen.add(key);
        added += 1;
      }
      settings.update({ dictionaryExclusions: exclusions }, { notify: false });
      applyPreferences(settings.preferences);
      root.querySelector("#dictionary-exclusions-status").textContent =
        `Added ${added.toLocaleString()} ${added === 1 ? "word" : "words"}; duplicates were skipped.`;
      settings.setStatus("Dictionary exclusions imported and saved.");
    } catch (error) {
      showError(error);
    } finally {
      exclusionsInput.value = "";
    }
  });
  root.querySelector("#dictionary-exclusions-clear-button").addEventListener("click", () => {
    try {
      settings.update({ dictionaryExclusions: [] }, { notify: false });
      applyPreferences(settings.preferences);
      root.querySelector("#dictionary-exclusions-status").textContent = "Dictionary exclusion list cleared.";
      settings.setStatus("Dictionary exclusion list cleared.", "confirmation");
    } catch (error) {
      showError(error);
    }
  });
  root.querySelector("#dictionary-exclusions-export-button").addEventListener("click", () => {
    try {
      const exclusions = settings.preferences.dictionaryExclusions;
      const contents = exclusions.length ? `${exclusions.join("\n")}\n` : "";
      fileSystem.downloadFile(
        contents,
        "tcoaal-dictionary-exclusions.txt",
        "text/plain;charset=utf-8",
      );
      root.querySelector("#dictionary-exclusions-status").textContent =
        `Exported ${exclusions.length.toLocaleString()} excluded ${exclusions.length === 1 ? "word" : "words"}.`;
      settings.setStatus("Dictionary exclusions exported.");
    } catch (error) {
      showError(error);
    }
  });

  root.querySelector("#configuration-export").addEventListener("click", () => {
    try {
      const configuration = createConfiguration(settings.preferences, theme.value, sourceColors.values);
      fileSystem.downloadFile(
        `${JSON.stringify(configuration, null, 2)}\n`,
        "tcoaal-localisation-editor-settings.json",
        "application/json",
      );
      root.querySelector("#configuration-status").textContent = "Configuration exported.";
      notifications.success("Configuration exported.");
    } catch (error) {
      showError(error);
    }
  });

  configurationClearAll.addEventListener("click", async () => {
    const confirm = appWindow.confirm;
    if (typeof confirm !== "function") {
      showError(new Error("This browser cannot confirm clearing saved settings."));
      return;
    }
    if (!confirm.call(appWindow,
      "Clear all saved settings and remembered localisation and custom dictionary files? This cannot be undone.")) {
      return;
    }

    configurationClearAll.disabled = true;
    let savedHandles;
    try {
      savedHandles = await clearSavedFileHandles(fileSystem);
      try {
        clearConfiguration(settingsStorage);
      } catch (error) {
        try {
          await restoreSavedFileHandles(fileSystem, savedHandles);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            "Saved settings could not be cleared, and remembered file handles could not be fully restored.",
          );
        }
        throw error;
      }

      dictionary.clearCustomDictionaries();
      sourceColors.replace({}, { persistChanges: false });
      theme.setTheme("dark", { persist: false });
      settings.resetToDefaults();
      dictionary.selectForLanguage(settings.preferences.targetLanguage);
      state.preferences = settings.preferences;
      renderDictionaryExclusionsPreview();
      renderSourceColorSettings();
      root.querySelector("#configuration-status").textContent = "All settings and remembered files cleared.";
      root.querySelector("#settings-status").textContent = "Settings reset to their defaults.";
      notifications.confirmation("All settings and remembered files cleared.");
      void updateConfigurationExportVisibility();
    } catch (error) {
      showError(error);
    } finally {
      configurationClearAll.disabled = false;
    }
  });

  const configurationInput = root.querySelector("#configuration-import-file");
  root.querySelector("#configuration-import-button").addEventListener("click", () => configurationInput.click());
  configurationInput.addEventListener("change", async () => {
    const [file] = configurationInput.files ?? [];
    if (!file) return;
    root.querySelector("#configuration-status").textContent = "Reading configuration...";
    try {
      const configuration = parseConfiguration(await file.text());
      const previous = createConfiguration(settings.preferences, theme.value, sourceColors.values);
      persistConfiguration(configuration, settingsStorage);
      try {
        sourceColors.replace(configuration.sourceColors, { persistChanges: false });
        theme.setTheme(configuration.theme, { persist: false });
        settings.applyImportedPreferences(configuration.preferences);
        state.preferences = settings.preferences;
        renderDictionaryExclusionsPreview();
        renderSourceColorSettings();
      } catch (error) {
        try {
          persistConfiguration(previous, settingsStorage);
          sourceColors.replace(previous.sourceColors, { persistChanges: false });
          theme.setTheme(previous.theme, { persist: false });
          settings.applyImportedPreferences(previous.preferences);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Configuration could not be applied, and the previous settings could not be fully restored.",
          );
        }
        throw error;
      }
      root.querySelector("#configuration-status").textContent = "Configuration imported.";
    } catch (error) {
      showError(error);
    } finally {
      configurationInput.value = "";
    }
  });

  root.querySelector("#source-color-randomise").addEventListener("click", () => {
    const saved = sourceColors.randomise();
    if (!saved) {
      showError(new Error(sourceColors.storageError || "Source tag palette could not be saved."));
      renderSourceColorSettings();
      return;
    }
    renderSourceColorSettings();
    root.querySelector("#source-color-status").textContent = "Source tag palette randomised and saved.";
    notifications.success("Source tag palette randomised and saved.");
  });

  function applyPreferences(preferences) {
    const previousPreferences = state.preferences;
    const sectionIdsChanged = previousPreferences.sectionIds.join("\u0000")
      !== preferences.sectionIds.join("\u0000");
    const languageChanged = previousPreferences.targetLanguage !== preferences.targetLanguage;
    const dictionaryVariantChanged = previousPreferences.dictionaryVariants[preferences.targetLanguage]
      !== preferences.dictionaryVariants[preferences.targetLanguage];
    if (state.localisation && sectionIdsChanged) {
      const currentSelection = editor?.sectionIndex ?? null;
      const selectedSectionName = typeof currentSelection === "number"
        ? state.localisation.sections[currentSelection]?.name
        : null;
      state.localisation = application.reparseDocument(state.localisation, {
        sectionIds: preferences.sectionIds,
      });
      let sectionIndex = selectedSectionName
        ? state.localisation.sections.findIndex((section) => section.name === selectedSectionName)
        : currentSelection;
      if (typeof sectionIndex === "number" && sectionIndex < 0) {
        sectionIndex = state.localisation.sections.find(
          (section) => isMapSection(section) && section.columns.includes("Translation"),
        )?.index ?? 0;
      }
      editor?.setSelection(sectionIndex);
    }

    state.preferences = preferences;
    renderDictionaryExclusionsPreview();
    dictionary.renderStatus();
    if (languageChanged || dictionaryVariantChanged) {
      dictionary.selectForLanguage(preferences.targetLanguage);
    }
    if (previousPreferences.targetLanguage !== preferences.targetLanguage
      || previousPreferences.spellcheck !== preferences.spellcheck) {
      for (const input of root.querySelectorAll(".translation-input")) {
        input.lang = preferences.targetLanguage;
        input.spellcheck = preferences.spellcheck;
      }
    }
    const validationPreferencesChanged = languageChanged
      || previousPreferences.dictionaryValidation !== preferences.dictionaryValidation
      || previousPreferences.dictionaryExclusions.join("\u0000")
        !== preferences.dictionaryExclusions.join("\u0000")
      || previousPreferences.terminologyValidation !== preferences.terminologyValidation
      || previousPreferences.minSentenceLength !== preferences.minSentenceLength
      || previousPreferences.maxSentenceLength !== preferences.maxSentenceLength;
    if (validationPreferencesChanged || sectionIdsChanged) state.validationDirty = true;

    if (state.localisation) {
      if (sectionIdsChanged) {
        state.terminologyDirty = true;
        renderLoadedDocument();
      } else {
        editor?.render(state.localisation, preferences, qa.getUnresolvedIssues(), dictionary.dictionary);
        renderDashboard();
      }
    } else {
      renderDashboard();
    }
    if (state.localisation && state.validationDirty) refreshIssues();
  }

  function renderDictionaryExclusionsPreview() {
    const preview = root.querySelector("#dictionary-exclusions-preview");
    const exclusions = state.preferences.dictionaryExclusions;
    preview.textContent = exclusions.length ? exclusions.join("\n") : "No excluded words.";
    dictionaryExclusionExport.hidden = exclusions.length === 0;
    dictionaryExclusionClear.hidden = exclusions.length === 0;
    dictionaryExclusionPair.classList.toggle("button-pair--single", exclusions.length === 0);
  }

  async function updateConfigurationExportVisibility() {
    const currentRequest = ++configurationVisibilityRequest;
    let hasConfiguration = false;
    let hasSavedHandles = false;
    let couldNotCheckSavedData = false;
    try {
      hasConfiguration = Boolean(settingsStorage && [
        SETTINGS_STORAGE_KEY,
        SOURCE_COLORS_STORAGE_KEY,
        THEME_STORAGE_KEY,
      ].some((key) => settingsStorage.getItem(key) !== null));
      configurationStorageReadError = "";
    } catch (error) {
      const message = `Could not check saved configuration: ${error.message ?? String(error)}`;
      if (configurationStorageReadError !== message) showError(new Error(message));
      configurationStorageReadError = message;
      couldNotCheckSavedData = true;
    }
    configurationExport.hidden = !hasConfiguration;
    configurationClearAll.hidden = !hasConfiguration && !couldNotCheckSavedData;
    configurationPair.classList.toggle("button-pair--single",
      !hasConfiguration && !couldNotCheckSavedData);
    if (fileSystem.supportsPersistentHandles) {
      try {
        const [localisationHandle, dictionaryHandles] = await Promise.all([
          fileSystem.getFileHandleData("localisation"),
          fileSystem.getFileHandleData("custom-dictionary"),
        ]);
        hasSavedHandles = Boolean(localisationHandle || dictionaryHandles);
        configurationHandleReadError = "";
      } catch (error) {
        const message = `Could not check remembered files: ${error.message ?? String(error)}`;
        if (configurationHandleReadError !== message) showError(new Error(message));
        configurationHandleReadError = message;
        couldNotCheckSavedData = true;
      }
    }
    if (currentRequest !== configurationVisibilityRequest) return;
    configurationExport.hidden = !hasConfiguration;
    configurationClearAll.hidden = !hasConfiguration && !hasSavedHandles && !couldNotCheckSavedData;
    configurationPair.classList.toggle("button-pair--single",
      !hasConfiguration && !hasSavedHandles && !couldNotCheckSavedData);
  }

  function renderLoadedDocument() {
    if (!state.localisation) return;
    updateLongestOriginalSentence();
    renderSourceColorSettings();
    maps?.updateDocument(state.localisation);
    editor?.render(state.localisation, state.preferences, state.validationIssues, dictionary.dictionary);
    if (terminologyInitialized && state.terminologyDirty) renderCurrentTerminology();
    state.validationDirty = true;
    renderDashboard();
    refreshIssues();
    if (state.activeTab === "compare") renderComparison();
  }

  function updateLongestOriginalSentence() {
    const note = root.querySelector("#max-sentence-length-note");
    if (!state.localisation) {
      note.textContent = "Load a localisation file to see the longest original sentence.";
      return;
    }

    let longest = 0;
    let longestEntry = null;
    const considerSentence = (sentence, section, row) => {
      const visibleLength = getVisibleTextLength(sentence);
      if (visibleLength > longest) {
        longest = visibleLength;
        longestEntry = { section, row };
      }
    };
    for (const section of state.localisation.sections) {
      if (!section.columns.includes("Translation")) continue;
      const englishIndex = section.columns.indexOf("English");
      const originalIndex = englishIndex >= 0 ? englishIndex : section.columns.indexOf("Original");
      if (originalIndex < 0) continue;

      for (const row of section.rows) {
        considerSentence(row.fields[originalIndex] ?? "", section, row);
      }
    }

    if (!longest) {
      note.textContent = "No original sentences found in this localisation file.";
      return;
    }

    const document = root.ownerDocument;
    const sectionName = longestEntry.section.name || `Section ${longestEntry.section.index + 1}`;
    const idIndex = longestEntry.section.columns.indexOf("ID");
    const entryId = idIndex >= 0
      ? longestEntry.row.fields[idIndex]?.trim()
      : longestEntry.row.key;
    const entryName = entryId || `Row ${longestEntry.row.index + 1}`;
    const link = document.createElement("button");
    link.type = "button";
    link.className = "text-button";
    link.textContent = `${sectionName} · ${entryName}`;
    link.title = `Open ${entryName} in ${sectionName} in the Editor`;
    link.addEventListener("click", () => navigate(longestEntry.section.index, longestEntry.row.index));
    note.replaceChildren(
      document.createTextNode(
        `Longest original sentence: ${longest} ${longest === 1 ? "character" : "characters"} in `,
      ),
      link,
      document.createTextNode("."),
    );
  }

  function renderComparison() {
    const currentDocument = state.localisation
      ? application.reparseDocument(state.localisation, { sectionIds: [] })
      : null;
    compare.render(currentDocument, state.fileName);
  }

  function renderDashboard() {
    if (!dashboard) return;
    dashboard.render(state.localisation, state.preferences, {
      ...getDashboardSpellcheck(),
      fileName: state.fileName,
      issueCounts: qa.getUnresolvedIssueCounts(),
    });
  }

  function ensureDashboard() {
    if (!dashboard) {
      dashboard = setupDashboard(root, {
        onSection: (sectionIndex, untranslated) => navigate(sectionIndex, undefined, untranslated),
        onMap: (sectionIndex) => navigateMapOrEditor(sectionIndex),
        onOccurrences: showOccurrences,
        onAddWordExclusion(word) {
          const preferences = settings.preferences;
          if (isWordExcluded(word, preferences.dictionaryExclusions)) return;
          if (state.validationDirty) refreshIssues();
          settings.update({
            dictionaryExclusions: [...preferences.dictionaryExclusions, word],
          }, { notify: false });
          state.preferences = settings.preferences;
          renderDictionaryExclusionsPreview();
          const excludedWord = word.trim().toLocaleLowerCase();
          state.validationIssues = state.validationIssues.filter((issue) =>
            issue.kind !== "spelling" || issue.word?.trim().toLocaleLowerCase() !== excludedWord);
          state.validationDirty = false;
          dashboard?.updateWordExclusion(word, state.preferences);
          qa.excludeSpellingWord(word);
          settings.setStatus(`Added "${word}" to the dictionary exclusion list.`);
        },
        onLengthChange: updateWordLengths,
        onProgressFilterChange: updateProgressFilters,
        getSourceColor: (source) => sourceColors.get(source),
        getSourceTranslation: findSourceTranslation,
        getSourceTerm: findSourceTerm,
        onOpenTerm: openTermInTerminology,
      });
    }
    return dashboard;
  }

  function ensureEditor() {
    if (!editor) {
      editor = setupEditor(root, {
        onSectionChange: () => refreshIssues(),
        onNavigate: (sectionIndex, rowIndex) => navigate(sectionIndex, rowIndex),
        onEdit: editCell,
        onExportSection(sectionIndex) {
          if (!state.localisation) throw new Error("Load a localisation file before exporting a section.");
          const section = state.localisation.sections[sectionIndex];
          if (!section) throw new RangeError(`Section index ${sectionIndex} does not exist.`);
          const fileName = getSectionExportFileName(
            state.fileName,
            section.name,
            sectionIndex,
            state.localisation.formatId,
          );
          return {
            ...application.prepareSectionExport(state.localisation, sectionIndex),
            fileName,
          };
        },
        onDownloadSection(exportData) {
          fileControls.download(exportData.contents, exportData.fileName);
          fileControls.setStatus(`Downloaded ${exportData.fileName}`);
          notifications.success(`Downloaded ${exportData.fileName}.`);
          return exportData.fileName;
        },
        onImportSection: importSection,
        supportsSectionOperations: (document) => application.supportsSectionOperations(document),
        getSourceColor: (source) => sourceColors.get(source),
        onSourceClick: openSourceDetails,
        onError: showError,
        onRowIssues(section, row) {
          activateTab("qa");
          qa.openIssue(section.index, row.index);
        },
      });
    }
    return editor;
  }

  function ensureTerminology() {
    if (!terminologyInitialized) {
      searchTerms.addEventListener("input", renderTerminologySearch);
      termTypeFilter.addEventListener("change", renderTerminologySearch);
      terminologyInitialized = true;
    }
    if (state.localisation && state.terminologyDirty) renderCurrentTerminology();
  }

  function ensureMaps() {
    if (!maps) {
      maps = setupMaps(root, {
        onError: showError,
        onStatus(status) {
          state.mapDataStatus = status;
          updateTabsAvailability(Boolean(state.localisation));
        },
        onOpenMap: (sectionIndex) => navigate(sectionIndex),
        onOpenEntry: (sectionIndex, rowIndex) => navigate(sectionIndex, rowIndex),
        onSourceClick: openSourceDetails,
        getSourceColor: (source) => sourceColors.get(source),
      });
    }
    maps.updateDocument(state.localisation);
    maps.load();
  }

  function navigateMapOrEditor(sectionIndex) {
    const section = state.localisation?.sections.find(({ index }) => index === sectionIndex);
    if (state.localisation?.readonly && isMapSection(section)) return;
    if (!isMapSection(section)) {
      navigate(sectionIndex);
      return;
    }
    ensureMaps();
    maps.openSection(sectionIndex);
    activateTab("maps");
  }

  function navigateToMapName(mapName) {
    if (state.localisation?.readonly) return;
    ensureMaps();
    maps.openMap(mapName);
    activateTab("maps");
  }

  function renderTerminologySearch() {
    if (!state.localisation) return;
    if (state.terminologyDirty) {
      renderCurrentTerminology();
      return;
    }
    renderTerminology(
      root,
      state.terminology,
      searchTerms.value,
      showOccurrences,
      (entry) => navigate(entry.definitionSection.index, entry.definitionRow.index),
      (sectionIndex) => navigateMapOrEditor(sectionIndex),
      { targetOnly: state.localisation.formatId === "txt" },
    );
  }

  function getDashboardSpellcheck() {
    const language = state.preferences.targetLanguage;
    return {
      dictionary: dictionary.getLoadedDictionary(language),
      dictionaryAvailable: dictionary.catalog.some((entry) => entry.language === language),
    };
  }

  function renderSourceColorSettings() {
    const hasLocalisation = Boolean(state.localisation);
    root.querySelector("#source-color-group").disabled = !hasLocalisation;
    root.querySelector("#source-color-unavailable").hidden = hasLocalisation;
    const sourceValues = state.localisation ? [...new Set(state.localisation.sections.flatMap((section) => {
      const sourceIndex = section.columns.indexOf("Source");
      return sourceIndex < 0 ? [] : section.rows.map((row) => row.fields[sourceIndex] ?? "");
    }).filter(Boolean))] : [];
    root.querySelector("#source-color-randomise").disabled = sourceValues.length === 0;
    const colorStorageError = sourceColors.ensure(sourceValues);
    updateConfigurationExportVisibility();
    if (colorStorageError) {
      if (lastSourceColorError !== colorStorageError) showError(colorStorageError);
      lastSourceColorError = colorStorageError;
      root.querySelector("#source-color-status").textContent = "";
    } else {
      lastSourceColorError = "";
      root.querySelector("#source-color-status").textContent = "";
    }
    renderSourceColorLegend(root, sourceValues, sourceColors, (source, color) => {
      let saved;
      try {
        saved = sourceColors.set(source, color);
      } catch (error) {
        showError(error);
        return;
      }
      editor?.render(state.localisation, state.preferences, state.validationIssues, dictionary.dictionary);
      renderSourceColorSettings();
      if (!sourceColors.storageError && saved) {
        root.querySelector("#source-color-status").textContent = "Source tag colour saved.";
        notifications.success("Source tag colour saved.");
      }
    }, openSourceDetails);
  }

  function findSourceTranslation(source) {
    return findSourceTerm(source)?.translation.trim() ?? "";
  }

  function findSourceTerm(source) {
    ensureTerminology();
    const target = source.trim().toLocaleLowerCase();
    return state.terminology.find((entry) =>
      (entry.english || entry.translation).trim().toLocaleLowerCase() === target);
  }

  function openTermInTerminology(entry) {
    ensureTerminology();
    if (!selectTerminologyEntry(root, entry)) {
      showError(new RangeError("The glossary definition is not available in the loaded localisation."));
      return;
    }
    activateTab("terminology");
  }

  function openSourceDetails(source) {
    if (!state.localisation) throw new Error("Load a localisation file before inspecting a Source tag.");
    const currentDashboard = ensureDashboard();
    currentDashboard.render(state.localisation, state.preferences, {
      ...getDashboardSpellcheck(),
      fileName: state.fileName,
    });
    currentDashboard.showSourceDetails(source);
  }

  function editCell(section, row, columnName, value) {
    try {
      if (state.localisation?.readonly) {
        throw new Error("This localisation format is read-only.");
      }
      const translationIndex = section.columns.indexOf("Translation");
      const previousTranslation = row.fields[translationIndex] ?? "";
      const previousStatus = state.localisation.getRowStatus(section, row);
      state.localisation.updateCell(section.index, row.index, columnName, value);
      application.markDocumentChanged();
      const nextTranslation = row.fields[translationIndex] ?? "";
      const nextStatus = state.localisation.getRowStatus(section, row);
      if (columnName === "Translation") {
        dashboard?.updateRow(
          section,
          row,
          previousTranslation,
          nextTranslation,
          previousStatus,
          nextStatus,
          state.localisation,
        );
        if (state.activeTab === "dashboard") renderDashboard();
        state.validationDirty = true;
        if (state.activeTab === "editor" || state.activeTab === "qa") refreshIssues();
        state.terminologyDirty = true;
        if (state.activeTab === "terminology") renderCurrentTerminology();
      } else {
        dashboard?.refreshMetadata();
        state.terminologyDirty = true;
        if (state.activeTab === "terminology") renderCurrentTerminology();
        if (columnName === "Source") {
          renderSourceColorSettings();
          dashboard?.updateSourceStatistics();
        }
      }
      fileControls.setUnsavedStatus();
    } catch (error) {
      fileControls.showError(error);
    }
  }

  async function importSection(file, fileName, sectionIndex) {
    const imported = await application.importSection(state.localisation, sectionIndex, file);
    state.localisation = imported.document;
    state.validationDirty = true;
    state.terminologyDirty = true;
    renderLoadedDocument();
    fileControls.setUnsavedStatus(`Imported ${fileName} into ${imported.sectionName}`);
    notifications.success(`Imported ${fileName} into ${imported.sectionName}.`);
    return imported.sectionName;
  }

  function refreshIssues() {
    if (state.validationDirty) {
      state.validationIssues = state.localisation
        ? collectValidationIssues(state.localisation, {
          ...state.preferences,
          dictionary: dictionary.dictionary,
        })
        : [];
      state.validationDirty = false;
    }
    editor?.updateIssues(state.validationIssues, dictionary.dictionary);
    qa.setIssues(state.validationIssues, state.localisation);
  }

  function updateWordLengths() {
    const minInput = root.querySelector("#word-min-length");
    const maxInput = root.querySelector("#word-max-length");
    const minOccurrencesInput = root.querySelector("#word-min-occurrences");
    const maxOccurrencesInput = root.querySelector("#word-max-occurrences");
    const minimum = Number(minInput.value);
    const maximum = maxInput.value === "" ? null : Number(maxInput.value);
    const minimumOccurrences = Number(minOccurrencesInput.value);
    const maximumOccurrences = maxOccurrencesInput.value === "" ? null : Number(maxOccurrencesInput.value);
    const validLength = minInput.value !== "" && Number.isInteger(minimum) && minimum >= 1 && minimum <= 50
      && (maximum === null || (Number.isInteger(maximum) && maximum >= 1 && maximum <= 100));
    const validOccurrences = minOccurrencesInput.value !== "" && Number.isInteger(minimumOccurrences)
      && minimumOccurrences >= 1 && minimumOccurrences <= 1000000
      && (maximumOccurrences === null || (Number.isInteger(maximumOccurrences)
        && maximumOccurrences >= 0 && maximumOccurrences <= 1000000))
      && (maximumOccurrences === null || minimumOccurrences <= maximumOccurrences);
    minInput.setCustomValidity(validLength ? "" : "Enter a minimum from 1 to 50 and an optional maximum from 1 to 100.");
    minOccurrencesInput.setCustomValidity(validOccurrences
      ? ""
      : "Enter a minimum from 1 to 1,000,000 and an optional maximum that is not below it.");
    maxOccurrencesInput.setCustomValidity(validOccurrences
      ? ""
      : "Enter a maximum from 0 to 1,000,000 that is not below the minimum.");
    const valid = validLength && validOccurrences;
    if (!valid) {
      root.querySelector("#word-filter-status").textContent = "";
      showError(new Error(!validLength
        ? minInput.validationMessage
        : minOccurrencesInput.validationMessage));
      return;
    }
    root.querySelector("#word-filter-status").textContent = maximum !== null && maximum < minimum
      ? "Maximum is below minimum; no words match."
      : "";
    try {
      settings.update({
        minimumWordLength: minimum,
        dashboardMaximumWordLength: maximum,
        minimumWordOccurrences: minimumOccurrences,
        dashboardMaximumWordOccurrences: maximumOccurrences,
      });
      state.preferences = settings.preferences;
      renderDashboard();
    } catch (error) {
      showError(error);
    }
  }

  function updateProgressFilters(patch) {
    try {
      settings.update(patch);
      state.preferences = settings.preferences;
      renderDashboard();
    } catch (error) {
      showError(error);
    }
  }

  function activateTab(tabName) {
    const button = root.querySelector(`[data-tab="${tabName}"]`);
    if (!button) return;
    if (button.disabled) return;
    if (button.getAttribute("aria-disabled") === "true") {
      notifications.warning("Load a valid localisation file first to use this tab.");
      return;
    }
    state.activeTab = tabName;
    for (const tab of root.querySelectorAll("[data-tab]")) {
      const selected = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    for (const panel of root.querySelectorAll(".tab-panel")) {
      panel.hidden = panel.id !== `panel-${tabName}`;
    }
    if (tabName === "settings") {
      settings.initialize(applyPreferences);
    } else if (tabName === "dashboard") {
      ensureDashboard();
      renderDashboard();
    } else if (tabName === "editor") {
      ensureEditor();
      refreshIssues();
      editor.render(state.localisation, state.preferences, qa.getUnresolvedIssues(), dictionary.dictionary);
    } else if (tabName === "terminology") {
      ensureTerminology();
    } else if (tabName === "compare") {
      renderComparison();
    } else if (tabName === "qa") {
      refreshIssues();
    } else if (tabName === "maps") {
      ensureMaps();
    }
  }

  function updateTabsAvailability(hasDocument) {
    const readOnly = hasDocument && Boolean(state.localisation?.readonly);
    if (readOnly && !wasReadOnly) {
      for (const dialog of root.querySelectorAll("dialog[open]")) dialog.close();
    }
    wasReadOnly = readOnly;
    for (const button of root.querySelectorAll("[data-tab]")) {
      const tabName = button.dataset.tab;
      const readOnlyRestricted = readOnly && READ_ONLY_UNAVAILABLE_TABS.has(tabName);
      let status = "available";
      if (readOnlyRestricted) {
        status = "unavailable";
      } else if (tabName === "dashboard" && readOnly) {
        status = "partial";
      } else if (tabName === "maps") {
        status = state.mapDataStatus === "unavailable"
          ? "unavailable"
          : hasDocument ? "available" : "partial";
      } else if (["dashboard", "editor", "compare", "qa", "terminology"].includes(tabName) && !hasDocument) {
        status = "unavailable";
      }
      const readonlyEditor = tabName === "editor" && hasDocument && state.localisation?.readonly;
      if (readonlyEditor) status = "partial";
      const available = status !== "unavailable";
      const readonlyDashboard = tabName === "dashboard" && readOnly;
      const statusText = readOnlyRestricted
        ? "[Unavailable for read-only files]"
        : readonlyEditor
          ? "[Read-only]"
          : readonlyDashboard || status === "partial"
            ? "[Partially available]"
            : available ? "[Available]" : "[Unavailable]";
      button.setAttribute("aria-disabled", String(!available));
      button.disabled = readOnlyRestricted || (tabName === "qa" && !available);
      button.classList.toggle("is-unavailable", !available);
      const tabStatus = tabName === "about"
        ? root.querySelector("#offline-installation-status")?.title
        : "";
      const readonlyMessage = readonlyEditor ? " This format is read-only." : "";
      const dashboardMessage = readonlyDashboard
        ? " Only file metadata and word usage remain available in the Dashboard."
        : "";
      const unavailableMessage = readOnlyRestricted
        ? " This module is unavailable for read-only formats."
        : "";
      button.title = `${TAB_DESCRIPTIONS[tabName]} ${statusText}${readonlyMessage}`
        + `${dashboardMessage}${unavailableMessage}${tabStatus ? ` ${tabStatus}` : ""}`;
      const indicator = button.querySelector(".tab-status-dot");
      if (indicator) {
        indicator.dataset.loaded = String(available);
        indicator.dataset.status = status;
      }
    }
    if (readOnly && READ_ONLY_UNAVAILABLE_TABS.has(state.activeTab)) {
      activateTab("dashboard");
    }
  }

  function renderCurrentTerminology() {
    if (!state.localisation) return;
    state.terminology = collectTerminology(state.localisation);
    renderTerminology(root, state.terminology, searchTerms.value, showOccurrences,
      (entry) => navigate(entry.definitionSection.index, entry.definitionRow.index),
      (sectionIndex) => navigateMapOrEditor(sectionIndex),
      { targetOnly: state.localisation.formatId === "txt" });
    state.terminologyDirty = false;
  }

  activateTab("about");
  void fileControls.restoreLastFile();
  return {
    get document() {
      return state.localisation;
    },
    get activeTab() {
      return state.activeTab;
    },
  };
}

function setupSelectWheelNavigation(root) {
  root.addEventListener("wheel", (event) => {
    const target = event.target instanceof Element ? event.target.closest("select") : null;
    const activeElement = root.activeElement ?? root.ownerDocument?.activeElement ?? document.activeElement;
    const focused = activeElement instanceof HTMLSelectElement ? activeElement : null;
    const select = target ?? focused;
    if (!select || select.disabled || select.multiple || event.deltaY === 0) return;
    const step = event.deltaY > 0 ? 1 : -1;
    let index = select.selectedIndex + step;
    while (index >= 0 && index < select.options.length && select.options[index].disabled) index += step;
    if (index < 0 || index >= select.options.length) return;
    event.preventDefault();
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { capture: true, passive: false });
}

function setupThemeToggle(root, appWindow, onError, storage) {
  const button = root.querySelector("#theme-toggle");
  let theme = "dark";
  try {
    storage ??= createBrowserStorage(appWindow);
    if (!storage) throw new Error("Browser storage is unavailable.");
    const savedTheme = storage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
  } catch (error) {
    onError(new Error(`Theme preference could not be loaded: ${error.message}`));
  }

  const applyTheme = () => {
    root.ownerDocument.documentElement.dataset.theme = theme;
    button.querySelector('[data-theme-icon="sun"]').hidden = theme !== "dark";
    button.querySelector('[data-theme-icon="moon"]').hidden = theme !== "light";
    button.setAttribute("aria-label", "Toggle light/dark mode");
    button.title = "Toggle light/dark mode";
    button.setAttribute("aria-pressed", String(theme === "dark"));
  };
  applyTheme();
  button.addEventListener("click", () => {
    setTheme(theme === "dark" ? "light" : "dark");
  });

  function setTheme(value, { persist = true } = {}) {
    if (value !== "light" && value !== "dark") throw new Error("Choose a supported colour theme.");
    theme = value;
    applyTheme();
    if (!persist) return true;
    try {
      if (!storage) throw new Error("Browser storage is unavailable.");
      storage.setItem(THEME_STORAGE_KEY, theme);
      return true;
    } catch (error) {
      onError(new Error(`Theme changed, but its preference could not be saved: ${error.message}`));
      return false;
    }
  }

  return {
    get value() {
      return theme;
    },
    setTheme,
  };
}

async function clearSavedFileHandles(fileSystem) {
  if (!fileSystem.supportsPersistentHandles) return null;
  const keys = ["localisation", "custom-dictionary"];
  const handles = new Map(await Promise.all(keys.map(async (key) =>
    [key, await fileSystem.getFileHandleData(key)])));
  try {
    await Promise.all(keys.map((key) => fileSystem.removeFileHandleData(key)));
  } catch (error) {
    try {
      await restoreSavedFileHandles(fileSystem, handles);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Remembered files could not be cleared and the previous handles could not be fully restored.",
      );
    }
    throw new Error(`Remembered files could not be cleared: ${error.message ?? String(error)}`);
  }
  return handles;
}

async function restoreSavedFileHandles(fileSystem, handles) {
  if (!handles) return;
  const operations = [...handles].map(([key, handle]) => handle === undefined
    ? fileSystem.removeFileHandleData(key)
    : fileSystem.saveFileHandleData(key, handle));
  const results = await Promise.allSettled(operations);
  const errors = results.filter(({ status }) => status === "rejected").map(({ reason }) => reason);
  if (errors.length) {
    throw new AggregateError(errors, "Remembered file handles could not be fully restored.");
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  initApp(document.querySelector("#app"));
}
