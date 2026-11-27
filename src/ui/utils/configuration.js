import { SETTINGS_STORAGE_KEY, validateImportedPreferences } from "../containers/settings.js";
import { SOURCE_COLORS_STORAGE_KEY, validateSourceColors } from "./source-colors.js";

export const THEME_STORAGE_KEY = "tcoaal-localisation-editor-theme";
const CONFIGURATION_FORMAT = "tcoaal-localisation-editor-configuration";
const CONFIGURATION_VERSION = 1;
const STORAGE_KEYS = [SETTINGS_STORAGE_KEY, SOURCE_COLORS_STORAGE_KEY, THEME_STORAGE_KEY];

export function createConfiguration(preferences, theme, sourceColors) {
  if (theme !== "light" && theme !== "dark") {
    throw new Error("Configuration theme must be light or dark.");
  }
  return {
    format: CONFIGURATION_FORMAT,
    version: CONFIGURATION_VERSION,
    preferences: validateImportedPreferences(preferences),
    theme,
    sourceColors: validateSourceColors(sourceColors),
  };
}

export function parseConfiguration(contents) {
  let configuration;
  try {
    configuration = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not read configuration JSON: ${error.message}`);
  }
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new Error("Configuration file must contain a JSON object.");
  }
  const keys = ["format", "version", "preferences", "theme", "sourceColors"].sort();
  const actualKeys = Object.keys(configuration).sort();
  if (actualKeys.length !== keys.length || actualKeys.some((key, index) => key !== keys[index])) {
    throw new Error("Configuration file has missing or unsupported fields.");
  }
  if (configuration.format !== CONFIGURATION_FORMAT || configuration.version !== CONFIGURATION_VERSION) {
    throw new Error("Configuration file format or version is not supported.");
  }
  return createConfiguration(
    configuration.preferences,
    configuration.theme,
    configuration.sourceColors,
  );
}

export function persistConfiguration(configuration, storage) {
  if (!storage) throw new Error("Browser storage is unavailable; configuration was not imported.");
  const values = [
    JSON.stringify(configuration.preferences),
    JSON.stringify(configuration.sourceColors),
    configuration.theme,
  ];
  const previous = STORAGE_KEYS.map((key) => [key, storage.getItem(key)]);
  try {
    STORAGE_KEYS.forEach((key, index) => storage.setItem(key, values[index]));
  } catch (error) {
    const rollbackErrors = [];
    for (const [key, value] of previous.reverse()) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Configuration import failed and the previous browser settings could not be fully restored.",
      );
    }
    throw new Error(`Configuration could not be saved: ${error.message ?? String(error)}`);
  }
}

export function clearConfiguration(storage) {
  if (!storage) throw new Error("Browser storage is unavailable; saved settings were not cleared.");
  const previous = STORAGE_KEYS.map((key) => [key, storage.getItem(key)]);
  try {
    for (const [key] of previous) storage.removeItem(key);
  } catch (error) {
    const rollbackErrors = [];
    for (const [key, value] of previous.reverse()) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Saved settings could not be cleared and the previous configuration could not be fully restored.",
      );
    }
    throw new Error(`Saved settings could not be cleared: ${error.message ?? String(error)}`);
  }
}
