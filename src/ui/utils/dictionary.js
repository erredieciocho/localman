import {
  loadBundledDictionary,
  loadBundledDictionaryCatalog,
  loadDictionary,
  loadPackagedDictionary,
} from "../../platform/browser/dictionary.js";

const CUSTOM_DICTIONARY_ACTION = "__import_custom_dictionary__";

export function setupDictionary(root, getPreferences, onChange, onError) {
  const dictionaries = new Map();
  const customLanguages = new Map();
  const status = root.querySelector("#dictionary-status-dot");
  const select = root.querySelector("#dictionary-select");
  const customInput = root.querySelector("#dictionary-custom-import");
  let catalog = [];
  let request = 0;
  let selectedValue = "";
  select.addEventListener("change", () => {
    if (select.value === CUSTOM_DICTIONARY_ACTION) {
      select.value = selectedValue;
      customInput.click();
      return;
    }
    if ([...customLanguages.values()].some(({ id }) => id === select.value)) {
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
    if (customLanguages.has(entry.language)) {
      customLanguages.get(entry.language).option.remove();
      customLanguages.delete(entry.language);
      dictionaries.delete(entry.language);
    }
    selectedValue = entry.id;
    loadForSelectedLanguage(entry);
  });
  customInput.addEventListener("change", importCustomDictionary);
  loadCatalog();

  async function loadCatalog() {
    select.disabled = true;
    setStatus(false, "Loading bundled dictionaries.");
    try {
      catalog = await loadBundledDictionaryCatalog();
      select.replaceChildren(new Option("Select a dictionary…", ""));
      select.add(new Option("Import custom dictionary…", CUSTOM_DICTIONARY_ACTION));
      for (const entry of catalog) {
        select.add(new Option(`${entry.name} (${entry.language})`, entry.id));
      }
      select.disabled = false;
      selectForLanguage(getPreferences().targetLanguage);
    } catch (error) {
      select.replaceChildren(new Option("Dictionary list unavailable", ""));
      setStatus(false, "Dictionary list unavailable.");
      onError(new Error(`Could not load bundled dictionaries: ${error.message ?? String(error)}`));
    }
  }

  async function loadForSelectedLanguage(entry) {
    const language = entry.language;
    if (dictionaries.has(language)) {
      renderStatus();
      return;
    }
    const currentRequest = ++request;
    setStatus(false, `Loading ${entry.name} dictionary.`);
    try {
      const dictionary = await loadBundledDictionary(entry);
      if (currentRequest !== request) return;
      dictionaries.set(language, dictionary);
      renderStatus();
      onChange();
    } catch (error) {
      if (currentRequest !== request) return;
      setStatus(false, `Could not load the ${language} dictionary.`);
      onError(new Error(`Could not load dictionary: ${error.message ?? String(error)}.`
        + (dictionaries.has(language) ? ` The previously loaded ${language} dictionary remains available.` : "")));
    }
  }

  async function importCustomDictionary() {
    const files = [...(customInput.files ?? [])];
    if (!files.length) return;
    try {
      if (files.length === 1 && /\.(?:oxt|xpi|zip)$/iu.test(files[0].name)) {
        await loadCustomDictionary(
          () => loadPackagedDictionary(files[0], getPreferences().targetLanguage),
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

  async function loadCustomDictionary(load) {
    const language = getPreferences().targetLanguage;
    const currentRequest = ++request;
    setStatus(false, `Loading custom ${language} dictionary.`);
    try {
      const dictionary = await load();
      if (currentRequest !== request || language !== getPreferences().targetLanguage) return;
      dictionaries.set(language, dictionary);
      const id = `custom-${language}`;
      const option = select.querySelector(`option[value="${id}"]`)
        ?? new Option(`Custom dictionary (${language}, this session)`, id);
      if (!option.parentElement) select.add(option);
      customLanguages.set(language, { id, option });
      selectedValue = id;
      select.value = id;
      setStatus(true, `Custom dictionary loaded for ${language} this session.`
        + (getPreferences().dictionaryValidation ? "" : " Spelling validation is disabled."));
      onChange();
    } catch (error) {
      if (currentRequest !== request) return;
      setStatus(false, `Could not load custom dictionary for ${language}.`);
      onError(new Error(`Could not load custom dictionary: ${error.message ?? String(error)}`));
    }
  }

  function renderStatus() {
    const preferences = getPreferences();
    const loaded = dictionaries.has(preferences.targetLanguage);
    for (const option of select.options) {
      const entry = catalog.find(({ id }) => id === option.value);
      const custom = [...customLanguages.entries()].find(([, value]) => value.id === option.value);
      if (entry) option.disabled = entry.language !== preferences.targetLanguage;
      else if (custom) option.disabled = custom[0] !== preferences.targetLanguage;
    }
    if (loaded) {
      setStatus(true, `${customLanguages.has(preferences.targetLanguage) ? "Custom dictionary" : "Dictionary"}`
        + ` loaded for ${preferences.targetLanguage} this session.`
        + (preferences.dictionaryValidation ? "" : " Spelling validation is disabled."));
    } else {
      const available = catalog.some(({ language }) => language === preferences.targetLanguage);
      setStatus(false, available
        ? `No dictionary loaded for ${preferences.targetLanguage}. Select its bundled dictionary to enable spelling issues.`
        : `No bundled dictionary is available for ${preferences.targetLanguage}.`);
    }
  }

  function setStatus(loaded, message) {
    status.dataset.loaded = String(loaded);
    status.title = message;
    status.setAttribute("aria-label", message);
  }

  function selectForLanguage(language) {
    const custom = customLanguages.get(language);
    if (custom) {
      select.value = custom.id;
      selectedValue = custom.id;
      renderStatus();
      return;
    }
    const entry = catalog.find((item) => item.language === language);
    if (!entry) {
      select.value = "";
      selectedValue = "";
      renderStatus();
      return;
    }
    select.value = entry.id;
    selectedValue = entry.id;
    loadForSelectedLanguage(entry);
  }

  return {
    get dictionary() {
      const preferences = getPreferences();
      return preferences.dictionaryValidation ? dictionaries.get(preferences.targetLanguage) ?? null : null;
    },
    renderStatus,
    selectForLanguage,
    getLoadedDictionary(language = getPreferences().targetLanguage) {
      return dictionaries.get(language) ?? null;
    },
    get catalog() {
      return [...catalog];
    },
  };
}
