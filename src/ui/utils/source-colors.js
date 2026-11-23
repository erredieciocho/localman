import { createBrowserStorage } from "../../platform/browser/storage.js";

export const SOURCE_COLORS_STORAGE_KEY = "tcoaal-localisation-editor-source-colors";
const COLOR_LIGHTNESS = [0.72, 0.78, 0.68, 0.82, 0.75];

export function createSourceColorStore(storage) {
  const colors = new Map();
  let storageError = "";
  let needsMigrationPersist = false;
  if (storage === undefined) {
    try {
      storage = createBrowserStorage();
    } catch (error) {
      storageError = `Browser storage is unavailable: ${error.message ?? String(error)}`;
    }
  }
  if (!storage) storageError ||= "Browser storage is unavailable; source colours last for this session.";

  if (storage) {
    try {
      const saved = JSON.parse(storage.getItem(SOURCE_COLORS_STORAGE_KEY) ?? "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        throw new Error("Saved source colours must be an object.");
      }
      const entries = Object.entries(saved)
        .filter(([, color]) => /^#[\da-f]{6}$/iu.test(color));
      const generatedEntries = new Set(entries.flatMap(([source, color], index) =>
        color.toLocaleLowerCase() === createLegacyPastelColor(index).toLocaleLowerCase() ? [source] : []));
      const used = new Set(entries.filter(([source]) => !generatedEntries.has(source))
        .map(([, color]) => color.toLocaleLowerCase()));
      let migrated = false;
      for (const [index, [source, savedColor]] of entries.entries()) {
        let color = savedColor;
        if (generatedEntries.has(source)) {
          let paletteIndex = index;
          do {
            color = createDistinctColor(paletteIndex++);
          } while (used.has(color.toLocaleLowerCase()));
          used.add(color.toLocaleLowerCase());
          migrated = true;
        } else {
          used.add(color.toLocaleLowerCase());
        }
        colors.set(source, color);
      }
      needsMigrationPersist = migrated;
    } catch (error) {
      storage = null;
      storageError = `Could not read saved source colours: ${error.message ?? String(error)}`;
    }
  }

  if (needsMigrationPersist) persist();

  function persist() {
    if (!storage) return false;
    try {
      storage.setItem(SOURCE_COLORS_STORAGE_KEY, JSON.stringify(Object.fromEntries(colors)));
      storageError = "";
      return true;
    } catch (error) {
      storageError = `Could not save source colours: ${error.message ?? String(error)}`;
      return false;
    }
  }

  function ensure(values) {
    let index = colors.size;
    const used = new Set([...colors.values()].map((color) => color.toLocaleLowerCase()));
    let changed = false;
    for (const source of [...new Set(values.filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))) {
      if (colors.has(source)) continue;
      let color;
      do {
        color = createDistinctColor(index++);
      } while (used.has(color.toLocaleLowerCase()));
      colors.set(source, color);
      used.add(color.toLocaleLowerCase());
      changed = true;
    }
    if (changed) persist();
    return storageError;
  }

  function set(source, color) {
    if (!source || !/^#[\da-f]{6}$/iu.test(color)) {
      throw new Error("Choose a valid six-digit source tag colour.");
    }
    if ([...colors].some(([name, existing]) =>
      name !== source && existing.toLocaleLowerCase() === color.toLocaleLowerCase())) {
      throw new Error("Each Source tag must use a unique colour.");
    }
    colors.set(source, color);
    return persist();
  }

  function randomise() {
    const sources = [...colors.keys()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }));
    const next = new Map();
    const used = new Set();
    for (const [index, source] of sources.entries()) {
      let color;
      let attempt = 0;
      do {
        color = attempt < 100
          ? createRandomColor(index)
          : createDistinctColor(index + attempt);
        attempt += 1;
      } while (used.has(color.toLocaleLowerCase())
        || color.toLocaleLowerCase() === colors.get(source)?.toLocaleLowerCase());
      next.set(source, color);
      used.add(color.toLocaleLowerCase());
    }
    colors.clear();
    for (const [source, color] of next) colors.set(source, color);
    return persist();
  }

  function replace(sourceColors, { persistChanges = true } = {}) {
    const validated = validateSourceColors(sourceColors);
    if (persistChanges) {
      try {
        if (!storage) throw new Error("Browser storage is unavailable.");
        storage.setItem(SOURCE_COLORS_STORAGE_KEY, JSON.stringify(validated));
        storageError = "";
      } catch (error) {
        storageError = `Could not save source colours: ${error.message ?? String(error)}`;
        throw new Error(storageError);
      }
    }
    colors.clear();
    for (const [source, color] of Object.entries(validated)) colors.set(source, color);
    return true;
  }

  return {
    ensure,
    set,
    randomise,
    replace,
    get values() {
      return Object.fromEntries(colors);
    },
    get(source) {
      return colors.get(source) ?? "";
    },
    get storageError() {
      return storageError;
    },
  };
}

export function renderSourceColorLegend(root, values, colorStore, onChange, onSourceClick = () => {}) {
  const legend = root.querySelector("#source-color-legend");
  legend.replaceChildren();
  legend.classList.toggle("source-color-legend--empty", !values.length);
  if (!values.length) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Load a file with a Source column to view its colours.";
    legend.append(message);
    return;
  }
  const sortedValues = [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }));
  for (const source of sortedValues) {
    const item = document.createElement("div");
    item.className = "source-color-item";
    const tag = createSourceTag(source, colorStore.get(source), onSourceClick);
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = colorStore.get(source);
    picker.setAttribute("aria-label", `Change colour for Source ${source}`);
    picker.addEventListener("change", () => onChange(source, picker.value));
    item.append(tag, picker);
    legend.append(item);
  }
}

export function createSourceTag(source, color, onClick) {
  const tag = document.createElement(onClick ? "button" : "span");
  if (onClick) tag.type = "button";
  tag.className = `source-tag${onClick ? " source-tag-button" : ""}`;
  tag.textContent = source;
  tag.title = source;
  if (onClick) tag.addEventListener("click", () => onClick(source));
  if (color) {
    tag.style.backgroundColor = color;
    tag.style.color = getContrastColor(color);
  }
  return tag;
}

export function validateSourceColors(sourceColors) {
  if (!sourceColors || typeof sourceColors !== "object" || Array.isArray(sourceColors)) {
    throw new Error("Configuration source colours must be an object.");
  }
  const entries = Object.entries(sourceColors);
  const seen = new Set();
  for (const [source, color] of entries) {
    if (!source || typeof color !== "string" || !/^#[\da-f]{6}$/iu.test(color)) {
      throw new Error("Every source colour must have a name and a valid six-digit hex colour.");
    }
    const normalisedColor = color.toLocaleLowerCase();
    if (seen.has(normalisedColor)) {
      throw new Error("Each Source tag must use a unique colour.");
    }
    seen.add(normalisedColor);
  }
  return Object.fromEntries(entries);
}

function createDistinctColor(index) {
  const hue = (index * 137.508) % 360;
  const saturation = 0.38;
  const lightness = COLOR_LIGHTNESS[index % COLOR_LIGHTNESS.length];
  return hslToHex(hue, saturation, lightness);
}

function createRandomColor(index) {
  const hue = Math.random() * 360;
  const saturation = 0.38;
  const lightness = COLOR_LIGHTNESS[index % COLOR_LIGHTNESS.length];
  return hslToHex(hue, saturation, lightness);
}

function createLegacyPastelColor(index) {
  return hslToHex((index * 137.508) % 360, 0.62, 0.9);
}

function hslToHex(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return `#${[red, green, blue].map((value) =>
    Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function getContrastColor(hexColor) {
  const rgb = hexColor.slice(1).match(/.{2}/gu).map((component) => Number.parseInt(component, 16) / 255);
  const luminance = rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? "#242424" : "#ffffff";
}
