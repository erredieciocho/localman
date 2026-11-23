import { findTranslationSuggestions } from "../../core/translation/index.js";
import { isEditableColumn, renderEntries, updateEntryWarnings } from "../utils/entry-table.js";
import { renderSections } from "../utils/section-list.js";
import { createModalComponent } from "../components/modal.js";

export function setupEditor(root, {
  onSectionChange,
  onNavigate,
  onEdit,
  onExportSection,
  onDownloadSection,
  onImportSection,
  onRowIssues,
  getSourceColor,
  onSourceClick,
  onError,
}) {
  const sectionSelect = root.querySelector("#section-select");
  const searchInput = root.querySelector("#search-input");
  const statusFilter = root.querySelector("#status-filter");
  const autocompleteSelect = root.querySelector("#autocomplete-mode");
  const findInput = root.querySelector("#editor-find-input");
  const replaceInput = root.querySelector("#editor-replace-input");
  const findStatus = root.querySelector("#editor-find-status");
  const findNextButton = root.querySelector("#editor-find-next");
  const findAllButton = root.querySelector("#editor-find-all");
  const replaceCurrentButton = root.querySelector("#editor-replace-current");
  const replaceAllButton = root.querySelector("#editor-replace-all");
  const sectionExportButton = root.querySelector("#section-export-button");
  const sectionImportButton = root.querySelector("#section-import-button");
  const sectionImportInput = root.querySelector("#section-import-input");
  const sectionFileStatus = root.querySelector("#section-file-status");
  const suggestionsModal = createModalComponent(root.querySelector("#suggestions-dialog"));
  const sectionExportModal = createModalComponent(root.querySelector("#section-export-dialog"));
  const textEscapeCodesModal = createModalComponent(root.querySelector("#text-escape-codes-dialog"));
  const sectionExportFileName = root.querySelector("#section-export-file-name");
  const sectionExportPreview = root.querySelector("#section-export-preview");
  const sectionExportDownloadButton = root.querySelector("#section-export-download-button");
  const suggestionsResults = root.querySelector("#suggestions-results");
  root.querySelector("#text-escape-codes-button").addEventListener("click", () => textEscapeCodesModal.show());
  let pendingSectionExport = null;
  let localisation = null;
  let preferences = null;
  let issues = [];
  let dictionary = null;
  let sectionIndex = null;
  let findScope = null;
  let query = "";
  let status = "";
  let rowIndexes;
  let sort = null;
  let sortDirection = 1;
  let currentMatch = null;
  let focusedMatch = null;
  let findMatches = [];
  let highlightedMatches = [];
  let findMatchIndex = -1;
  let autocompleteMode = autocompleteSelect.value;

  sectionSelect.addEventListener("change", () => {
    const index = sectionSelect.value === "all"
      ? "all"
      : sectionSelect.value === ""
        ? null
        : Number(sectionSelect.value);
    if (typeof index === "number" && !Number.isInteger(index)) return;
    sectionIndex = index;
    findScope = index;
    rowIndexes = undefined;
    currentMatch = null;
    focusedMatch = null;
    highlightedMatches = [];
    onSectionChange(index);
    renderEntriesForSection();
    updateFindControls();
    updateSectionActions();
  });
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    rowIndexes = undefined;
    renderEntriesForSection();
  });
  statusFilter.addEventListener("change", () => {
    status = statusFilter.value;
    rowIndexes = undefined;
    renderEntriesForSection();
  });
  autocompleteSelect.addEventListener("change", () => {
    autocompleteMode = autocompleteSelect.value;
    renderEntriesForSection();
  });
  findInput.addEventListener("input", () => {
    currentMatch = null;
    focusedMatch = null;
    highlightedMatches = [];
    findStatus.textContent = "";
    updateFindControls();
    renderEntriesForSection();
  });
  findInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    findNext();
  });
  findNextButton.addEventListener("click", findNext);
  findAllButton.addEventListener("click", findAll);
  replaceCurrentButton.addEventListener("click", replaceCurrent);
  replaceAllButton.addEventListener("click", replaceAll);
  sectionExportButton.addEventListener("click", () => {
    try {
      pendingSectionExport = onExportSection(sectionIndex);
      sectionExportFileName.textContent = pendingSectionExport.fileName;
      sectionExportPreview.value = pendingSectionExport.text;
      sectionExportModal.show();
    } catch (error) {
      onError(error);
    }
  });
  sectionExportDownloadButton.addEventListener("click", () => {
    if (!pendingSectionExport) return;
    try {
      const fileName = onDownloadSection(pendingSectionExport);
      sectionFileStatus.textContent = `Downloaded ${fileName}.`;
      sectionExportModal.close();
      pendingSectionExport = null;
    } catch (error) {
      onError(error);
    }
  });
  sectionExportModal.element.addEventListener("close", () => {
    pendingSectionExport = null;
  });
  sectionImportButton.addEventListener("click", () => sectionImportInput.click());
  sectionImportInput.addEventListener("change", async () => {
    const file = sectionImportInput.files?.[0];
    sectionImportInput.value = "";
    if (!file) return;
    sectionFileStatus.textContent = `Reading ${file.name}…`;
    try {
      const importedSection = await onImportSection(file, file.name, sectionIndex);
      sectionFileStatus.textContent = `Imported ${file.name} into ${importedSection}.`;
    } catch (error) {
      onError(error);
    }
  });
  root.querySelector("#table-headers").addEventListener("click", (event) => {
    const button = event.target.closest("[data-entry-sort]");
    if (!button) return;
    if (sort === button.dataset.entrySort) sortDirection *= -1;
    else {
      sort = button.dataset.entrySort;
      sortDirection = 1;
    }
    renderEntriesForSection();
  });

  function renderEntriesForSection() {
    if (!localisation || !preferences) return;
    renderEntries({
      localisation,
      sectionIndex,
      query,
      status,
      spellcheck: preferences.spellcheck,
      targetLanguage: preferences.targetLanguage,
      autocompleteMode,
      rowIndexes,
      sort: sort ? { column: sort, direction: sortDirection } : null,
      focusedMatch,
      findMatches: highlightedMatches,
      issuesByRow: indexIssuesByRow(issues),
      root,
      getSourceColor,
      onSourceClick,
      onEdit,
      onRowIssues,
      onSuggestions: showSuggestions,
    });
  }

  function getFindSections() {
    if (!localisation) return [];
    if (findScope === "all") {
      return localisation.sections.filter((section) => section.name
        && section.columns.some((column) => isEditableColumn(section, column)));
    }
    return typeof findScope === "number"
      ? [localisation.sections[findScope]].filter((section) =>
        section?.columns.some((column) => isEditableColumn(section, column)))
      : [];
  }

  function collectFindMatches() {
    const needle = findInput.value;
    if (!needle) return [];
    const matches = [];
    for (const section of getFindSections()) {
      for (const row of section.rows) {
        for (const [columnIndex, columnName] of section.columns.entries()) {
          if (!columnName || !isEditableColumn(section, columnName)) continue;
          const value = row.fields[columnIndex] ?? "";
          const expression = new RegExp(escapeRegExp(needle), "giu");
          for (const match of value.matchAll(expression)) {
            matches.push({
              section,
              row,
              columnName,
              start: match.index,
              length: match[0].length,
            });
          }
        }
      }
    }
    return matches;
  }

  function findNext() {
    highlightedMatches = [];
    findMatches = collectFindMatches();
    if (!findInput.value) {
      findStatus.textContent = "Enter text to find.";
      currentMatch = null;
      updateFindControls();
      return;
    }
    if (!findMatches.length) {
      findStatus.textContent = "No matches found in the selected section.";
      currentMatch = null;
      focusedMatch = null;
      updateFindControls();
      renderEntriesForSection();
      return;
    }
    const currentIndex = findMatches.findIndex((match) => sameMatch(match, currentMatch));
    findMatchIndex = (currentIndex + 1) % findMatches.length;
    currentMatch = findMatches[findMatchIndex];
    focusedMatch = currentMatch;
    query = "";
    status = "";
    rowIndexes = undefined;
    searchInput.value = "";
    statusFilter.value = "";
    onSectionChange(sectionIndex);
    renderEntriesForSection();
    renderWarnings();
    focusCurrentMatch();
    findStatus.textContent = `Match ${findMatchIndex + 1} of ${findMatches.length}.`;
    updateFindControls();
    updateSectionActions();
  }

  function findAll() {
    findMatches = collectFindMatches();
    if (!findInput.value) {
      findStatus.textContent = "Enter text to find.";
      highlightedMatches = [];
      updateFindControls();
      return;
    }
    if (!findMatches.length) {
      findStatus.textContent = "No matches found in the selected section.";
      highlightedMatches = [];
      updateFindControls();
      renderEntriesForSection();
      return;
    }
    highlightedMatches = findMatches;
    currentMatch = null;
    focusedMatch = null;
    query = "";
    status = "";
    rowIndexes = undefined;
    searchInput.value = "";
    statusFilter.value = "";
    onSectionChange(sectionIndex);
    renderEntriesForSection();
    renderWarnings();
    focusMatch(findMatches[0]);
    findStatus.textContent = `Found ${findMatches.length} ${findMatches.length === 1 ? "match" : "matches"}.`;
    updateFindControls();
    updateSectionActions();
  }

  function replaceCurrent() {
    const matches = collectFindMatches();
    const match = matches.find((item) => sameMatch(item, currentMatch));
    if (!match) {
      findStatus.textContent = "Find a match before replacing it.";
      updateFindControls();
      return;
    }
    const columnIndex = match.section.columns.indexOf(match.columnName);
    const value = match.row.fields[columnIndex] ?? "";
    const nextValue = value.slice(0, match.start)
      + replaceInput.value
      + value.slice(match.start + match.length);
    onEdit(match.section, match.row, match.columnName, nextValue);
    currentMatch = null;
    focusedMatch = null;
    highlightedMatches = [];
    renderEntriesForSection();
    findStatus.textContent = "Replaced 1 occurrence.";
    updateFindControls();
  }

  function replaceAll() {
    const matches = collectFindMatches();
    if (!findInput.value) {
      findStatus.textContent = "Enter text to find.";
      updateFindControls();
      return;
    }
    if (!matches.length) {
      findStatus.textContent = "No matches found in the selected section.";
      updateFindControls();
      return;
    }
    const edits = new Map();
    for (const match of matches) {
      let rows = edits.get(match.section);
      if (!rows) {
        rows = new Map();
        edits.set(match.section, rows);
      }
      let columns = rows.get(match.row);
      if (!columns) {
        columns = new Set();
        rows.set(match.row, columns);
      }
      columns.add(match.columnName);
    }
    for (const [section, rows] of edits) {
      for (const [row, columns] of rows) {
        for (const columnName of columns) {
          const columnIndex = section.columns.indexOf(columnName);
          const value = row.fields[columnIndex] ?? "";
          const expression = new RegExp(escapeRegExp(findInput.value), "giu");
          const nextValue = value.replace(expression, () => replaceInput.value);
          onEdit(section, row, columnName, nextValue);
        }
      }
    }
    currentMatch = null;
    focusedMatch = null;
    highlightedMatches = [];
    rowIndexes = undefined;
    renderEntriesForSection();
    findStatus.textContent = `Replaced ${matches.length} ${matches.length === 1 ? "occurrence" : "occurrences"}.`;
    updateFindControls();
  }

  function focusMatch(match) {
    const row = [...root.querySelectorAll("#table-rows tr")].find((item) =>
      Number(item.dataset.sectionIndex) === match.section.index
      && Number(item.dataset.rowIndex) === match.row.index);
    const cell = [...(row?.cells ?? [])].find((item) => item.dataset.columnName === match.columnName);
    if (!cell) return;
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    const input = cell.querySelector("textarea, input");
    if (input) {
      input.focus();
      input.setSelectionRange(match.start, match.start + match.length);
    }
  }

  function focusCurrentMatch() {
    focusMatch(currentMatch);
  }

  function updateFindControls() {
    const hasSection = getFindSections().length > 0;
    findNextButton.disabled = !localisation || !hasSection || !findInput.value;
    findAllButton.disabled = !localisation || !hasSection || !findInput.value;
    replaceCurrentButton.disabled = !currentMatch || !hasSection;
    replaceAllButton.disabled = !localisation || !hasSection || !findInput.value;
  }

  function renderWarnings() {
    updateEntryWarnings(root, indexIssuesByRow(issues));
  }

  function render(localisationModel, userPreferences, validationIssues = issues, activeDictionary = dictionary) {
    localisation = localisationModel;
    preferences = userPreferences;
    issues = validationIssues;
    dictionary = activeDictionary;
    if (!localisation) {
      updateFindControls();
      return;
    }
    if (typeof sectionIndex === "number"
      && !localisation.sections.some((section) => section.index === sectionIndex)) sectionIndex = null;
    renderSections(sectionSelect, localisation.sections);
    sectionSelect.value = sectionIndex === null ? "" : String(sectionIndex);
    findScope = sectionIndex;
    searchInput.disabled = false;
    statusFilter.disabled = false;
    renderEntriesForSection();
    renderWarnings();
    updateFindControls();
    updateSectionActions();
  }

  function setSelection(targetSectionIndex, rowIndex, targetStatus = "") {
    sectionIndex = targetSectionIndex;
    findScope = targetSectionIndex;
    currentMatch = null;
    focusedMatch = null;
    highlightedMatches = [];
    query = "";
    status = targetStatus;
    rowIndexes = rowIndex === undefined ? undefined : Array.isArray(rowIndex) ? rowIndex : [rowIndex];
    searchInput.value = "";
    statusFilter.value = status;
    sectionSelect.value = sectionIndex === null ? "" : String(sectionIndex);
    renderEntriesForSection();
    renderWarnings();
    updateFindControls();
    updateSectionActions();
  }

  function updateSectionActions() {
    const canExportOrImport = Boolean(localisation && typeof sectionIndex === "number");
    sectionExportButton.disabled = !canExportOrImport;
    sectionImportButton.disabled = !canExportOrImport;
  }

  function updateIssues(validationIssues, activeDictionary = dictionary) {
    issues = validationIssues;
    dictionary = activeDictionary;
    renderWarnings();
  }

  function showSuggestions(section, entry, input, onApply) {
    suggestionsResults.replaceChildren();
    root.querySelector("#suggestions-title").textContent =
      `Suggestions for ${entry.key || `row ${entry.index + 1}`}`;
    const matches = findTranslationSuggestions(localisation, section, entry, autocompleteMode);
    if (!matches.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = "No matching translations found.";
      suggestionsResults.append(message);
    } else {
      for (const match of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion-button";
        button.textContent = `${match.translation} — ${match.source} (${Math.round(match.score * 100)}%, ${match.section}, ${match.key})`;
        button.addEventListener("click", () => {
          if (localisation.getRowStatus(section, entry) !== "untranslated") {
            suggestionsModal.close();
            renderEntriesForSection();
            return;
          }
          input.value = match.translation;
          onEdit(section, entry, "Translation", input.value);
          onApply();
          suggestionsModal.close();
        });
        suggestionsResults.append(button);
      }
    }
    suggestionsModal.show();
  }

  return {
    render,
    setSelection,
    updateIssues,
    get sectionIndex() {
      return sectionIndex;
    },
  };
}

function indexIssuesByRow(issues) {
  const indexed = new Map();
  for (const issue of issues) {
    const key = `${issue.section.index}:${issue.row.index}`;
    const matching = indexed.get(key) ?? [];
    matching.push(issue);
    indexed.set(key, matching);
  }
  return indexed;
}

function sameMatch(left, right) {
  return Boolean(left && right
    && left.section.index === right.section.index
    && left.row.index === right.row.index
    && left.columnName === right.columnName
    && left.start === right.start);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
