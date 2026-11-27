import {
  loadBundledDictionary,
  loadBundledDictionaryCatalog,
  loadDictionary,
  loadPackagedDictionary,
} from "../../platform/browser/dictionary.js";

const CUSTOM_DICTIONARY_ACTION = "__import_custom_dictionary__";

export function setupDictionary(root, getPreferences, onChange, onError, fileSystem = {}, onVariantChange = () => {}) {
  const dictionaries = new Map();
  const wordCounts = new Map();
  const customLanguages = new Map();
  const status = root.querySelector("#dictionary-status-dot");
  const select = root.querySelector("#dictionary-select");
  const customInput = root.querySelector("#dictionary-custom-import");
  const wordCount = root.querySelector("#dictionary-word-count");
  const wordListDetails = root.querySelector("#dictionary-word-list-details");
  const wordList = root.querySelector("#dictionary-word-list");
  let catalog = [];
  let defaultVariants = {};
  let request = 0;
  let customRestoreRequest = 0;
  let selectedValue = "";
  select.addEventListener("change", async () => {
    if (select.value === CUSTOM_DICTIONARY_ACTION) {
      customRestoreRequest += 1;
      select.value = selectedValue;
      if (fileSystem.supportsOpenPicker && fileSystem.openDictionaryFiles) {
        void chooseCustomDictionaryFiles();
      } else {
        customInput.click();
      }
      return;
    }
    if ([...customLanguages.values()].some(({ id }) => id === select.value)) {
      customRestoreRequest += 1;
      selectedValue = select.value;
      renderStatus();
      return;
    }
    const entry = catalog.find(({ id }) => id === select.value);
    if (!entry) {
      request += 1;
      select.value = selectedValue;
      return;
    }
    if (entry.language !== getPreferences().targetLanguage) {
      select.value = selectedValue;
      setStatus(false, `Choose a ${getPreferences().targetLanguage} dictionary for the selected target language.`);
      return;
    }
    customRestoreRequest += 1;
    const currentRequest = ++request;
    select.disabled = true;
    try {
      if (fileSystem.supportsPersistentHandles) {
        if (typeof fileSystem.removeFileHandleData !== "function") {
          throw new Error("Persistent custom dictionary storage cannot be cleared.");
        }
        await fileSystem.removeFileHandleData("custom-dictionary");
      }
    } catch (error) {
      select.value = selectedValue;
      onError(new Error(`Bundled dictionary selected, but the saved custom dictionary could not be cleared: ${error.message ?? String(error)}`));
      return;
    } finally {
      select.disabled = false;
    }
    if (currentRequest !== request) return;
    if (customLanguages.has(entry.language)) {
      const custom = customLanguages.get(entry.language);
      custom.option.remove();
      customLanguages.delete(entry.language);
      dictionaries.delete(custom.id);
      wordCounts.delete(custom.id);
    }
    selectedValue = entry.id;
    onVariantChange(entry.language, entry.id);
    onChange();
    loadForSelectedLanguage(entry);
  });
  customInput.addEventListener("change", importCustomDictionary);
  wordListDetails?.addEventListener("toggle", renderWordList);
  loadCatalog();

  async function loadCatalog() {
    select.disabled = true;
    setStatus(false, "Loading bundled dictionaries.", "partial");
    try {
      const loaded = await loadBundledDictionaryCatalog();
      catalog = loaded.dictionaries;
      defaultVariants = loaded.defaultVariants;
      select.replaceChildren(new Option("Import custom dictionary...", CUSTOM_DICTIONARY_ACTION));
      for (const entry of catalog) {
        select.add(new Option(`${entry.name} (${entry.id})`, entry.id));
      }
      select.disabled = false;
      selectForLanguage(getPreferences().targetLanguage);
    } catch (error) {
      select.replaceChildren(new Option("Dictionary list unavailable", ""));
      setStatus(false, "Dictionary list unavailable.");
      onError(new Error(`Could not load bundled dictionaries: ${error.message ?? String(error)}`));
    } finally {
      void restoreCustomDictionary();
    }
  }

  async function loadForSelectedLanguage(entry) {
    if (dictionaries.has(entry.id)) {
      renderStatus();
      return;
    }
    const currentRequest = ++request;
    setStatus(false, `Loading ${entry.name} dictionary.`, "partial");
    try {
      const dictionary = await loadBundledDictionary(entry);
      if (currentRequest !== request) return;
      dictionaries.set(entry.id, dictionary);
      wordCounts.set(entry.id, entry.wordCount);
      renderStatus();
      onChange();
    } catch (error) {
      if (currentRequest !== request) return;
      setStatus(false, `Could not load the ${entry.name} dictionary.`);
      onError(new Error(`Could not load dictionary: ${error.message ?? String(error)}.`
        + (dictionaries.has(entry.id) ? ` The previously loaded ${entry.name} dictionary remains available.` : "")));
    }
  }

  async function importCustomDictionary() {
    const files = [...(customInput.files ?? [])];
    if (!files.length) return;
    try {
      if (files.length === 1 && /\.(?:oxt|xpi|zip)$/iu.test(files[0].name)) {
        await loadCustomDictionary(
          () => loadPackagedDictionary(files[0], getPreferences().targetLanguage),
          [],
        );
      } else if (files.length === 2) {
        const aff = files.find((file) => /\.aff$/iu.test(file.name));
        const dic = files.find((file) => /\.dic$/iu.test(file.name));
        if (!aff || !dic) {
          throw new Error("Select one .aff file and its matching .dic file.");
        }
        if (aff.name.replace(/\.aff$/iu, "").toLocaleLowerCase()
          !== dic.name.replace(/\.dic$/iu, "").toLocaleLowerCase()) {
          throw new Error("The .aff and .dic files must have matching names.");
        }
        await loadCustomDictionary(
          () => loadDictionary(aff, dic, getPreferences().targetLanguage),
          [],
        );
      } else {
        throw new Error("Select one OXT, XPI or ZIP package, or a matching .aff and .dic pair.");
      }
    } catch (error) {
      onError(error);
    } finally {
      customInput.value = "";
    }
  }

  async function chooseCustomDictionaryFiles() {
    try {
      const selected = await fileSystem.openDictionaryFiles();
      if (!selected) return;
      const files = selected.map(({ file }) => file);
      const handles = selected.map(({ handle }) => handle);
      if (files.length === 1 && /\.(?:oxt|xpi|zip)$/iu.test(files[0].name)) {
        await loadCustomDictionary(
          () => loadPackagedDictionary(files[0], getPreferences().targetLanguage),
          handles,
        );
      } else if (files.length === 2) {
        const aff = files.find((file) => /\.aff$/iu.test(file.name));
        const dic = files.find((file) => /\.dic$/iu.test(file.name));
        if (!aff || !dic || aff.name.replace(/\.aff$/iu, "").toLocaleLowerCase()
          !== dic.name.replace(/\.dic$/iu, "").toLocaleLowerCase()) {
          throw new Error("Select a matching .aff and .dic file pair.");
        }
        await loadCustomDictionary(
          () => loadDictionary(aff, dic, getPreferences().targetLanguage),
          handles,
        );
      } else {
        throw new Error("Select one OXT, XPI or ZIP package, or a matching .aff and .dic pair.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") onError(error);
    }
  }

  async function loadCustomDictionary(load, handles) {
    const language = getPreferences().targetLanguage;
    const id = `custom-${language}`;
    const currentRequest = ++request;
    setStatus(false, `Loading custom ${language} dictionary.`, "partial");
    try {
      const dictionary = await load();
      if (currentRequest !== request || language !== getPreferences().targetLanguage) return;
      dictionaries.set(id, dictionary);
      wordCounts.set(id, dictionary.wordList.length);
      if (fileSystem.supportsPersistentHandles
        && typeof fileSystem.saveFileHandleData === "function") {
        try {
          if (handles.length) {
            await fileSystem.saveFileHandleData("custom-dictionary", { language, handles });
          } else {
            await fileSystem.removeFileHandleData?.("custom-dictionary");
          }
        } catch (error) {
          onError(new Error(`Custom dictionary loaded, but its file handle could not be remembered: ${error.message ?? String(error)}`));
        }
      }
      const option = select.querySelector(`option[value="${id}"]`)
        ?? new Option(`Custom dictionary (${language}, this session)`, id);
      if (!option.parentElement) select.add(option);
      customLanguages.set(language, { id, option });
      selectedValue = id;
      select.value = id;
      renderWordCount(id);
      setStatus(true, `Custom dictionary loaded for ${language} this session.`
        + (getPreferences().dictionaryValidation ? "" : " Spelling validation is disabled."));
      onChange();
    } catch (error) {
      if (currentRequest !== request) return;
      setStatus(false, `Could not load custom dictionary for ${language}.`);
      onError(new Error(`Could not load custom dictionary: ${error.message ?? String(error)}`));
    }
  }

  async function restoreCustomDictionary() {
    if (!fileSystem.supportsPersistentHandles
      || typeof fileSystem.getFileHandleData !== "function") return;
    const currentRestoreRequest = ++customRestoreRequest;
    try {
      const saved = await fileSystem.getFileHandleData("custom-dictionary");
      if (currentRestoreRequest !== customRestoreRequest) return;
      if (!saved || saved.language !== getPreferences().targetLanguage
        || !Array.isArray(saved.handles) || !saved.handles.length) return;
      const files = await Promise.all(saved.handles.map((handle) => fileSystem.readFileHandle(handle)));
      if (currentRestoreRequest !== customRestoreRequest) return;
      const byName = new Map(files.map((file) => [file.name.toLocaleLowerCase(), file]));
      let load;
      if (files.length === 1 && /\.(?:oxt|xpi|zip)$/iu.test(files[0].name)) {
        load = () => loadPackagedDictionary(files[0], saved.language);
      } else {
        const aff = files.find((file) => /\.aff$/iu.test(file.name));
        const dic = files.find((file) => /\.dic$/iu.test(file.name));
        if (!aff || !dic || !byName.has(aff.name.replace(/\.aff$/iu, ".dic").toLocaleLowerCase())) {
          throw new Error("The saved custom dictionary files are missing or do not match.");
        }
        load = () => loadDictionary(aff, dic, saved.language);
      }
      await loadCustomDictionary(load, saved.handles);
    } catch (error) {
      onError(new Error(`Could not reload the saved custom dictionary: ${error.message ?? String(error)}`));
    }
  }

  function renderStatus() {
    const preferences = getPreferences();
    const language = preferences.targetLanguage;
    const entry = getBundledEntry(language);
    const custom = customLanguages.get(language);
    const dictionaryId = custom?.id ?? entry?.id;
    const loaded = dictionaryId ? dictionaries.has(dictionaryId) : false;
    renderWordCount(dictionaryId);
    for (const option of select.options) {
      const entry = catalog.find(({ id }) => id === option.value);
      const custom = [...customLanguages.entries()].find(([, value]) => value.id === option.value);
      if (entry) option.disabled = entry.language !== preferences.targetLanguage;
      else if (custom) option.disabled = custom[0] !== preferences.targetLanguage;
    }
    if (loaded) {
      const message = custom
        ? `Custom dictionary loaded for ${language} this session.`
        : `Dictionary loaded for ${entry.id} this session.`;
      setStatus(true, message
        + (preferences.dictionaryValidation ? "" : " Spelling validation is disabled."));
    } else {
      const available = catalog.some((item) => item.language === language);
      setStatus(false, available
        ? `No dictionary loaded for ${language}. Select its bundled dictionary to enable spelling issues.`
        : `No bundled dictionary is available for ${language}.`);
    }
  }

  function setStatus(loaded, message, state = loaded ? "available" : "unavailable") {
    status.dataset.loaded = String(loaded);
    status.dataset.status = state;
    status.title = message;
    status.setAttribute("aria-label", message);
    status.closest("#settings-tab-dictionary").title = message;
  }

  function renderWordCount(language) {
    const count = wordCounts.get(language);
    if (wordCount) wordCount.textContent = count === undefined ? "—" : count.toLocaleString();
    renderWordList();
  }

  function renderWordList() {
    if (!wordList) return;
    const preferences = getPreferences();
    const custom = customLanguages.get(preferences.targetLanguage);
    const entry = getBundledEntry(preferences.targetLanguage);
    const dictionary = dictionaries.get(custom?.id ?? entry?.id);
    if (!dictionary) {
      wordList.textContent = "No dictionary is loaded for the selected target language.";
    } else if (wordListDetails?.open) {
      wordList.textContent = dictionary.wordList.join("\n");
    } else {
      wordList.textContent = "Open this list to display the loaded dictionary words.";
    }
  }

  function selectForLanguage(language) {
    const custom = customLanguages.get(language);
    if (custom) {
      select.value = custom.id;
      selectedValue = custom.id;
      renderStatus();
      return;
    }
    const preferences = getPreferences();
    const requestedVariant = preferences.dictionaryVariants?.[language];
    const entry = getBundledEntry(language);
    if (!entry) {
      select.value = "";
      selectedValue = "";
      renderStatus();
      return;
    }
    if (requestedVariant && requestedVariant !== entry.id) {
      onVariantChange(language, entry.id);
    }
    select.value = entry.id;
    selectedValue = entry.id;
    loadForSelectedLanguage(entry);
  }

  function getBundledEntry(language) {
    const selectedVariant = getPreferences().dictionaryVariants?.[language];
    return catalog.find((item) => item.language === language && item.id === selectedVariant)
      ?? catalog.find((item) => item.id === defaultVariants[language]);
  }

  function getLoadedDictionary(language) {
    const custom = customLanguages.get(language);
    const entry = getBundledEntry(language);
    return dictionaries.get(custom?.id ?? entry?.id) ?? null;
  }

  return {
    get dictionary() {
      const preferences = getPreferences();
      return preferences.dictionaryValidation ? getLoadedDictionary(preferences.targetLanguage) : null;
    },
    renderStatus,
    selectForLanguage,
    clearCustomDictionaries() {
      request += 1;
      for (const custom of customLanguages.values()) {
        custom.option.remove();
        dictionaries.delete(custom.id);
        wordCounts.delete(custom.id);
      }
      customLanguages.clear();
      selectedValue = "";
      select.value = "";
    },
    getLoadedDictionary,
    getWordCount(language = getPreferences().targetLanguage) {
      const custom = customLanguages.get(language);
      const entry = getBundledEntry(language);
      return wordCounts.get(custom?.id ?? entry?.id) ?? null;
    },
    getDictionaryWords(language = getPreferences().targetLanguage) {
      return [...(getLoadedDictionary(language)?.wordList ?? [])];
    },
    get catalog() {
      return [...catalog];
    },
  };
}
