import { extractWords } from "../../core/glossary/index.js";
import { createTableComponent } from "../components/table.js";
import { createModalComponent } from "../components/modal.js";
import { createSourceTag } from "../utils/source-colors.js";

const MAP_DATA_URL = new URL("../../../assets/data/maps.json", import.meta.url);
const MAP_FIELDS = ["map", "episode", "route", "description", "summary", "confidence"];
const MAP_ENTRIES_PER_PAGE = 25;

export function setupMaps(root, {
  onError,
  onOpenMap = () => {},
  onOpenEntry = () => {},
  onSourceClick,
  getSourceColor = () => "",
  onStatus = () => {},
} = {}) {
  const search = root.querySelector("#map-search");
  const episodeFilter = root.querySelector("#map-episode-filter");
  const routeFilter = root.querySelector("#map-route-filter");
  const mapCount = root.querySelector("#map-count");
  const mapList = root.querySelector("#map-list");
  const emptyState = root.querySelector("#map-empty-state");
  const detailContent = root.querySelector("#map-detail-content");
  const mapEntryTable = createTableComponent(root.querySelector("#map-entry-table"));
  const endingsButton = root.querySelector("#map-view-endings");
  const endingsList = root.querySelector("#map-endings-list");
  const endingsModal = createModalComponent(root.querySelector("#map-endings-dialog"));
  const mapEntryPagination = root.querySelector("#map-entry-pagination");
  const mapEntryPageStatus = root.querySelector("#map-entry-page-status");
  let localisation = null;
  let sectionMetrics = new Map();
  let records = null;
  let selectedMap = "";
  let entryPage = 0;
  let pendingLoad = null;
  let pendingMapName = "";

  endingsButton.disabled = true;
  endingsButton.addEventListener("click", () => endingsModal.show());
  search.addEventListener("input", render);
  episodeFilter.addEventListener("change", render);
  routeFilter.addEventListener("change", render);
  mapList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-select]");
    if (!button) return;
    selectedMap = button.dataset.mapSelect;
    entryPage = 0;
    render();
  });
  root.querySelector("#map-open-editor").addEventListener("click", () => {
    const section = findMapSection(localisation, selectedMap);
    if (section) onOpenMap(section.index);
  });
  for (const button of root.querySelectorAll("[data-map-entry-page]")) {
    button.addEventListener("click", () => {
      entryPage += button.dataset.mapEntryPage === "next" ? 1 : -1;
      const selected = records?.find(({ map }) => map === selectedMap);
      if (selected) renderSelectedMap(selected);
    });
  }

  async function load() {
    if (records) return records;
    if (pendingLoad) return pendingLoad;
    onStatus("loading");
    mapCount.textContent = "Loading map data…";
    pendingLoad = loadMapRecords()
      .then((loadedRecords) => {
        records = loadedRecords;
        onStatus("available");
        renderEndings(records);
        endingsButton.disabled = false;
        populateFilters();
        search.disabled = false;
        episodeFilter.disabled = false;
        routeFilter.disabled = false;
        selectPendingMap();
        render();
        return records;
      })
      .catch((error) => {
        onStatus("unavailable");
        mapCount.textContent = "Map data could not be loaded.";
        onError(error);
        return null;
      })
      .finally(() => {
        pendingLoad = null;
      });
    return pendingLoad;
  }

  function populateFilters() {
    populateSelect(episodeFilter, "All episodes", records.map(({ episode }) => episode));
    populateSelect(routeFilter, "All routes", records.map(({ route }) => route));
  }

  function renderEndings(mapRecords) {
    const summaries = new Map();
    for (const record of mapRecords) {
      for (const ending of record.ending) {
        const excerpts = summaries.get(ending) ?? [];
        const excerpt = getEndingSummaryExcerpt(ending, record.summary);
        if (!excerpts.includes(excerpt)) excerpts.push(excerpt);
        summaries.set(ending, excerpts);
      }
    }

    endingsList.replaceChildren();
    if (!summaries.size) {
      const empty = root.ownerDocument.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No endings are listed in the map catalogue.";
      endingsList.append(empty);
      return;
    }

    for (const [ending, excerpts] of summaries) {
      const item = root.ownerDocument.createElement("section");
      item.className = "map-ending-summary";
      const title = root.ownerDocument.createElement("h3");
      title.textContent = ending;
      const summary = root.ownerDocument.createElement("p");
      summary.textContent = excerpts.join(" ");
      item.append(title, summary);
      endingsList.append(item);
    }
  }

  function updateDocument(document) {
    localisation = document;
    sectionMetrics = buildSectionMetrics(document);
    entryPage = 0;
    if (records) render();
  }

  function openMap(mapName) {
    pendingMapName = normaliseMapName(mapName);
    selectedMap = "";
    entryPage = 0;
    search.value = "";
    episodeFilter.value = "";
    routeFilter.value = "";
    if (records) {
      selectPendingMap();
      render();
    } else {
      load();
    }
  }

  function openSection(sectionIndex) {
    const section = localisation?.sections.find(({ index }) => index === sectionIndex);
    if (!section?.name) return false;
    openMap(section.name);
    return true;
  }

  function selectPendingMap() {
    if (!pendingMapName || !records) return;
    const requestedName = pendingMapName;
    pendingMapName = "";
    const record = records.find(({ map }) => normaliseMapName(map) === requestedName);
    if (record) {
      selectedMap = record.map;
      return;
    }
    search.value = requestedName;
  }

  function render() {
    if (!records) return;
    const query = search.value.trim().toLocaleLowerCase();
    const visible = records.filter((record) =>
      (!episodeFilter.value || record.episode === episodeFilter.value)
      && (!routeFilter.value || record.route === routeFilter.value)
      && MAP_FIELDS.some((field) => record[field].toLocaleLowerCase().includes(query)));
    mapCount.textContent = `${visible.length.toLocaleString()} ${visible.length === 1 ? "map" : "maps"}`;
    mapList.replaceChildren(...visible.map((record) => createMapListItem(
      root.ownerDocument,
      record,
      selectedMap,
    )));
    if (!visible.length) {
      const empty = root.ownerDocument.createElement("li");
      empty.className = "empty-state";
      empty.textContent = records.length === 0
        ? "No map records were found."
        : "No maps match these filters.";
      mapList.append(empty);
    }

    const selected = visible.find(({ map }) => map === selectedMap) ?? null;
    emptyState.hidden = Boolean(selected);
    detailContent.hidden = !selected;
    if (!selected) return;

    renderSelectedMap(selected);
  }

  function renderSelectedMap(record) {
    root.querySelector("#map-detail-name").textContent = record.map;
    root.querySelector("#map-detail-episode").textContent = record.episode;
    root.querySelector("#map-detail-route").textContent = record.route;
    root.querySelector("#map-detail-ending").textContent = record.ending.length
      ? record.ending.join(", ")
      : "None";
    root.querySelector("#map-detail-description").textContent = record.description;
    root.querySelector("#map-detail-summary").textContent = record.summary;

    const section = findMapSection(localisation, record.map);
    const openButton = root.querySelector("#map-open-editor");
    openButton.disabled = !section;
    openButton.title = !localisation
      ? "Load a localisation file to open this map in the Editor."
      : section ? "" : "This map is not present in the loaded localisation file.";
    root.querySelector("#map-entry-panel").hidden = !section;
    const emptyMessage = root.querySelector("#map-entry-empty-state");
    emptyMessage.hidden = Boolean(section);
    if (!section) {
      emptyMessage.textContent = !localisation
        ? "Load a localisation file to view map entries and progress."
        : "This map is not present in the loaded localisation file.";
      root.querySelector("#map-detail-progress").textContent = "—";
      root.querySelector("#map-detail-progress-bar").value = 0;
      root.querySelector("#map-detail-complexity").textContent = "—";
      root.querySelector("#map-detail-entry-count").textContent = "—";
      root.querySelector("#map-detail-unique-word-count").textContent = "—";
      root.querySelector("#map-entry-count").textContent = "";
      root.querySelector("#map-entry-rows").replaceChildren();
      mapEntryPagination.hidden = true;
      return;
    }

    const metrics = sectionMetrics.get(section);
    if (metrics) {
      root.querySelector("#map-detail-progress").textContent = formatPercentage(metrics.progress);
      root.querySelector("#map-detail-progress-bar").value = metrics.progress;
      root.querySelector("#map-detail-complexity").textContent = metrics.complexity.toFixed(2);
      root.querySelector("#map-detail-entry-count").textContent = metrics.entries.toLocaleString();
      root.querySelector("#map-detail-unique-word-count").textContent = metrics.uniqueWords.toLocaleString();
    } else {
      root.querySelector("#map-detail-progress").textContent = "—";
      root.querySelector("#map-detail-progress-bar").value = 0;
      root.querySelector("#map-detail-complexity").textContent = "—";
      root.querySelector("#map-detail-entry-count").textContent = section.rows.length.toLocaleString();
      root.querySelector("#map-detail-unique-word-count").textContent = "0";
    }

    renderEntryTable(section);
  }

  function renderEntryTable(section) {
    const pageCount = Math.max(1, Math.ceil(section.rows.length / MAP_ENTRIES_PER_PAGE));
    entryPage = Math.max(0, Math.min(entryPage, pageCount - 1));
    const start = entryPage * MAP_ENTRIES_PER_PAGE;
    const indexes = {
      id: section.columns.indexOf("ID"),
      source: section.columns.indexOf("Source"),
      original: section.columns.indexOf("English") >= 0
        ? section.columns.indexOf("English")
        : section.columns.indexOf("Original"),
      translation: section.columns.indexOf("Translation"),
    };
    const rows = section.rows.slice(start, start + MAP_ENTRIES_PER_PAGE).map((entry) => {
      const row = root.ownerDocument.createElement("tr");
      for (const [key, index] of Object.entries(indexes)) {
        const cell = root.ownerDocument.createElement("td");
        const value = index >= 0 ? entry.fields[index] ?? "" : "";
        if (key === "id" && value) {
          const button = root.ownerDocument.createElement("button");
          button.type = "button";
          button.className = "text-button";
          button.textContent = value;
          button.title = `Open ${value} in the Editor`;
          button.addEventListener("click", () => onOpenEntry(section.index, entry.index));
          cell.append(button);
        } else if (key === "source" && value) {
          cell.append(createSourceTag(value, getSourceColor(value), onSourceClick));
        } else {
          cell.textContent = value;
        }
        row.append(cell);
      }
      return row;
    });
    if (!rows.length) {
      const row = root.ownerDocument.createElement("tr");
      const cell = root.ownerDocument.createElement("td");
      cell.colSpan = 4;
      cell.className = "empty-state";
      cell.textContent = "This map has no entries.";
      row.append(cell);
      rows.push(row);
    }
    mapEntryTable.rows.replaceChildren(...rows);

    root.querySelector("#map-entry-count").textContent =
      `${section.rows.length.toLocaleString()} ${section.rows.length === 1 ? "entry" : "entries"}`;
    mapEntryPagination.hidden = section.rows.length <= MAP_ENTRIES_PER_PAGE;
    mapEntryPageStatus.textContent = `Page ${entryPage + 1} of ${pageCount}`;
    root.querySelector('[data-map-entry-page="previous"]').disabled = entryPage === 0;
    root.querySelector('[data-map-entry-page="next"]').disabled = entryPage >= pageCount - 1;
  }

  return { load, updateDocument, openMap, openSection };
}

function buildSectionMetrics(localisation) {
  const records = [];
  if (!localisation) return new Map();

  for (const section of localisation.sections) {
    const translationIndex = section.columns.indexOf("Translation");
    if (!section.name || translationIndex < 0) continue;

    const uniqueWords = new Set();
    for (const row of section.rows) {
      for (const word of extractWords(row.fields[translationIndex] ?? "")) uniqueWords.add(word);
    }
    let translated = 0;
    let remaining = 0;
    for (const row of section.rows) {
      const status = localisation.getRowStatus(section, row);
      if (status === "translated") translated += 1;
      if (status === "untranslated") remaining += 1;
    }
    records.push({
      section,
      entries: section.rows.length,
      uniqueWords: uniqueWords.size,
      progress: translated + remaining
        ? Math.round(translated / (translated + remaining) * 1000) / 10
        : 0,
    });
  }

  const maximumEntries = Math.max(1, ...records.map(({ entries }) => entries));
  const maximumWords = Math.max(1, ...records.map(({ uniqueWords }) => uniqueWords));
  return new Map(records.map((record) => [record.section, {
    ...record,
    complexity: record.entries / maximumEntries + record.uniqueWords / maximumWords,
  }]));
}

function getEndingSummaryExcerpt(ending, summary) {
  const sentences = summary.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((sentence) => sentence.trim()) ?? [];
  const mentionIndex = sentences.findIndex((sentence) =>
    sentence.toLocaleLowerCase().includes(ending.toLocaleLowerCase()));
  if (mentionIndex < 0) return sentences[0] ?? summary;

  let mentionedSentence = sentences[mentionIndex];
  let nextSentence = mentionIndex + 1;
  while (nextSentence < sentences.length
    && /^["'“‘([{]*\s*[a-z]/u.test(sentences[nextSentence])) {
    const continuation = sentences[nextSentence];
    const closingQuote = /^["'”’]/u.exec(continuation)?.[0] ?? "";
    mentionedSentence += closingQuote
      ? `${closingQuote} ${continuation.slice(closingQuote.length).trimStart()}`
      : ` ${continuation}`;
    nextSentence += 1;
  }
  if (/\b(?:tied to|scene)\b/iu.test(mentionedSentence) && sentences.length > 1) {
    const finalSentence = sentences.at(-1);
    if (!mentionedSentence.endsWith(finalSentence)) return `${mentionedSentence} ${finalSentence}`;
  }
  return mentionedSentence;
}

function findMapSection(localisation, mapName) {
  if (!localisation) return null;
  const targetName = normaliseMapName(mapName);
  return localisation.sections.find((section) =>
    section.name && normaliseMapName(section.name) === targetName) ?? null;
}

function normaliseMapName(name) {
  return name.replace(/\.json$/iu, "").toLocaleLowerCase();
}

function formatPercentage(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

async function loadMapRecords() {
  const response = await fetch(MAP_DATA_URL);
  if (!response.ok) {
    throw new Error(`Map data could not be loaded (HTTP ${response.status}).`);
  }
  const data = await response.json();
  if (!data || !Array.isArray(data.maps) || data.count !== data.maps.length) {
    throw new TypeError("Map data must contain a matching count and maps array.");
  }
  const seenMaps = new Set();
  for (const record of data.maps) {
    if (!record || MAP_FIELDS.some((field) => typeof record[field] !== "string" || !record[field].trim())) {
      throw new TypeError("Each map record must contain a map, episode, route, description and confidence.");
    }
    if (!Array.isArray(record.ending)
      || record.ending.some((ending) => typeof ending !== "string" || !ending.trim())) {
      throw new TypeError("Each map record must contain an ending array of non-empty strings.");
    }
    if (seenMaps.has(record.map)) {
      throw new TypeError(`Map data contains a duplicate map name: ${record.map}.`);
    }
    seenMaps.add(record.map);
  }
  return data.maps;
}

function populateSelect(select, label, values) {
  const selected = select.value;
  select.replaceChildren(new Option(label, ""));
  for (const value of [...new Set(values)].sort((left, right) => left.localeCompare(right))) {
    select.add(new Option(value, value));
  }
  select.value = [...select.options].some((option) => option.value === selected) ? selected : "";
}

function createMapListItem(document, record, selectedMap) {
  const item = document.createElement("li");
  item.className = "map-list-item";
  if (record.ending.length) item.classList.add("map-list-item--ending");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-list-button";
  button.dataset.mapSelect = record.map;
  button.setAttribute("aria-pressed", String(record.map === selectedMap));
  const title = document.createElement("span");
  title.className = "map-list-title";
  title.textContent = record.map;
  const episode = document.createElement("small");
  episode.className = "map-list-episode";
  episode.textContent = record.episode;
  button.append(title, episode);
  const route = document.createElement("span");
  route.className = "map-route-tag";
  route.textContent = record.route;
  item.append(button, route);
  return item;
}
