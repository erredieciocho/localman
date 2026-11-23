import { createStatisticsGridComponent } from "../components/statistics-grid.js";

const ISSUE_TYPES = {
  spelling: "Spelling",
  "sentence-length": "Sentence length",
  terminology: "Terminology",
};

const ISSUE_TYPE_ORDER = ["spelling", "sentence-length", "terminology"];
const ISSUE_FILE_VERSION = 1;
const RESOLVED_ISSUES_STORAGE_KEY = "tcoaal-localisation-editor-qa-resolved";
const PAGE_SIZE = 10;

export function setupQA(root, {
  onError,
  onOpenSection,
  onOpenEntry,
  download,
  storage,
  notify = () => {},
  onChange = () => {},
} = {}) {
  const statusFilter = root.querySelector("#qa-status-filter");
  const search = root.querySelector("#qa-search");
  const issuesRoot = root.querySelector("#qa-issues");
  const count = root.querySelector("#qa-count");
  const importInput = root.querySelector("#qa-import-input");
  const importButton = root.querySelector("#qa-import-button");
  const exportButton = root.querySelector("#qa-export-button");
  const typeFilters = [...root.querySelectorAll("[data-qa-type-filter]")];
  const countGrid = createStatisticsGridComponent(count);
  let localisation = null;
  let currentIssues = [];
  let issueRecords = new Map();
  let resolvedIssueIds = loadResolvedIssueIds();
  let currentPage = 0;

  countGrid.render([[
    {
      id: "qa-unresolved-count",
      title: "Unresolved issues",
      value: "0",
      description: "Issues awaiting review",
    },
    {
      id: "qa-resolved-count",
      title: "Resolved issues",
      value: "0",
      description: "Issues marked as resolved",
    },
    {
      id: "qa-total-count",
      title: "Total issues",
      value: "0",
      description: "All tracked issues",
    },
  ]]);
  countGrid.element.querySelector("#qa-unresolved-count").classList.add("qa-count-unresolved");
  countGrid.element.querySelector("#qa-resolved-count").classList.add("qa-count-resolved");

  statusFilter.addEventListener("change", () => {
    currentPage = 0;
    render();
  });
  search.addEventListener("input", () => {
    currentPage = 0;
    render();
  });
  for (const typeFilter of typeFilters) {
    typeFilter.addEventListener("change", () => {
      currentPage = 0;
      render();
    });
  }
  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", importFile);
  exportButton.addEventListener("click", exportFile);
  for (const button of root.querySelectorAll("[data-qa-page]")) {
    button.addEventListener("click", () => {
      currentPage += button.dataset.qaPage === "next" ? 1 : -1;
      render();
    });
  }
  issuesRoot.addEventListener("click", (event) => {
    const resolveButton = event.target.closest("[data-qa-toggle]");
    if (resolveButton) {
      const record = issueRecords.get(resolveButton.dataset.qaToggle);
      if (!record) return;
      const nextResolved = new Set(resolvedIssueIds);
      if (record.resolved) nextResolved.delete(record.id);
      else nextResolved.add(record.id);
      if (!saveResolvedIssueIds(nextResolved)) return;
      record.resolved = !record.resolved;
      render({ preserveOpenSections: true });
      onChange();
      return;
    }

    const sectionButton = event.target.closest("[data-qa-section-toggle]");
    if (sectionButton) {
      const sectionIndex = Number(sectionButton.dataset.qaSectionToggle);
      const group = [...issueRecords.values()].filter((record) =>
        record.section.index === sectionIndex);
      const resolved = !group.every((record) => record.resolved);
      const nextResolved = new Set(resolvedIssueIds);
      for (const record of group) {
        if (resolved) nextResolved.add(record.id);
        else nextResolved.delete(record.id);
      }
      if (!saveResolvedIssueIds(nextResolved)) return;
      for (const record of group) record.resolved = resolved;
      render({ preserveOpenSections: true });
      onChange();
      return;
    }

    const entryButton = event.target.closest("[data-qa-entry]");
    if (entryButton) {
      const record = issueRecords.get(entryButton.dataset.qaEntry);
      if (record) onOpenEntry(record.section.index, record.row.index);
      return;
    }

    const sectionLink = event.target.closest("[data-qa-section]");
    if (sectionLink) onOpenSection(Number(sectionLink.dataset.qaSection));
  });

  function setIssues(issues, document) {
    localisation = document ?? null;
    currentIssues = issues ?? [];
    if (!localisation) {
      reset();
      return;
    }

    const nextRecords = new Map();
    for (const record of issueRecords.values()) {
      const entry = record.imported
        ? findEntry(localisation, record.sectionName, record.row.index, record.entryId)
        : null;
      if (entry) {
        nextRecords.set(record.id, { ...record, section: entry.section, row: entry.row });
      }
    }
    for (const issue of currentIssues) {
      const record = createRecord(issue, false);
      const previous = nextRecords.get(record.id) ?? issueRecords.get(record.id);
      nextRecords.set(record.id, {
        ...record,
        resolved: resolvedIssueIds.has(record.id),
        imported: previous?.imported ?? false,
      });
    }
    issueRecords = nextRecords;
    currentPage = 0;
    importButton.disabled = false;
    exportButton.disabled = false;
    render();
    onChange();
  }

  function reset() {
    localisation = null;
    currentIssues = [];
    issueRecords = new Map();
    importButton.disabled = true;
    exportButton.disabled = true;
    currentPage = 0;
    render();
    onChange();
  }

  async function importFile() {
    const [file] = importInput.files ?? [];
    if (!file) return;
    try {
      if (!localisation) throw new Error("Load a localisation file before importing QA issues.");
      const imported = parseIssueFile(await file.text(), localisation);
      const nextResolved = new Set(resolvedIssueIds);
      for (const record of imported) {
        if (record.resolved) nextResolved.add(record.id);
        else nextResolved.delete(record.id);
      }
      if (!saveResolvedIssueIds(nextResolved)) return;
      const nextRecords = new Map([...issueRecords].filter(([, record]) => !record.imported));
      for (const record of imported) {
        const previous = nextRecords.get(record.id);
        nextRecords.set(record.id, {
          ...record,
          resolved: record.resolved,
          imported: true,
        });
        if (previous) nextRecords.get(record.id).resolved = record.resolved;
      }
      issueRecords = nextRecords;
      setIssues(currentIssues, localisation);
      notify(`Imported ${imported.length.toLocaleString()} QA ${imported.length === 1 ? "issue" : "issues"}.`);
    } catch (error) {
      onError(error);
    } finally {
      importInput.value = "";
    }
  }

  function exportFile() {
    try {
      if (!localisation) throw new Error("Load a localisation file before exporting QA issues.");
      const data = {
        version: ISSUE_FILE_VERSION,
        issues: [...issueRecords.values()].map(({ sectionName, entryId, row, kind, message, resolved }) => ({
          section: sectionName,
          entryIndex: row.index,
          entryId,
          kind,
          message,
          resolved,
        })),
      };
      download(`${JSON.stringify(data, null, 2)}\n`, "tcoaal-qa-issues.json", "application/json");
      notify("QA issues exported.");
    } catch (error) {
      onError(error);
    }
  }

  function render({ preserveOpenSections = false } = {}) {
    const openSections = preserveOpenSections
      ? new Set([...issuesRoot.querySelectorAll(".qa-section[open] [data-qa-section-toggle]")]
        .map((button) => Number(button.dataset.qaSectionToggle)))
      : new Set();
    if (!localisation) {
      countGrid.setValue("qa-unresolved-count", "—");
      countGrid.setValue("qa-resolved-count", "—");
      countGrid.setValue("qa-total-count", "—");
      for (const kind of Object.keys(ISSUE_TYPES)) {
        root.querySelector(`[data-qa-type-count="${kind}"]`).textContent = "—";
      }
      issuesRoot.replaceChildren(createMessage("Load a localisation file to review issues."));
      root.querySelector("#qa-pagination").hidden = true;
      return;
    }

    const records = [...issueRecords.values()];
    const typeCounts = new Map(Object.keys(ISSUE_TYPES).map((kind) => [kind, 0]));
    for (const record of records) typeCounts.set(record.kind, (typeCounts.get(record.kind) ?? 0) + 1);
    for (const [kind, total] of typeCounts) {
      root.querySelector(`[data-qa-type-count="${kind}"]`).textContent = total.toLocaleString();
    }
    const unresolvedCount = records.filter(({ resolved }) => !resolved).length;
    const resolvedCount = records.length - unresolvedCount;
    countGrid.setValue("qa-unresolved-count", unresolvedCount.toLocaleString());
    countGrid.setValue("qa-resolved-count", resolvedCount.toLocaleString());
    countGrid.setValue("qa-total-count", records.length.toLocaleString());
    const query = search.value.trim().toLocaleLowerCase();
    const filter = statusFilter.value;
    const activeTypes = new Set(typeFilters
      .filter((typeFilter) => typeFilter.checked)
      .map((typeFilter) => typeFilter.dataset.qaTypeFilter));
    const visible = records.filter((record) => {
      if (!activeTypes.has(record.kind)) return false;
      if (filter === "resolved" && !record.resolved) return false;
      if (filter === "unresolved" && record.resolved) return false;
      if (!query) return true;
      return [
        record.sectionName,
        record.entryId,
        record.kind,
        ISSUE_TYPES[record.kind],
        record.message,
        String(record.row.sourceLine ?? record.row.index + 1),
        ...record.row.fields,
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    });
    const groups = new Map();
    for (const record of visible) {
      const recordsForSection = groups.get(record.section.index) ?? [];
      recordsForSection.push(record);
      groups.set(record.section.index, recordsForSection);
    }

    const sections = [...groups.entries()].sort(([left], [right]) => left - right);
    const pageCount = Math.max(1, Math.ceil(sections.length / PAGE_SIZE));
    currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));
    const pageSections = sections.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const pagination = root.querySelector("#qa-pagination");
    pagination.hidden = sections.length <= PAGE_SIZE;
    root.querySelector("#qa-page-status").textContent = `Page ${currentPage + 1} of ${pageCount}`;
    root.querySelector('[data-qa-page="previous"]').disabled = currentPage === 0;
    root.querySelector('[data-qa-page="next"]').disabled = currentPage >= pageCount - 1;
    issuesRoot.replaceChildren();
    for (const [sectionIndex, group] of pageSections) {
      group.sort(compareIssues);
      const section = localisation.sections[sectionIndex];
      const details = root.ownerDocument.createElement("details");
      details.className = "qa-section";
      details.open = openSections.has(sectionIndex);
      const summary = root.ownerDocument.createElement("summary");
      summary.className = "qa-section-summary";
      const title = root.ownerDocument.createElement("span");
      title.className = "qa-section-name";
      title.textContent = section.name || `Section ${sectionIndex + 1}`;
      const issueCount = root.ownerDocument.createElement("span");
      issueCount.className = "qa-section-count";
      const percentage = records.length ? group.length / records.length * 100 : 0;
      issueCount.textContent =
        `${group.length} ${group.length === 1 ? "issue" : "issues"} · ${percentage.toFixed(1)}% of all issues`;
      summary.append(title, issueCount);

      const sectionAction = root.ownerDocument.createElement("button");
      sectionAction.type = "button";
      sectionAction.className = "button button-primary qa-section-action";
      sectionAction.dataset.qaSectionToggle = String(sectionIndex);
      const sectionRecords = [...issueRecords.values()].filter((record) =>
        record.section.index === sectionIndex);
      const allResolved = sectionRecords.length > 0 && sectionRecords.every(({ resolved }) => resolved);
      const sectionActionLabel = allResolved ? "Mark all unresolved" : "Mark all resolved";
      sectionAction.textContent = allResolved ? "×" : "✓";
      sectionAction.title = `${sectionActionLabel} in ${title.textContent}`;
      sectionAction.setAttribute("aria-label", sectionAction.title);
      summary.append(sectionAction);

      const list = root.ownerDocument.createElement("ul");
      list.className = "qa-issue-list";
      for (const record of group) list.append(createIssueItem(record));
      details.append(summary, list);
      issuesRoot.append(details);
    }

    if (!visible.length) {
      issuesRoot.append(createMessage(records.length
        ? "No issues match the current filters."
        : "No configured validation issues were found."));
    }
  }

  function createIssueItem(record) {
    const item = root.ownerDocument.createElement("li");
    item.className = "qa-issue-card";
    item.classList.toggle("is-resolved", record.resolved);
    const issueType = root.ownerDocument.createElement("span");
    issueType.className = "qa-issue-type";
    issueType.textContent = ISSUE_TYPES[record.kind] ?? record.kind;
    const entryHeading = root.ownerDocument.createElement("h3");
    entryHeading.className = "qa-issue-entry-title";
    const entry = root.ownerDocument.createElement("button");
    entry.type = "button";
    entry.className = "text-button qa-entry-link";
    entry.dataset.qaEntry = record.id;
    const lineNumber = Number.isInteger(record.row.sourceLine)
      ? `Line ${record.row.sourceLine}`
      : `Entry ${record.row.index + 1}`;
    entry.textContent = record.entryId || lineNumber;
    entry.title = `Open ${record.entryId || lineNumber} in the Editor`;
    entryHeading.append(entry);
    const translation = root.ownerDocument.createElement("p");
    translation.className = "qa-issue-translation";
    translation.textContent = record.translation || "(No translation text)";
    const message = root.ownerDocument.createElement("p");
    message.className = "qa-issue-message";
    message.textContent = record.message;
    const action = root.ownerDocument.createElement("button");
    action.type = "button";
    action.className = "button button-primary qa-issue-action";
    action.dataset.qaToggle = record.id;
    action.textContent = record.resolved ? "×" : "✓";
    action.title = record.resolved ? "Mark unresolved" : "Mark resolved";
    action.setAttribute("aria-label", action.title);
    action.setAttribute("aria-pressed", String(record.resolved));
    item.append(issueType, entryHeading, translation, message, action);
    return item;
  }

  function getUnresolvedIssueCounts() {
    const counts = new Map();
    for (const record of issueRecords.values()) {
      if (record.resolved) continue;
      counts.set(record.section.index, (counts.get(record.section.index) ?? 0) + 1);
    }
    return counts;
  }

  function loadResolvedIssueIds() {
    try {
      if (!storage) throw new Error("Browser storage is unavailable.");
      const saved = storage.getItem(RESOLVED_ISSUES_STORAGE_KEY);
      if (saved === null) return new Set();
      const data = JSON.parse(saved);
      if (!data || data.version !== 1 || !Array.isArray(data.ids)
        || data.ids.some((id) => typeof id !== "string")) {
        throw new TypeError("Saved QA resolutions have an invalid format.");
      }
      return new Set(data.ids);
    } catch (error) {
      onError(new Error(`Saved QA resolutions could not be loaded: ${error.message}`));
      return new Set();
    }
  }

  function saveResolvedIssueIds(nextIds) {
    try {
      if (!storage) throw new Error("Browser storage is unavailable.");
      storage.setItem(RESOLVED_ISSUES_STORAGE_KEY, JSON.stringify({
        version: 1,
        ids: [...nextIds],
      }));
      resolvedIssueIds = nextIds;
      return true;
    } catch (error) {
      onError(new Error(`QA resolution could not be saved: ${error.message}`));
      return false;
    }
  }

  function createMessage(text) {
    const message = root.ownerDocument.createElement("p");
    message.className = "empty-state qa-empty-state";
    message.textContent = text;
    return message;
  }

  render();
  function getUnresolvedIssues() {
    return currentIssues.filter((issue) => {
      const record = issueRecords.get(createRecord(issue, false).id);
      return record && !record.resolved;
    });
  }

  function excludeSpellingWord(word) {
    const excludedWord = word.trim().toLocaleLowerCase();
    const matches = (issue) => issue.kind === "spelling"
      && issue.word?.trim().toLocaleLowerCase() === excludedWord;
    currentIssues = currentIssues.filter((issue) => !matches(issue));
    let removed = false;
    for (const [id, record] of issueRecords) {
      if (!record.imported && matches(record)) {
        issueRecords.delete(id);
        removed = true;
      }
    }
    if (!removed) return false;
    if (!root.querySelector("#panel-qa").hidden) render();
    onChange({ updateEditor: false });
    return true;
  }

  function openIssue(sectionIndex, rowIndex) {
    statusFilter.value = "unresolved";
    const targetRecord = [...issueRecords.values()].find((record) =>
      !record.resolved && record.section.index === sectionIndex && record.row.index === rowIndex);
    if (!targetRecord) return false;
    search.value = targetRecord.entryId;
    const sections = [...new Set([...issueRecords.values()]
      .filter((record) => !record.resolved)
      .map((record) => record.section.index))]
      .sort((left, right) => left - right);
    const sectionPosition = sections.indexOf(sectionIndex);
    if (sectionPosition < 0) return false;

    currentPage = Math.floor(sectionPosition / PAGE_SIZE);
    render();
    const details = [...issuesRoot.querySelectorAll(".qa-section")]
      .find((group) => Number(group.querySelector("[data-qa-section-toggle]")?.dataset.qaSectionToggle)
        === sectionIndex);
    if (!details) return false;
    details.open = true;
    details.scrollIntoView({ block: "nearest" });
    return true;
  }

  return {
    setIssues,
    reset,
    getUnresolvedIssueCounts,
    getUnresolvedIssues,
    openIssue,
    excludeSpellingWord,
  };
}

function createRecord(issue, imported) {
  const sectionName = issue.section.name ?? "";
  const entryId = issue.row.key ?? "";
  const id = JSON.stringify([sectionName, issue.row.index, entryId, issue.kind, issue.message]);
  return {
    id,
    section: issue.section,
    sectionName,
    entryId,
    row: issue.row,
    kind: issue.kind,
    word: issue.word,
    message: issue.message,
    translation: issue.row.fields[issue.section.columns.indexOf("Translation")] ?? "",
    resolved: false,
    imported,
  };
}

function compareIssues(left, right) {
  const kindOrder = ISSUE_TYPE_ORDER.indexOf(left.kind) - ISSUE_TYPE_ORDER.indexOf(right.kind);
  if (kindOrder) return kindOrder;
  const leftLine = Number.isInteger(left.row.sourceLine) ? left.row.sourceLine : left.row.index + 1;
  const rightLine = Number.isInteger(right.row.sourceLine) ? right.row.sourceLine : right.row.index + 1;
  return leftLine - rightLine || left.row.index - right.row.index;
}

function parseIssueFile(text, localisation) {
  const data = JSON.parse(text);
  if (!data || data.version !== ISSUE_FILE_VERSION || !Array.isArray(data.issues)) {
    throw new TypeError("QA issue files must have version 1 and an issues array.");
  }

  const records = [];
  for (const issue of data.issues) {
    if (!issue || typeof issue.section !== "string"
      || !Number.isInteger(issue.entryIndex) || issue.entryIndex < 0
      || typeof issue.entryId !== "string"
      || !Object.hasOwn(ISSUE_TYPES, issue.kind)
      || typeof issue.message !== "string" || !issue.message.trim()
      || typeof issue.resolved !== "boolean") {
      throw new TypeError("Each QA issue must include its section, entry reference, type, message and resolution state.");
    }
    const entry = findEntry(localisation, issue.section, issue.entryIndex, issue.entryId);
    if (!entry) continue;
    records.push(createRecord({
      section: entry.section,
      row: entry.row,
      kind: issue.kind,
      message: issue.message,
    }, true));
    records[records.length - 1].resolved = issue.resolved;
  }
  return records;
}

function findEntry(localisation, sectionName, entryIndex, entryId) {
  const section = localisation.sections.find((candidate) => candidate.name === sectionName);
  const row = section?.rows[entryIndex];
  if (!row || row.key !== entryId) return null;
  return { section, row };
}
