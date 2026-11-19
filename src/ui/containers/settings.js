import { createBrowserStorage } from "../../platform/browser/storage.js";

export const SETTINGS_STORAGE_KEY = "tcoaal-localisation-editor-settings";
const DENSITIES = new Set(["comfortable", "compact"]);

export const DEFAULT_PREFERENCES = Object.freeze({
  density: "compact",
  editorDensity: "comfortable",
  minimumWordLength: 3,
  dashboardMaximumWordLength: null,
  minimumWordOccurrences: 1,
  dashboardMaximumWordOccurrences: null,
  dashboardIncompleteOnly: true,
  dashboardProgressThreshold: 95,
  targetLanguage: "es",
  sectionIds: [],
  dictionaryExclusions: [],
  spellcheck: true,
  dictionaryValidation: true,
  terminologyValidation: false,
  minSentenceLength: 0,
  maxSentenceLength: 70,
});

export function createSettingsController(root, {
  spellcheckSupported = "spellcheck" in document.createElement("textarea"),
  storage,
  onError,
} = {}) {
  let preferences;
  let loadError = "";
  let statusMessage = "";
  let initialized = false;
  let status;
  let controls;
  let applyPreferences = () => {};
  try {
    storage ??= createBrowserStorage();
    preferences = loadPreferences(storage);
  } catch (error) {
    preferences = { ...DEFAULT_PREFERENCES, sectionIds: [] };
    loadError = `Could not read saved preferences: ${error.message}`;
  }
  if (!spellcheckSupported) preferences.spellcheck = false;
  applyDensity(root, preferences.density, preferences.editorDensity);

  function initialize(onApply = () => {}) {
    if (initialized) return;
    initialized = true;
    applyPreferences = onApply;
    status = root.querySelector("#settings-status");
    controls = {
      density: root.querySelector("#density-select"),
      targetLanguage: root.querySelector("#target-language"),
      sectionIds: root.querySelector("#section-ids"),
      spellcheck: root.querySelector("#spellcheck-enabled"),
      dictionaryValidation: root.querySelector("#dictionary-validation"),
      terminologyValidation: root.querySelector("#terminology-validation"),
      minSentenceLength: root.querySelector("#min-sentence-length"),
      maxSentenceLength: root.querySelector("#max-sentence-length"),
    };
    populateControls();
    setupSettingsTabs(root);
    controls.spellcheck.disabled = !spellcheckSupported;
    root.querySelector("#spellcheck-support").hidden = spellcheckSupported;
    status.textContent = statusMessage;
    if (loadError) onError(new Error(loadError));

    const applyControls = (event) => {
      try {
        const next = {
          ...preferences,
          density: controls.density.value,
          editorDensity: event.target === controls.density
            ? controls.density.value
            : preferences.editorDensity,
          targetLanguage: controls.targetLanguage.value,
          sectionIds: controls.sectionIds.value.split(",").map((id) => id.trim()).filter(Boolean),
          spellcheck: spellcheckSupported && controls.spellcheck.checked,
          dictionaryValidation: controls.dictionaryValidation.checked,
          terminologyValidation: controls.terminologyValidation.checked,
          minSentenceLength: readInteger(controls.minSentenceLength, "Minimum sentence length", 0, 100000),
          maxSentenceLength: readInteger(controls.maxSentenceLength, "Maximum sentence length", 1, 100000),
        };
        validatePreferences(next);
        preferences = copyPreferences(next);
        applyDensity(root, preferences.density, preferences.editorDensity);
        onApply(copyPreferences(preferences));
        setStatus(savePreferences(next, storage)
          ? "Settings saved automatically and applied."
          : "Settings applied for this session, but browser storage is unavailable.");
      } catch (error) {
        onError(error);
      }
    };
    for (const control of Object.values(controls)) {
      control.addEventListener("change", applyControls);
    }
  }

  function populateControls() {
    controls.density.value = preferences.density;
    controls.targetLanguage.value = preferences.targetLanguage;
    controls.sectionIds.value = preferences.sectionIds.join(", ");
    controls.spellcheck.checked = spellcheckSupported && preferences.spellcheck;
    controls.dictionaryValidation.checked = preferences.dictionaryValidation;
    controls.terminologyValidation.checked = preferences.terminologyValidation;
    controls.minSentenceLength.value = String(preferences.minSentenceLength);
    controls.maxSentenceLength.value = String(preferences.maxSentenceLength);
  }

  function setStatus(message) {
    statusMessage = message;
    if (status) status.textContent = message;
  }

  return {
    initialize,
    get preferences() {
      return copyPreferences(preferences);
    },
    update(patch) {
      const next = { ...preferences, ...patch };
      validatePreferences(next);
      preferences = copyPreferences(next);
      setStatus(savePreferences(next, storage)
        ? "Preference saved automatically in this browser."
        : "Preference applied for this session, but browser storage is unavailable.");
    },
    applyImportedPreferences(next) {
      validateImportedPreferences(next);
      preferences = copyPreferences(next);
      applyDensity(root, preferences.density, preferences.editorDensity);
      if (initialized) populateControls();
      applyPreferences(copyPreferences(preferences));
      setStatus("Configuration imported and applied.");
    },
    setStatus,
  };
}

function setupSettingsTabs(root) {
  const tabs = [...root.querySelectorAll("[data-settings-tab]")];
  const selectTab = (selectedTab) => {
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      root.querySelector(`[data-settings-panel="${tab.dataset.settingsTab}"]`).hidden = !selected;
    }
  };
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[nextIndex].focus();
      selectTab(tabs[nextIndex]);
    });
  }
  selectTab(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0]);
}

export function setupSettings(root, onApply, options) {
  const settings = createSettingsController(root, options);
  settings.initialize(onApply);
  return settings;
}

function loadPreferences(storage) {
  if (!storage) throw new Error("Browser storage is unavailable.");
  const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
  const density = DENSITIES.has(stored.density) ? stored.density : DEFAULT_PREFERENCES.density;

  const preferences = {
    ...DEFAULT_PREFERENCES,
    density,
    editorDensity: DENSITIES.has(stored.editorDensity)
      ? stored.editorDensity
      : (stored.density && DENSITIES.has(stored.density) ? stored.density : DEFAULT_PREFERENCES.editorDensity),
    minimumWordLength: finiteInteger(stored.minimumWordLength, 1, 50)
      ?? DEFAULT_PREFERENCES.minimumWordLength,
    dashboardMaximumWordLength: finiteInteger(stored.dashboardMaximumWordLength, 1, 100),
    minimumWordOccurrences: finiteInteger(stored.minimumWordOccurrences, 1, 1000000)
      ?? DEFAULT_PREFERENCES.minimumWordOccurrences,
    dashboardMaximumWordOccurrences: finiteInteger(stored.dashboardMaximumWordOccurrences, 0, 1000000),
    dashboardIncompleteOnly: typeof stored.dashboardIncompleteOnly === "boolean"
      ? stored.dashboardIncompleteOnly
      : DEFAULT_PREFERENCES.dashboardIncompleteOnly,
    dashboardProgressThreshold: finiteInteger(stored.dashboardProgressThreshold, 0, 100)
      ?? DEFAULT_PREFERENCES.dashboardProgressThreshold,
    targetLanguage: ["es", "ca"].includes(stored.targetLanguage)
      ? stored.targetLanguage : DEFAULT_PREFERENCES.targetLanguage,
    sectionIds: Array.isArray(stored.sectionIds)
      ? stored.sectionIds.map(String).map((id) => id.trim()).filter(Boolean)
      : [],
    dictionaryExclusions: Array.isArray(stored.dictionaryExclusions)
      ? [...new Set(stored.dictionaryExclusions
        .filter((word) => typeof word === "string")
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word, index, words) => words.findIndex((candidate) =>
          candidate.toLocaleLowerCase() === word.toLocaleLowerCase()) === index))]
      : [],
    spellcheck: typeof stored.spellcheck === "boolean"
      ? stored.spellcheck
      : DEFAULT_PREFERENCES.spellcheck,
    dictionaryValidation: typeof stored.dictionaryValidation === "boolean"
      ? stored.dictionaryValidation
      : DEFAULT_PREFERENCES.dictionaryValidation,
    terminologyValidation: typeof stored.terminologyValidation === "boolean"
      ? stored.terminologyValidation
      : DEFAULT_PREFERENCES.terminologyValidation,
    minSentenceLength: finiteInteger(stored.minSentenceLength, 0, 100000)
      ?? DEFAULT_PREFERENCES.minSentenceLength,
    maxSentenceLength: finiteInteger(stored.maxSentenceLength, 1, 100000)
      ?? DEFAULT_PREFERENCES.maxSentenceLength,
  };
  if (preferences.maxSentenceLength < preferences.minSentenceLength) {
    return { ...DEFAULT_PREFERENCES, sectionIds: [] };
  }
  if (preferences.dashboardMaximumWordOccurrences !== null
    && preferences.minimumWordOccurrences > preferences.dashboardMaximumWordOccurrences) {
    return { ...preferences, minimumWordOccurrences: DEFAULT_PREFERENCES.minimumWordOccurrences,
      dashboardMaximumWordOccurrences: DEFAULT_PREFERENCES.dashboardMaximumWordOccurrences };
  }
  return preferences;
}

function savePreferences(preferences, storage) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

function validatePreferences(preferences) {
  if (!DENSITIES.has(preferences.density)) {
    throw new Error("Choose a supported table density.");
  }
  if (!DENSITIES.has(preferences.editorDensity)) {
    throw new Error("Choose a supported Editor table density.");
  }
  if (!["es", "ca"].includes(preferences.targetLanguage)) {
    throw new Error("Choose a supported target language.");
  }
  if (!Array.isArray(preferences.sectionIds) || preferences.sectionIds.some((id) => typeof id !== "string")) {
    throw new Error("Section IDs must be a list of text values.");
  }
  if (!Array.isArray(preferences.dictionaryExclusions)
    || preferences.dictionaryExclusions.some((word) => typeof word !== "string" || !word.trim())) {
    throw new Error("Dictionary exclusions must be a list of non-empty words.");
  }
  for (const setting of ["spellcheck", "dictionaryValidation", "terminologyValidation",
    "dashboardIncompleteOnly"]) {
    if (typeof preferences[setting] !== "boolean") {
      throw new Error(`The ${setting} setting must be true or false.`);
    }
  }
  if (!Number.isInteger(preferences.minimumWordLength)
    || preferences.minimumWordLength < 1 || preferences.minimumWordLength > 50) {
    throw new Error("Minimum word length must be a whole number from 1 to 50.");
  }
  if (preferences.dashboardMaximumWordLength !== null
    && (!Number.isInteger(preferences.dashboardMaximumWordLength)
      || preferences.dashboardMaximumWordLength < 1 || preferences.dashboardMaximumWordLength > 100)) {
    throw new Error("Maximum word length must be null or a whole number from 1 to 100.");
  }
  if (!Number.isInteger(preferences.minSentenceLength)
    || preferences.minSentenceLength < 0 || preferences.minSentenceLength > 100000) {
    throw new Error("Minimum sentence length must be a whole number from 0 to 100,000.");
  }
  if (!Number.isInteger(preferences.maxSentenceLength)
    || preferences.maxSentenceLength < 1 || preferences.maxSentenceLength > 100000
    || preferences.maxSentenceLength < preferences.minSentenceLength) {
    throw new Error("Maximum sentence length must be at least the minimum.");
  }
  if (!Number.isInteger(preferences.minimumWordOccurrences)
    || preferences.minimumWordOccurrences < 1 || preferences.minimumWordOccurrences > 1000000) {
    throw new Error("Minimum word occurrences must be a whole number from 1 to 1,000,000.");
  }
  if (preferences.dashboardMaximumWordOccurrences !== null
    && (!Number.isInteger(preferences.dashboardMaximumWordOccurrences)
      || preferences.dashboardMaximumWordOccurrences < 0
      || preferences.dashboardMaximumWordOccurrences > 1000000)) {
    throw new Error("Maximum word occurrences must be null or a whole number from 0 to 1,000,000.");
  }
  if (!Number.isInteger(preferences.dashboardProgressThreshold)
    || preferences.dashboardProgressThreshold < 0 || preferences.dashboardProgressThreshold > 100) {
    throw new Error("Section progress threshold must be a whole number from 0 to 100.");
  }
  if (preferences.dashboardMaximumWordOccurrences !== null
    && preferences.minimumWordOccurrences > preferences.dashboardMaximumWordOccurrences) {
    throw new Error("Maximum word occurrences must be at least the minimum.");
  }
}

export function validateImportedPreferences(preferences) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    throw new Error("Configuration preferences must be an object.");
  }
  const expected = Object.keys(DEFAULT_PREFERENCES).sort();
  const actual = Object.keys(preferences).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("Configuration preferences do not match the supported settings format.");
  }
  validatePreferences(preferences);
  return copyPreferences(preferences);
}

function readInteger(input, label, min, max) {
  const value = Number(input.value);
  if (input.value.trim() === "" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function finiteInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function copyPreferences(preferences) {
  return {
    ...preferences,
    sectionIds: [...preferences.sectionIds],
    dictionaryExclusions: [...preferences.dictionaryExclusions],
  };
}

function applyDensity(root, density, editorDensity) {
  const app = root.closest("#app");
  app?.setAttribute("data-density", density);
  app?.setAttribute("data-editor-density", editorDensity);
}
