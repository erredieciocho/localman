import { compareLocalisationDocuments, isMapSection } from "../../core/document/index.js";
import { createSourceTag } from "../utils/source-colors.js";

const SECTIONS_PER_PAGE = 10;

export function setupCompare(root, {
  onLoadTarget,
  onError,
  onOpenSection = () => {},
  onOpenEntry = () => {},
  onSourceClick,
  getSourceColor = () => "",
} = {}) {
  const fileInput = root.querySelector("#compare-target-file");
  const selectButton = root.querySelector("#compare-target-button");
  const currentLabel = root.querySelector("#compare-current-file");
  const targetLabel = root.querySelector("#compare-target-name");
  const summary = root.querySelector("#compare-summary");
  const status = root.querySelector("#compare-status");
  const pagination = root.querySelector("#compare-pagination");
  const pageStatus = root.querySelector("#compare-page-status");
  const previousPageButton = root.querySelector('[data-compare-page="previous"]');
  const nextPageButton = root.querySelector('[data-compare-page="next"]');
  const results = root.querySelector("#compare-results");
  let currentDocument = null;
  let currentFileName = "";
  let targetDocument = null;
  let targetFileName = "";
  let sectionPage = 0;

  selectButton.addEventListener("click", () => fileInput.click());
  previousPageButton.addEventListener("click", () => {
    sectionPage -= 1;
    render();
  });
  nextPageButton.addEventListener("click", () => {
    sectionPage += 1;
    render();
  });
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files ?? [];
    if (!file) return;
    try {
      const loadedDocument = await onLoadTarget(file);
      if (loadedDocument?.readonly) {
        throw new Error("Compare only supports editable localisation formats.");
      }
      if (!currentDocument || loadedDocument?.formatId !== currentDocument.formatId) {
        throw new Error("The target file must use the same format as the current localisation file.");
      }
      targetDocument = loadedDocument;
      targetFileName = file.name;
      sectionPage = 0;
      render();
    } catch (error) {
      onError(error);
    } finally {
      fileInput.value = "";
    }
  });

  function render(nextCurrentDocument = currentDocument, nextCurrentFileName = currentFileName) {
    currentDocument = nextCurrentDocument;
    currentFileName = nextCurrentFileName;
    fileInput.accept = getFormatAccept(currentDocument?.formatId);
    selectButton.disabled = !isComparableFormat(currentDocument);
    if (targetDocument && currentDocument?.formatId !== targetDocument.formatId) {
      targetDocument = null;
      targetFileName = "";
      sectionPage = 0;
    }
    currentLabel.textContent = currentFileName || "No current file";
    targetLabel.textContent = targetFileName || "No target file selected";
    summary.replaceChildren();
    results.replaceChildren();
    pagination.hidden = true;

    if (!isComparableFormat(currentDocument)) {
      status.textContent = "Open a current localisation file to begin comparing.";
      return;
    }
    if (!targetDocument) {
      status.textContent = "Select a target localisation file to compare.";
      return;
    }

    try {
      const comparison = compareLocalisationDocuments(currentDocument, targetDocument);
      renderSummary(summary, comparison.summary);
      const pageCount = Math.max(1, Math.ceil(comparison.sections.length / SECTIONS_PER_PAGE));
      sectionPage = Math.min(sectionPage, pageCount - 1);
      renderPagination(pageCount);
      renderDifferences(
        results,
        comparison.sections,
        currentFileName,
        targetFileName,
        sectionPage,
        onOpenSection,
        onOpenEntry,
        onSourceClick,
        getSourceColor,
      );
      const { changed, currentOnly, targetOnly } = comparison.summary;
      status.textContent = changed + currentOnly + targetOnly
        ? `${changed} changed, ${currentOnly} extra in current, ${targetOnly} missing from current.`
        : "No differences found.";
    } catch (error) {
      status.textContent = "The files could not be compared.";
      onError(error);
    }
  }

  function renderPagination(pageCount) {
    pagination.hidden = pageCount <= 1;
    pageStatus.textContent = `Page ${sectionPage + 1} of ${pageCount}`;
    previousPageButton.disabled = sectionPage === 0;
    nextPageButton.disabled = sectionPage >= pageCount - 1;
  }

  return { render };
}

function getFormatAccept(formatId) {
  if (formatId === "csv") return ".csv,text/csv";
  if (formatId === "txt") return ".txt,text/plain";
  return "";
}

function isComparableFormat(document) {
  return Boolean(document && !document.readonly && ["csv", "txt"].includes(document.formatId));
}

function renderSummary(root, { changed, currentOnly, targetOnly }) {
  const items = [
    ["Changed entries", changed],
    ["Extra in current", currentOnly],
    ["Missing from current", targetOnly],
  ];
  for (const [label, count] of items) {
    const item = document.createElement("div");
    item.className = "compare-summary-item";
    const value = document.createElement("strong");
    value.textContent = count.toLocaleString();
    const text = document.createElement("span");
    text.textContent = label;
    item.append(value, text);
    root.append(item);
  }
}

function renderDifferences(
  root,
  sections,
  currentFileName,
  targetFileName,
  page,
  onOpenSection,
  onOpenEntry,
  onSourceClick,
  getSourceColor,
) {
  if (!sections.length) {
    root.append(createMessage("No entry differences to display."));
    return;
  }

  const pageSections = sections.slice(page * SECTIONS_PER_PAGE, (page + 1) * SECTIONS_PER_PAGE);
  for (const section of pageSections) {
    const sectionPanel = document.createElement("details");
    sectionPanel.className = "compare-section";
    const heading = document.createElement("summary");
    const name = section.name || "Unnamed section";
    if (isMapSection(section)
      || (!section.name && typeof section.currentSectionIndex === "number")) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "text-button section-stat-link";
      link.textContent = name;
      link.title = section.name ? `Open ${section.name} in Maps` : "Open unnamed section in the Editor";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenSection(section.name, section.currentSectionIndex);
      });
      heading.append(link);
    } else {
      heading.append(document.createTextNode(name));
    }
    const count = document.createElement("span");
    count.textContent = `${section.entries.length} ${section.entries.length === 1 ? "difference" : "differences"}`;
    heading.append(count);
    sectionPanel.append(heading);
    for (const entry of section.entries) {
      sectionPanel.append(renderEntry(
        entry,
        currentFileName,
        targetFileName,
        section,
        onOpenEntry,
        onSourceClick,
        getSourceColor,
      ));
    }
    root.append(sectionPanel);
  }
}

function renderEntry(
  entry,
  currentFileName,
  targetFileName,
  section,
  onOpenEntry,
  onSourceClick,
  getSourceColor,
) {
  const card = document.createElement("article");
  card.className = `compare-entry compare-entry--${entry.status}`;
  const heading = document.createElement("header");
  heading.className = "compare-entry-heading";
  const identityText = entry.occurrence > 1
    ? `${entry.id || "(no ID)"} (${entry.occurrence})`
    : entry.id || "(no ID)";
  const identity = entry.id
    ? document.createElement("button")
    : document.createElement("strong");
  if (entry.id) {
    identity.type = "button";
    identity.className = "text-button";
    identity.title = entry.current
      ? `Open ${entry.id} in the Editor`
      : `Open the current map in the Editor; ${entry.id} exists only in the comparison target`;
    identity.addEventListener("click", () =>
      onOpenEntry(section.currentSectionIndex, entry.current?.index, section.name, entry.id));
  }
  identity.textContent = identityText;
  const badge = document.createElement("span");
  badge.className = `compare-entry-status compare-entry-status--${entry.status}`;
  badge.textContent = getStatusLabel(entry.status);
  heading.append(identity, badge);
  card.append(heading);

  const columns = document.createElement("div");
  columns.className = "compare-columns";
  const currentColumn = createCompareColumn(currentFileName || "Current", entry.current);
  const targetColumn = createCompareColumn(targetFileName, entry.target);
  columns.append(currentColumn.element, targetColumn.element);
  card.append(columns);

  const fieldRows = entry.status === "changed"
    ? entry.changes.map((change) => ({
      column: change.column,
      currentValue: change.currentValue,
      targetValue: change.targetValue,
    }))
    : getAllFields(entry);
  for (const field of fieldRows) {
    const fieldRow = document.createElement("div");
    fieldRow.className = "compare-field-row";
    const label = document.createElement("strong");
    label.textContent = field.column;
    const currentValue = createDiffValue(
      field.currentValue,
      entry.status === "changed" || entry.status === "current-only",
      Boolean(entry.current),
      field.column,
      getSourceColor,
      onSourceClick,
    );
    const targetValue = createDiffValue(
      field.targetValue,
      entry.status === "changed" || entry.status === "target-only",
      Boolean(entry.target),
      field.column,
      getSourceColor,
      onSourceClick,
    );
    fieldRow.append(label, currentValue, targetValue);
    card.append(fieldRow);
  }
  return card;
}

function createCompareColumn(label, row) {
  const element = document.createElement("div");
  element.className = "compare-column-heading";
  const name = document.createElement("strong");
  name.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = row ? `Row ${row.index + 1}` : "Entry not present";
  element.append(name, detail);
  return { element };
}

function getAllFields(entry) {
  const current = new Map((entry.current?.values ?? []).map(({ column, value }) => [column, value]));
  const target = new Map((entry.target?.values ?? []).map(({ column, value }) => [column, value]));
  return [...new Set([...current.keys(), ...target.keys()])].map((column) => ({
    column,
    currentValue: current.has(column) ? current.get(column) : null,
    targetValue: target.has(column) ? target.get(column) : null,
  }));
}

function createDiffValue(value, isDifferent, entryPresent, column, getSourceColor, onSourceClick) {
  const element = document.createElement("div");
  element.className = `compare-diff-value${isDifferent ? " is-different" : ""}`;
  if (!entryPresent) {
    element.textContent = "(entry absent)";
  } else if (value === null) {
    element.textContent = "(column absent)";
  } else if (column === "Source" && value) {
    element.append(createSourceTag(value, getSourceColor(value), onSourceClick));
  } else {
    element.textContent = value || "(empty)";
  }
  return element;
}

function getStatusLabel(status) {
  if (status === "current-only") return "Extra in current";
  if (status === "target-only") return "Missing from current";
  return "Changed";
}

function createMessage(text) {
  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent = text;
  return message;
}
