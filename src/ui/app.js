import { createParserRegistry } from "../core/parser/index.js";
import { getGroupedRows } from "../core/glossary/index.js";
import { collectValidationIssues, isWordExcluded } from "../core/validation/index.js";
import { createLocalisationService } from "../application/index.js";
import { csvFormat } from "../plugins/formats/csv/index.js";
import { createBrowserFileSystem } from "../platform/browser/file-system.js";
import { createBrowserStorage } from "../platform/browser/storage.js";
import { setupDashboard } from "./containers/dashboard.js";
import { setupEditor } from "./containers/editor.js";
import { setupCompare } from "./containers/compare.js";
import { setupMaps } from "./containers/maps.js";
import { setupQA } from "./containers/qa.js";
import { setupAbout } from "./containers/about.js";
import {
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
} from "./utils/source-colors.js";
import {
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
  let editor = null;
  let dashboard = null;
  let terminologyInitialized = false;
  let maps = null;
  const appWindow = root.ownerDocument?.defaultView ?? root.defaultView ?? globalThis.window;
  const fileSystem = createBrowserFileSystem(appWindow, { download, openFilePicker, saveFilePicker });
  const application = createLocalisationService({
    parsers: createParserRegistry([csvFormat]),
    fileSystem,
  });
  const compare = setupCompare(root, {
    onLoadTarget: (file) => application.parseFile(file),
    onError: showError,
    onOpenSection: (sectionName, sectionIndex) => {
      if (typeof sectionIndex === "number") navigateMapOrEditor(sectionIndex);
      else if (isMapReferenceName(sectionName)) navigateToMapName(sectionName);
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
  const settings = createSettingsController(root, {
    onError: showError,
    notify: (type, message) => notifications.show(type, message),
    storage: settingsStorage,
  });
  state.preferences = settings.preferences;
  renderDictionaryExclusionsPreview();
  const theme = setupThemeToggle(root, appWindow, showError, settingsStorage);
  const dictionary = setupDictionary(root, () => state.preferences, () => {
    state.validationDirty = true;
    refreshIssues();
    renderDashboard();
  }, showError, fileSystem);
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
      editor?.setSelection(null);
      state.validationDirty = true;
      state.terminologyDirty = true;
      searchTerms.disabled = false;
      termTypeFilter.disabled = false;
      renderLoadedDocument();
      updateTabsAvailability(true);
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
          (section) => section.name && section.columns.includes("Translation"),
        )?.index ?? 0;
      }
      editor?.setSelection(sectionIndex);
    }

    state.preferences = preferences;
    renderDictionaryExclusionsPreview();
    dictionary.renderStatus();
    if (languageChanged) dictionary.selectForLanguage(preferences.targetLanguage);
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
      if (sentence.length > longest) {
        longest = sentence.length;
        longestEntry = { section, row };
      }
    };
    for (const section of state.localisation.sections) {
      if (!section.columns.includes("Translation")) continue;
      const englishIndex = section.columns.indexOf("English");
      const originalIndex = englishIndex >= 0 ? englishIndex : section.columns.indexOf("Original");
      if (originalIndex < 0) continue;

      if (englishIndex >= 0) {
        for (const group of getGroupedRows(section)) {
          considerSentence(group.english, section, group.first);
        }
      } else {
        for (const row of section.rows) {
          considerSentence(row.fields[originalIndex] ?? "", section, row);
        }
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
      ? application.parse(application.serialize(state.localisation))
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
          const fileName = getSectionExportFileName(state.fileName, section.name, sectionIndex);
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
    if (!isMapReferenceName(section?.name)) {
      navigate(sectionIndex);
      return;
    }
    ensureMaps();
    maps.openSection(sectionIndex);
    activateTab("maps");
  }

  function navigateToMapName(mapName) {
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
    return state.terminology.find((entry) =>
      entry.english.trim().toLocaleLowerCase() === source.trim().toLocaleLowerCase());
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
    for (const button of root.querySelectorAll("[data-tab]")) {
      const tabName = button.dataset.tab;
      let status = "available";
      if (tabName === "maps") {
        status = state.mapDataStatus === "unavailable"
          ? "unavailable"
          : hasDocument ? "available" : "partial";
      } else if (["dashboard", "editor", "compare", "qa", "terminology"].includes(tabName) && !hasDocument) {
        status = "unavailable";
      }
      const available = status !== "unavailable";
      const statusText = status === "partial" ? "[Partially available]" : available ? "[Available]" : "[Unavailable]";
      button.setAttribute("aria-disabled", String(!available));
      button.disabled = tabName === "qa" && !available;
      button.classList.toggle("is-unavailable", !available);
      button.title = `${TAB_DESCRIPTIONS[tabName]} ${statusText}`;
      const indicator = button.querySelector(".tab-status-dot");
      if (indicator) {
        indicator.dataset.loaded = String(available);
        indicator.dataset.status = status;
      }
    }
  }

  function renderCurrentTerminology() {
    if (!state.localisation) return;
    state.terminology = collectTerminology(state.localisation);
    renderTerminology(root, state.terminology, searchTerms.value, showOccurrences,
      (entry) => navigate(entry.definitionSection.index, entry.definitionRow.index),
      (sectionIndex) => navigateMapOrEditor(sectionIndex));
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

function isMapReferenceName(name) {
  return typeof name === "string"
    && (/\.json$/iu.test(name) || /^(?:CommonEvents|Map\d+)$/iu.test(name));
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  initApp(document.querySelector("#app"));
}
