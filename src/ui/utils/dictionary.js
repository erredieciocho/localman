import {
  loadBundledDictionary,
  loadBundledDictionaryCatalog,
} from "../../platform/browser/dictionary.js";

export function setupDictionary(root, getPreferences, onChange, onError) {
  const dictionaries = new Map();
  const status = root.querySelector("#dictionary-status-dot");
  const select = root.querySelector("#dictionary-select");
  let catalog = [];
  let request = 0;
  select.addEventListener("change", () => {
    const entry = catalog.find(({ id }) => id === select.value);
    if (!entry) {
      request += 1;
      selectForLanguage(getPreferences().targetLanguage);
      return;
    }
    if (entry.language !== getPreferences().targetLanguage) {
      setStatus(false, `Choose a ${getPreferences().targetLanguage} dictionary for the selected target language.`);
      return;
    }
    loadForSelectedLanguage(entry);
  });
  loadCatalog();

  async function loadCatalog() {
    select.disabled = true;
    setStatus(false, "Loading bundled dictionaries.");
    try {
      catalog = await loadBundledDictionaryCatalog();
      select.replaceChildren(new Option("Select a dictionary…", ""));
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

  function renderStatus() {
    const preferences = getPreferences();
    const loaded = dictionaries.has(preferences.targetLanguage);
    for (const option of select.options) {
      const entry = catalog.find(({ id }) => id === option.value);
      if (entry) option.disabled = entry.language !== preferences.targetLanguage;
    }
    if (loaded) {
      setStatus(true, `Dictionary loaded for ${preferences.targetLanguage} this session.`
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
    const entry = catalog.find((item) => item.language === language);
    if (!entry) {
      renderStatus();
      return;
    }
    select.value = entry.id;
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
