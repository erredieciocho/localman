import { createSourceTag } from "./source-colors.js";
import { createTableComponent } from "../components/table.js";

export function isEditableColumn(section, columnName) {
  return columnName === "Translation" && section.columns.includes(columnName)
    || isEditableMetadataSection(section);
}

function isEditableMetadataSection(section) {
  const isLanguageFontMetadata = section.index === 1
    && ["Language", "Font File", "Font Size"].every((column) => section.columns.includes(column));
  const isCreditsMetadata = section.index === 2
    && section.columns.some((column) => /^credits?(?:\s+\d+)?$/iu.test(column));
  return !section.name && (isLanguageFontMetadata || isCreditsMetadata);
}

export function updateEntryWarnings(root, issuesByRow) {
  for (const warning of root.querySelectorAll("[data-row-warning]")) {
    const row = warning.closest("tr");
    const issues = issuesByRow.get(`${row.dataset.sectionIndex}:${row.dataset.rowIndex}`) ?? [];
    warning.hidden = issues.length === 0;
    warning.textContent = "⚠";
    warning.title = `Review ${issues.length} ${issues.length === 1 ? "issue" : "issues"} in QA`;
    warning.setAttribute("aria-label", warning.title);
  }
}

export function renderEntries({
  localisation,
  sectionIndex,
  query,
  status,
  spellcheck = true,
  targetLanguage = "es",
  autocompleteMode = "off",
  rowIndexes,
  sort,
  focusedMatch,
  issuesByRow = new Map(),
  root,
  getSourceColor = () => "",
  onSourceClick = () => {},
  onEdit,
  onSuggestions = () => {},
  onRowIssues = () => {},
}) {
  const allSections = sectionIndex === "all";
  const selectedSections = allSections
    ? localisation.sections.filter((section) => section.name && section.columns.includes("Translation"))
    : sectionIndex === null
      ? []
      : [localisation.sections[sectionIndex]].filter(Boolean);
  const table = root.querySelector("#entry-table");
  const tableComponent = createTableComponent(table);
  const headerRow = tableComponent.head.rows[0] ?? tableComponent.head.insertRow();
  const body = tableComponent.rows;
  const caption = root.querySelector("#table-caption");
  const entryCount = root.querySelector("#entry-count");

  headerRow.replaceChildren();
  body.replaceChildren();
  table.querySelector("colgroup")?.remove();
  table.classList.add("entry-table");
  const bodyFragment = document.createDocumentFragment();

  if (!selectedSections.length) {
    caption.textContent = "Select a section to view its entries.";
    entryCount.textContent = "0 entries";
    return;
  }

  const visibleColumns = allSections
    ? [...new Set(selectedSections.flatMap((section) => section.columns.filter(Boolean)))]
    : selectedSections[0].columns.filter(Boolean);
  caption.textContent = allSections
    ? `All (Maps) (${selectedSections.length} sections)`
    : selectedSections[0].name || `Unnamed section ${selectedSections[0].index + 1}`;
  const sortColumns = ["Index", ...(allSections ? ["Section"] : []), ...visibleColumns];
  const primaryColumns = sortColumns.filter((column) => column === "English" || column === "Translation");
  const primaryWidth = primaryColumns.length === 2 ? 35 : primaryColumns.length === 1 ? 70 : 0;
  const remainingColumns = sortColumns.length - primaryColumns.length;
  const remainingWidth = (100 - primaryWidth * primaryColumns.length) / remainingColumns;
  const columnGroup = document.createElement("colgroup");
  for (const column of sortColumns) {
    const element = document.createElement("col");
    element.style.width = `${primaryColumns.includes(column) ? primaryWidth : remainingWidth}%`;
    columnGroup.append(element);
  }
  table.insertBefore(columnGroup, table.querySelector("thead"));

  for (const column of sortColumns) {
    const header = document.createElement("th");
    header.scope = "col";
    if (column === "Translation") header.classList.add("editable-column");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button entry-sort-button";
    button.dataset.entrySort = column;
    const label = document.createElement("span");
    label.className = "text-button-label";
    label.textContent = column;
    button.append(label);
    if (sort?.column === column) {
      header.setAttribute("aria-sort", sort.direction === 1 ? "ascending" : "descending");
    }
    header.append(button);
    headerRow.append(header);
  }

  const matches = selectedSections.flatMap((section) =>
    localisation.searchRows({ sectionIndex: section.index, query, status })
      .filter(({ row }) => rowIndexes === undefined || rowIndexes.includes(row.index))
      .filter(({ row, section: matchedSection }) => !focusedMatch
        || (focusedMatch.section.index === matchedSection.index && focusedMatch.row.index === row.index))
      .map(({ row }) => ({ section, entry: row })));
  if (sort) {
    matches.sort((left, right) => {
      const valueFor = ({ section, entry }) => {
        if (sort.column === "Index") return entry.sourceLine;
        if (sort.column === "Section") return section.name ?? "";
        const index = section.columns.indexOf(sort.column);
        return index < 0 ? "" : entry.fields[index] ?? "";
      };
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
      return comparison * sort.direction
        || left.section.index - right.section.index
        || left.entry.index - right.entry.index;
    });
  }
  const totalEntries = selectedSections.reduce((total, section) => total + section.rows.length, 0);
  entryCount.textContent = `Showing ${matches.length} of ${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`;

  if (!matches.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty-state";
    cell.colSpan = sortColumns.length;
    cell.textContent = "No entries match the current search and filter.";
    row.append(cell);
    body.append(row);
    return;
  }

  for (const { section, entry } of matches) {
    const canEditMetadata = isEditableMetadataSection(section);
    const translationIndex = section.columns.indexOf("Translation");
    const tableRow = document.createElement("tr");
    tableRow.dataset.sectionIndex = String(section.index);
    tableRow.dataset.rowIndex = String(entry.index);
    const indexCell = document.createElement("td");
    const warning = document.createElement("button");
    warning.type = "button";
    warning.className = "row-warning";
    warning.dataset.rowWarning = "";
    warning.addEventListener("click", () => onRowIssues(section, entry));
    const sourceLine = document.createElement("span");
    sourceLine.textContent = String(entry.sourceLine);
    const indexContent = document.createElement("div");
    indexContent.className = "entry-index-content";
    indexContent.append(sourceLine, warning);
    indexCell.append(indexContent);
    tableRow.append(indexCell);
    if (allSections) {
      const cell = document.createElement("td");
      cell.textContent = section.name;
      tableRow.append(cell);
    }
    for (const name of visibleColumns) {
      const cell = document.createElement("td");
      const columnIndex = section.columns.indexOf(name);
      cell.dataset.columnName = name;
      if (columnIndex < 0) {
        tableRow.append(cell);
        continue;
      }
      if (focusedMatch
        && focusedMatch.section.index === section.index
        && focusedMatch.row.index === entry.index
        && focusedMatch.columnName === name) {
        cell.classList.add("find-replace-match");
      }
      const value = entry.fields[columnIndex] ?? "";
      cell.classList.toggle("editable-column", name === "Translation");
      if (name === "ID") {
        cell.textContent = value;
      } else if (name === "Source" && value) {
        cell.append(createSourceTag(value, getSourceColor(value), onSourceClick));
      } else if (columnIndex === translationIndex) {
        const input = document.createElement("textarea");
        input.className = "translation-input";
        input.rows = 2;
        input.value = value;
        input.lang = targetLanguage;
        input.spellcheck = spellcheck;
        input.setAttribute("aria-label", `Translation for ${entry.key || `row ${entry.index + 1}`}`);
        let lastCommittedValue = value;
        const showButton = document.createElement("button");
        showButton.type = "button";
        showButton.className = "text-button";
        showButton.textContent = "Show translation suggestions";
        const updateAvailability = () => {
          showButton.hidden = autocompleteMode === "off"
            || localisation.getRowStatus(section, entry) !== "untranslated";
        };
        showButton.addEventListener("click", () => onSuggestions(section, entry, input, () => {
          lastCommittedValue = input.value;
          updateAvailability();
        }));
        input.addEventListener("blur", () => {
          if (input.value !== lastCommittedValue) {
            onEdit(section, entry, name, input.value);
            lastCommittedValue = input.value;
          }
          updateAvailability();
        });
        showButton.addEventListener("click", updateAvailability);
        cell.append(input, showButton);
        updateAvailability();
      } else if (canEditMetadata) {
        const input = document.createElement("input");
        input.className = "metadata-input";
        input.type = "text";
        input.value = value;
        input.setAttribute("aria-label", `${name} in ${section.name || `section ${section.index + 1}`}, row ${entry.index + 1}`);
        let lastCommittedValue = value;
        input.addEventListener("blur", () => {
          if (input.value !== lastCommittedValue) {
            onEdit(section, entry, name, input.value);
            lastCommittedValue = input.value;
          }
        });
        cell.append(input);
      } else {
        cell.textContent = value;
      }
      tableRow.append(cell);
    }
    bodyFragment.append(tableRow);
  }
  body.append(bodyFragment);
  updateEntryWarnings(root, issuesByRow);
}
