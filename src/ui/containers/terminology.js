import { collectTerminology } from "../../core/glossary/index.js";
import {
  createActionCell,
  createMessageRow,
  createTextCell,
} from "../components/table-cells.js";
import { createTableComponent } from "../components/table.js";

const MAP_PAGE_SIZE = 25;
const terminologyStates = new WeakMap();

export { collectTerminology };

export function renderTerminology(
  root,
  entries,
  query = "",
  onOccurrences = () => {},
  onEntry = () => {},
  onMap = () => {},
) {
  const search = root.querySelector("#term-search");
  const typeFilter = root.querySelector("#term-type-filter");
  const termCount = root.querySelector("#term-count");
  const termList = root.querySelector("#term-list");
  const emptyState = root.querySelector("#term-empty-state");
  const detailContent = root.querySelector("#term-detail-content");
  const sourceRows = createTableComponent(root.querySelector("#term-source-map-rows").closest("table")).rows;
  const targetRows = createTableComponent(root.querySelector("#term-target-map-rows").closest("table")).rows;
  let state = terminologyStates.get(root);
  if (!state) {
    state = {
      entries,
      query,
      onOccurrences,
      onEntry,
      onMap,
      selectedKey: null,
      sourcePage: 0,
      targetPage: 0,
      bound: false,
    };
    terminologyStates.set(root, state);
  }
  Object.assign(state, { entries, query, onOccurrences, onEntry, onMap });
  if (!state.bound) {
    root.addEventListener("click", (event) => {
      const selectedButton = event.target.closest("[data-term-select]");
      if (selectedButton) {
        state.selectedKey = selectedButton.dataset.termSelect;
        state.sourcePage = 0;
        state.targetPage = 0;
        renderTerminology(root, state.entries, state.query, state.onOccurrences, state.onEntry, state.onMap);
        return;
      }

      const pageButton = event.target.closest("[data-term-map-page]");
      if (!pageButton) return;
      const [list, action] = pageButton.dataset.termMapPage.split("-");
      const pageKey = list === "source" ? "sourcePage" : "targetPage";
      const pageCount = Math.ceil(getMapRows(
        list === "source"
          ? state.selectedEntry?.englishOccurrences ?? []
          : state.selectedEntry?.translationOccurrences ?? [],
      ).length / MAP_PAGE_SIZE);
      state[pageKey] += action === "next" ? 1 : -1;
      state[pageKey] = Math.max(0, Math.min(state[pageKey], pageCount - 1));
      renderTerminology(root, state.entries, state.query, state.onOccurrences, state.onEntry, state.onMap);
    });
    state.bound = true;
  }

  const filterValue = typeFilter.value;
  const types = [...new Set(entries.map((entry) => entry.type).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  typeFilter.replaceChildren(new Option("All types", ""));
  for (const type of types) typeFilter.add(new Option(type, type));
  typeFilter.value = types.includes(filterValue) ? filterValue : "";

  const needle = query.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) => (!typeFilter.value || entry.type === typeFilter.value)
    && [
      entry.english,
      entry.translation,
      entry.description,
      entry.translatedDescription,
    ].some((value) => value.toLocaleLowerCase().includes(needle)));
  termCount.textContent = `${visible.length} ${visible.length === 1 ? "term" : "terms"}`;
  termList.replaceChildren();
  for (const entry of visible) termList.append(createTermListItem(root.ownerDocument, entry, state.selectedKey));
  if (visible.length === 0) {
    const empty = root.ownerDocument.createElement("li");
    empty.className = "empty-state";
    empty.textContent = entries.length === 0
      ? "No term definitions were found."
      : "No terms match these filters.";
    termList.append(empty);
  }

  const selectedEntry = visible.find((entry) => getTermKey(entry) === state.selectedKey) ?? null;
  state.selectedEntry = selectedEntry;
  const hasSelection = Boolean(selectedEntry);
  emptyState.hidden = hasSelection;
  detailContent.hidden = !hasSelection;
  if (!selectedEntry) {
    sourceRows.replaceChildren(createMessageRow(2, "Select a term to view matching maps."));
    targetRows.replaceChildren(createMessageRow(2, "Select a term to view matching maps."));
    setMapPagination(root, "source", 0, 0, 0);
    setMapPagination(root, "target", 0, 0, 0);
    return;
  }

  root.querySelector("#term-detail-translation").textContent = selectedEntry.translation || "No translation provided";
  root.querySelector("#term-detail-description").textContent =
    selectedEntry.translatedDescription || "No translated description provided";
  root.querySelector("#term-detail-id").textContent = selectedEntry.id || "—";
  root.querySelector("#term-detail-type").textContent = selectedEntry.type || "—";
  root.querySelector("#term-detail-usage").textContent = `${selectedEntry.usagePercentage.toFixed(2)}%`;
  root.querySelector("#term-definition-button").onclick = () => state.onEntry(selectedEntry);

  renderMapRows(root, "source", selectedEntry.englishOccurrences, sourceRows, onOccurrences, state);
  renderMapRows(root, "target", selectedEntry.translationOccurrences, targetRows, onOccurrences, state);
}

export function selectTerminologyEntry(root, entry) {
  const state = terminologyStates.get(root);
  if (!state || !state.entries.includes(entry)) return false;
  state.selectedKey = getTermKey(entry);
  state.sourcePage = 0;
  state.targetPage = 0;
  renderTerminology(root, state.entries, state.query, state.onOccurrences, state.onEntry, state.onMap);
  return true;
}

function createTermListItem(document, entry, selectedKey) {
  const item = document.createElement("li");
  item.className = "term-list-item";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "term-list-button";
  button.dataset.termSelect = getTermKey(entry);
  button.setAttribute("aria-pressed", String(getTermKey(entry) === selectedKey));
  const title = document.createElement("span");
  title.className = "term-list-title";
  title.textContent = entry.english || "—";
  button.append(title);
  if (entry.description) {
    const description = document.createElement("small");
    description.className = "term-list-description";
    description.textContent = entry.description;
    button.append(description);
  }
  const type = document.createElement("span");
  type.className = "term-type-tag";
  type.textContent = entry.type || "Unknown";
  item.append(button, type);
  return item;
}

function getTermKey(entry) {
  return entry.id || `${entry.definitionSection.index}:${entry.definitionRow.index}`;
}

function getMapRows(occurrences) {
  const maps = new Map();
  for (const occurrence of occurrences) {
    const { section } = occurrence;
    let map = maps.get(section.index);
    if (!map) {
      map = { section, name: section.name, occurrences: [] };
      maps.set(section.index, map);
    }
    map.occurrences.push(occurrence);
  }
  return [...maps.values()];
}

function renderMapRows(root, list, occurrences, body, onOccurrences, state) {
  const maps = getMapRows(occurrences);
  const pageKey = list === "source" ? "sourcePage" : "targetPage";
  const pageCount = Math.max(1, Math.ceil(maps.length / MAP_PAGE_SIZE));
  state[pageKey] = Math.max(0, Math.min(state[pageKey], pageCount - 1));
  const page = state[pageKey];
  const start = page * MAP_PAGE_SIZE;
  const rows = maps.slice(start, start + MAP_PAGE_SIZE).map((map) => {
    const row = root.ownerDocument.createElement("tr");
    row.append(createActionCell(map.name, () => state.onMap(map.section.index)));
    const count = createActionCell(map.occurrences.length, () =>
      onOccurrences(`${list === "source" ? "Source" : "Target"}: ${state.selectedEntry[list === "source" ? "english" : "translation"]} — ${map.name}`,
        map.occurrences));
    row.append(count);
    return row;
  });
  body.replaceChildren(...(rows.length
    ? rows
    : [createMessageRow(2, "No matching maps.")]));
  setMapPagination(root, list, page, pageCount, maps.length);
}

function setMapPagination(root, list, page, pageCount, count) {
  const pagination = root.querySelector(`#term-${list}-map-pagination`);
  const pageStatus = root.querySelector(`#term-${list}-map-page-status`);
  pagination.hidden = count <= MAP_PAGE_SIZE;
  pageStatus.textContent = `Page ${page + 1} of ${pageCount || 1}`;
  root.querySelector(`[data-term-map-page="${list}-previous"]`).disabled = page === 0;
  root.querySelector(`[data-term-map-page="${list}-next"]`).disabled = pageCount === 0 || page >= pageCount - 1;
}
