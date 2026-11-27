import { extractWords } from "../../core/glossary/index.js";
import {
  createTranslationWordUsageIndex,
  getSectionTranslationStatistics,
  getTranslationStatistics,
  updateTranslationWordUsageIndex,
} from "../../core/statistics/index.js";
import { isMapSection } from "../../core/document/index.js";
import { getSpellingResult, isWordExcluded } from "../../core/validation/index.js";
import {
  createActionCell as linkCell,
  createMessageRow as messageRow,
  createTextCell as cell,
} from "../components/table-cells.js";
import { createModalComponent } from "../components/modal.js";
import { createStatisticsGridComponent } from "../components/statistics-grid.js";
import { createTableComponent } from "../components/table.js";
import { createTreemapComponent } from "../components/treemap.js";
import { createSourceTag } from "../utils/source-colors.js";

const SOURCE_DETAILS_PAGE_SIZE = 25;
const WORD_TREEMAP_PAGE_SIZE = 50;
const SOURCE_TAG_ROWS = 3;
const SOURCE_TAG_COLUMNS = Object.freeze({ wide: 5, narrow: 3 });
const TARGET_LANGUAGE_NAMES = Object.freeze({
  es: "Spanish",
  ca: "Catalan",
  fr: "French",
  de: "German",
  pt: "Portuguese (Portugal)",
  pl: "Polish",
  ru: "Russian",
  ko: "Korean",
});

export function getProgressTone(percentage) {
  return percentage < 25 ? "low" : percentage < 75 ? "medium" : "high";
}

export function setupDashboard(root, {
  onSection,
  onMap = onSection,
  onOccurrences,
  onAddWordExclusion = () => {},
  onLengthChange,
  onProgressFilterChange = () => {},
  getSourceColor = () => "",
  getSourceTranslation = () => "",
  getSourceTerm = () => null,
  onOpenTerm = () => {},
}) {
  let progressSort = null;
  let progressDirection = 1;
  let currentDocument = null;
  let currentPreferences = null;
  let currentDictionary = null;
  let currentDictionaryAvailable = false;
  let spellcheckFilter = root.querySelector("#word-spellcheck-filter").value || "not-ok";
  let currentFileName = "";
  let currentIssueCounts = new Map();
  let mapDistributionMode = "complexity";
  let sourceTagPage = 0;
  let wordPage = 0;
  const sourceDetailsPages = { maps: 0, entries: 0 };
  const sourceTagLayout = root.ownerDocument.defaultView.matchMedia("(max-width: 600px)");
  let sourceTagPageSize = getSourceTagPageSize(sourceTagLayout.matches);
  const sourceDetailsModal = createModalComponent(root.querySelector("#source-details-dialog"));
  const terminologyButton = root.querySelector("#source-details-terminology-button");
  sourceDetailsModal.header.insertBefore(terminologyButton, sourceDetailsModal.closeButton);
  const mapDetailsModal = createModalComponent(root.querySelector("#map-details-dialog"));
  const fileMetadataGrid = createStatisticsGridComponent(root.querySelector("#dashboard-file-meta"));
  const translationStatisticsGrid = createStatisticsGridComponent(
    root.querySelector("#dashboard-translation-statistics"),
  );
  fileMetadataGrid.render([
    [
      { id: "dashboard-file-name", title: "File", value: "—", description: "Loaded localisation file" },
      { id: "dashboard-version", title: "Version", value: "—", description: "Localisation format version" },
      { id: "dashboard-file-language", title: "File language", value: "—", description: "Language declared by the file" },
      { id: "dashboard-file-encoding", title: "Encoding", value: "—", description: "Text encoding used by the file" },
    ],
    [{ id: "dashboard-credits", title: "Credits", value: "—", description: "Credits supplied by the localisation file" }],
  ]);
  translationStatisticsGrid.render([
    [
      { id: "stat-translated", title: "Translated", value: "—", description: "Entries with a translation" },
      { id: "stat-untranslated", title: "Remaining", value: "—", description: "Entries awaiting translation" },
      { id: "stat-untranslatable", title: "Untranslatable", value: "—", description: "Entries excluded from translation progress" },
      { id: "stat-percentage", title: "Progress", value: "—", description: "Completion across translatable entries" },
    ],
    [
      { id: "dashboard-section-count", title: "Total sections", value: "—", description: "Including unnamed sections" },
      { id: "dashboard-map-count", title: "Total maps", value: "—", description: "Recognised game map sections" },
      { id: "dashboard-entry-count", title: "Total entries", value: "—", description: "Across all maps" },
      { id: "dashboard-unique-word-count", title: "Unique words", value: "—", description: "English vs Spanish" },
      { id: "dashboard-source-count", title: "Source tags", value: "—", description: "Distinct tags across maps" },
    ],
  ]);
  const progressTable = createTableComponent(root.querySelector("#dashboard-rows").closest("table"));
  const wordsTreemap = createTreemapComponent(root.querySelector("#word-usage-grid"), {
    sortButton: root.querySelector("#word-usage-sort-toggle"),
    sortLabel: "word frequency",
  });
  const wordSortOptions = {
    getName: ({ word }) => word,
    getValue: ({ frequency }) => frequency,
  };
  const mapTreemap = createTreemapComponent(root.querySelector("#map-distribution-grid"), {
    sortButton: root.querySelector("#map-sort-toggle"),
    sortLabel: "map",
  });
  const sourceTreemap = createTreemapComponent(root.querySelector("#source-distribution-grid"), {
    sortButton: root.querySelector("#source-tag-sort-toggle"),
    sortLabel: "source tag occurrence",
    renderItems: renderSourceTagTreemap,
  });
  const sourceDetailsMapTable = createTableComponent(root.querySelector("#source-details-map-rows").closest("table"));
  const sourceDetailsEntryTable = createTableComponent(root.querySelector("#source-details-entry-rows").closest("table"));
  const sourceDetailsOriginalHeader = root.querySelector("#source-details-entry-original-header");
  const mapDetailsTable = createTableComponent(root.querySelector("#map-details-results").closest("table"));
  const readOnlyDisabledComponents = [
    root.querySelector("#dashboard-translation-statistics"),
    root.querySelector(".map-distribution-panel"),
    root.querySelector(".section-progress-panel"),
    root.querySelector("#word-usage-grid").closest(".workspace"),
  ];
  let wordUsageIndex = null;
  let sourceWords = new Set();
  let sectionWordCounts = new Map();
  let progressRecords = [];
  let visibleWords = [];
  let sourceStatistics = new Map();
  let progressDirty = true;
  let wordsDirty = true;
  let sectionStatisticsDirty = true;
  let sourceStatisticsDirty = true;

  root.querySelector("#dashboard-incomplete-only").addEventListener("change", (event) => {
    onProgressFilterChange({ dashboardIncompleteOnly: event.currentTarget.checked });
  });
  const progressThreshold = root.querySelector("#dashboard-progress-threshold");
  progressThreshold.addEventListener("input", () => progressThreshold.setCustomValidity(""));
  progressThreshold.addEventListener("change", () => {
    const threshold = progressThreshold.valueAsNumber;
    const valid = Number.isInteger(threshold) && threshold >= 0 && threshold <= 100;
    progressThreshold.setCustomValidity(valid ? "" : "Enter a whole-number threshold from 0 to 100.");
    if (valid) onProgressFilterChange({ dashboardProgressThreshold: threshold });
    else progressThreshold.reportValidity();
  });

  for (const input of root.querySelectorAll(
    "#word-min-length, #word-max-length, #word-min-occurrences, #word-max-occurrences",
  )) {
    input.addEventListener("input", () => onLengthChange());
  }
  root.querySelector("#word-spellcheck-filter").addEventListener("change", (event) => {
    spellcheckFilter = event.currentTarget.value;
    wordPage = 0;
    wordsDirty = true;
    renderWords();
  });
  for (const button of root.querySelectorAll("[data-word-page]")) {
    button.addEventListener("click", () => {
      wordPage += button.dataset.wordPage === "next" ? 1 : -1;
      renderWordWindow();
    });
  }
  for (const button of root.querySelectorAll("[data-progress-sort]")) {
    button.addEventListener("click", () => {
      const column = button.dataset.progressSort;
      progressDirection = progressSort === column ? -progressDirection : column === "section" ? 1 : -1;
      progressSort = column;
      progressDirty = true;
      renderProgress();
    });
  }
  for (const button of root.querySelectorAll("[data-source-page]")) {
    button.addEventListener("click", () => {
      sourceTagPage += button.dataset.sourcePage === "next" ? 1 : -1;
      renderSourceStatistics();
    });
  }
  for (const button of root.querySelectorAll("[data-source-detail-page]")) {
    button.addEventListener("click", () => {
      const [list, action] = button.dataset.sourceDetailPage.split("-");
      const sourceRecord = sourceStatistics.get(root.querySelector("#source-details-original").textContent);
      if (!sourceRecord) return;
      const records = list === "maps" ? [...sourceRecord.sections] : sourceRecord.entries;
      const pageCount = Math.ceil(records.length / SOURCE_DETAILS_PAGE_SIZE);
      sourceDetailsPages[list] += action === "next" ? 1 : -1;
      sourceDetailsPages[list] = Math.max(0, Math.min(sourceDetailsPages[list], pageCount - 1));
      renderSourceDetails(list);
    });
  }
  sourceTagLayout.addEventListener("change", (event) => {
    sourceTagPageSize = getSourceTagPageSize(event.matches);
    sourceTagPage = 0;
    renderSourceStatistics();
  });
  for (const button of root.querySelectorAll("[data-map-ranking]")) {
    button.addEventListener("click", () => {
      mapDistributionMode = button.dataset.mapRanking;
      for (const modeButton of root.querySelectorAll("[data-map-ranking]")) {
        modeButton.setAttribute("aria-pressed", String(modeButton === button));
      }
      renderMapDistribution();
    });
  }
  function render(localisation, preferences, {
    dictionary = null,
    dictionaryAvailable = false,
    fileName = "",
    issueCounts = new Map(),
  } = {}) {
    const readOnly = Boolean(localisation?.readonly);
    setReadOnly(readOnly);
    const documentChanged = currentDocument !== localisation;
    const fileNameChanged = currentFileName !== fileName;
    const spellcheckChanged = currentPreferences?.dictionaryValidation !== preferences.dictionaryValidation
      || currentPreferences?.targetLanguage !== preferences.targetLanguage
      || currentDictionary !== dictionary
      || currentDictionaryAvailable !== dictionaryAvailable
      || currentPreferences?.dictionaryExclusions?.join("\u0000")
        !== preferences.dictionaryExclusions?.join("\u0000");
    const wordFiltersChanged = currentPreferences?.minimumWordLength !== preferences.minimumWordLength
      || currentPreferences?.dashboardMaximumWordLength !== preferences.dashboardMaximumWordLength
      || currentPreferences?.minimumWordOccurrences !== preferences.minimumWordOccurrences
      || currentPreferences?.dashboardMaximumWordOccurrences !== preferences.dashboardMaximumWordOccurrences;
    const progressFiltersChanged = currentPreferences?.dashboardIncompleteOnly !== preferences.dashboardIncompleteOnly
      || currentPreferences?.dashboardProgressThreshold !== preferences.dashboardProgressThreshold;
    currentDocument = localisation;
    sourceDetailsOriginalHeader.hidden = localisation?.formatId === "txt";
    currentFileName = fileName;
    currentIssueCounts = issueCounts;
    currentPreferences = preferences;
    currentDictionary = dictionary;
    currentDictionaryAvailable = dictionaryAvailable;
    if (documentChanged || fileNameChanged) renderFileMetadata(localisation, fileName);
    const min = root.querySelector("#word-min-length");
    const max = root.querySelector("#word-max-length");
    const minOccurrences = root.querySelector("#word-min-occurrences");
    const maxOccurrences = root.querySelector("#word-max-occurrences");
    if (document.activeElement !== min) min.value = String(preferences.minimumWordLength);
    if (document.activeElement !== max) max.value = preferences.dashboardMaximumWordLength ?? "";
    if (document.activeElement !== minOccurrences) {
      minOccurrences.value = String(preferences.minimumWordOccurrences);
    }
    if (document.activeElement !== maxOccurrences) {
      maxOccurrences.value = preferences.dashboardMaximumWordOccurrences ?? "";
    }
    if (documentChanged) {
      wordUsageIndex = localisation && !readOnly ? createTranslationWordUsageIndex(localisation) : null;
      sourceWords = localisation && !readOnly ? buildSourceWordSet(localisation) : new Set();
      sectionWordCounts = localisation && !readOnly ? buildSectionWordCounts(localisation) : new Map();
      progressRecords = localisation && !readOnly ? buildProgressRecords(localisation) : [];
      sourceTagPage = 0;
      progressDirty = true;
      wordsDirty = true;
      sectionStatisticsDirty = true;
      sourceStatisticsDirty = true;
      if (localisation && !readOnly) renderStatistics(localisation);
      else if (!localisation) renderEmptyStatistics();
    }
    if (progressFiltersChanged) progressDirty = true;
    const incompleteOnly = root.querySelector("#dashboard-incomplete-only");
    const progressThresholdInput = root.querySelector("#dashboard-progress-threshold");
    if (document.activeElement !== incompleteOnly) {
      incompleteOnly.checked = preferences.dashboardIncompleteOnly;
    }
    if (document.activeElement !== progressThresholdInput) {
      progressThresholdInput.value = String(preferences.dashboardProgressThreshold);
      progressThresholdInput.setCustomValidity("");
    }
    if (wordFiltersChanged || spellcheckChanged) {
      wordsDirty = true;
    }
    if (readOnly) {
      progressDirty = true;
      sectionStatisticsDirty = true;
      sourceStatisticsDirty = true;
      renderReadOnlyPlaceholders();
      return;
    }
    renderProgress();
    renderWords();
    renderSectionStatistics();
    renderSourceStatistics();
    renderSummaryMetrics();
    renderMapDistribution();
  }

  function setReadOnly(readOnly) {
    for (const component of readOnlyDisabledComponents) {
      component.inert = readOnly;
      component.setAttribute("aria-disabled", String(readOnly));
      component.classList.toggle("dashboard-readonly-disabled", readOnly);
      component.title = readOnly ? "Disabled while this localisation file is read-only." : "";
    }
    if (readOnly) {
      for (const id of ["#source-details-dialog", "#map-details-dialog"]) {
        const dialog = root.querySelector(id);
        if (dialog.open) dialog.close();
      }
    }
  }

  function updateRow(section, row, previousTranslation, nextTranslation, previousStatus, nextStatus, localisation) {
    updateTranslationWordUsageIndex(wordUsageIndex, section, row, previousTranslation, nextTranslation);
    if (previousTranslation !== nextTranslation) {
      wordsDirty = true;
      updateSectionWordCounts(sectionWordCounts, section, previousTranslation, nextTranslation);
      sectionStatisticsDirty = true;
      renderSectionStatistics();
      renderSummaryMetrics();
    }
    const progress = progressRecords.find((record) => record.section === section);
    if (progress && currentDocument?.formatId === "txt" && previousTranslation !== nextTranslation) {
      const statistics = getSectionTranslationStatistics(currentDocument, section);
      progress.translated = statistics.translated;
      progress.remaining = statistics.untranslated;
      progress.total = statistics.total;
      progress.progress = statistics.total
        ? Math.min(100, Math.round(statistics.translated / statistics.total * 1000) / 10)
        : 0;
      progressDirty = true;
    } else if (progress && previousStatus !== nextStatus) {
      if (previousStatus === "translated") progress.translated -= 1;
      if (previousStatus === "untranslated") progress.remaining -= 1;
      if (nextStatus === "translated") progress.translated += 1;
      if (nextStatus === "untranslated") progress.remaining += 1;
      progress.total = progress.translated + progress.remaining;
      progress.progress = progress.total ? Math.round(progress.translated / progress.total * 1000) / 10 : 0;
      progressDirty = true;
    }
    if (localisation) renderStatistics(localisation);
  }

  function renderFileMetadata(localisation, fileName) {
    fileMetadataGrid.setValue("dashboard-file-name", fileName || "—");
    fileMetadataGrid.setValue("dashboard-version", localisation?.version.text ?? "—");
    if (!localisation) {
      fileMetadataGrid.setValue("dashboard-file-language", "—");
      fileMetadataGrid.setValue("dashboard-file-encoding", "—");
      fileMetadataGrid.setValue("dashboard-credits", "—");
      return;
    }

    const languages = new Set();
    const credits = new Set();
    for (const section of localisation.sections) {
      const languageIndex = section.columns.indexOf("Language");
      if (languageIndex >= 0) {
        for (const row of section.rows) {
          const value = row.fields[languageIndex]?.trim();
          if (value) languages.add(value);
        }
      }
      for (const [index, column] of section.columns.entries()) {
        if (!/^credits?(?:\s+\d+)?$/iu.test(column)) continue;
        for (const row of section.rows) {
          const value = row.fields[index]?.trim();
          if (value) credits.add(value);
        }
      }
    }
    fileMetadataGrid.setValue("dashboard-file-language", languages.size
      ? [...languages].join(", ")
      : "Not specified");
    fileMetadataGrid.setValue("dashboard-file-encoding",
      formatEncoding(localisation.encoding, localisation.hasByteOrderMark));
    fileMetadataGrid.setValue("dashboard-credits", credits.size
      ? [...credits].join(" · ")
      : "Not provided");
  }

  function renderStatistics(localisation) {
    const overall = getTranslationStatistics(localisation);
    for (const [id, value] of Object.entries({
      translated: overall.translated, untranslated: overall.untranslated,
      untranslatable: overall.untranslatable, percentage: `${overall.percentage}%`,
    })) translationStatisticsGrid.setValue(`stat-${id}`, value);
    root.querySelector("#stat-percentage").dataset.progressTone = getProgressTone(overall.percentage);
  }

  function renderEmptyStatistics() {
    for (const id of ["translated", "untranslated", "untranslatable", "percentage"]) {
      translationStatisticsGrid.setValue(`stat-${id}`, "—");
      if (id === "percentage") delete root.querySelector("#stat-percentage").dataset.progressTone;
    }
    for (const id of ["section-count", "map-count", "entry-count", "unique-word-count", "source-count"]) {
      translationStatisticsGrid.setValue(`dashboard-${id}`, "—");
    }
    renderMapDistribution();
  }

  function renderReadOnlyPlaceholders() {
    for (const id of [
      "stat-translated",
      "stat-untranslated",
      "stat-untranslatable",
      "stat-percentage",
      "dashboard-section-count",
      "dashboard-map-count",
      "dashboard-entry-count",
      "dashboard-unique-word-count",
      "dashboard-source-count",
    ]) {
      translationStatisticsGrid.setValue(id, "—");
    }
    delete root.querySelector("#stat-percentage").dataset.progressTone;
    root.querySelector("#dashboard-unique-word-count")
      .closest(".statistics-grid-cell")
      .querySelector(".statistics-grid-description").textContent = "Not available for read-only files.";

    const unavailableMessage = "Not available for read-only files.";
    wordUsageIndex = null;
    visibleWords = [];
    wordPage = 0;
    root.querySelector("#word-usage-unique-count").textContent = "—";
    root.querySelector("#word-usage-occurrence-count").textContent = "—";
    root.querySelector("#word-filter-status").textContent = "";
    wordsTreemap.render({
      items: [],
      ...wordSortOptions,
      emptyMessage: unavailableMessage,
      label: "Target-language word usage",
    });
    root.querySelector("#word-usage-pagination").hidden = true;
    root.querySelector("#dashboard-section-progress-summary").textContent = unavailableMessage;
    progressTable.rows.replaceChildren(messageRow(4, unavailableMessage));
    root.querySelector("#map-distribution-title").textContent = "Map distribution";
    mapTreemap.render({
      items: [],
      getName: ({ section }) => section.name,
      getValue: () => 0,
      emptyMessage: unavailableMessage,
      label: "Map distribution",
    });
    root.querySelector("#source-tag-pagination").hidden = true;
    sourceTreemap.render({
      items: [],
      getName: ({ source }) => source,
      getValue: () => 0,
      emptyMessage: unavailableMessage,
      label: "Source tag distribution",
    });
    sourceStatistics = new Map();
  }

  function buildProgressRecords(localisation) {
    const sections = [];
    for (const section of localisation.sections) {
      if (!section.name || !section.columns.includes("Translation")) continue;
      const statistics = getSectionTranslationStatistics(localisation, section);
      const progress = statistics.total
        ? Math.min(100, Math.round(statistics.translated / statistics.total * 1000) / 10)
        : 0;
      sections.push({
        section,
        translated: statistics.translated,
        total: statistics.total,
        remaining: statistics.untranslated,
        progress,
      });
    }
    return sections;
  }

  function renderProgress() {
    if (!progressDirty) return;
    progressDirty = false;
    const body = progressTable.rows;
    body.replaceChildren();
    for (const header of root.querySelectorAll("[data-progress-header]")) {
      header.removeAttribute("aria-sort");
      if (header.dataset.progressHeader === progressSort) {
        header.setAttribute("aria-sort", progressDirection === 1 ? "ascending" : "descending");
      }
    }
    if (!currentDocument) {
      root.querySelector("#dashboard-section-progress-summary").textContent =
        "Load a file to view section progress.";
      body.append(messageRow(4, "Load a file to view progress."));
      return;
    }
    const threshold = currentPreferences.dashboardProgressThreshold;
    const incompleteSections = progressRecords.filter(({ progress }) => progress < threshold);
    const summary = root.querySelector("#dashboard-section-progress-summary");
    const total = document.createElement("strong");
    total.textContent = progressRecords.length.toLocaleString();
    const incomplete = document.createElement("strong");
    incomplete.textContent = incompleteSections.length.toLocaleString();
    summary.replaceChildren(
      root.ownerDocument.createTextNode("Total sections: "),
      total,
      root.ownerDocument.createTextNode(` · Incomplete (<${threshold}%): `),
      incomplete,
    );
    const sections = currentPreferences.dashboardIncompleteOnly
      ? incompleteSections
      : [...progressRecords];
    if (progressSort) sections.sort((a, b) => progressDirection * (progressSort === "section"
      ? a.section.name.localeCompare(b.section.name)
      : a[progressSort] - b[progressSort]) || a.section.index - b.section.index);
    for (const { section, translated, total, remaining, progress } of sections) {
      const tr = document.createElement("tr");
      const untranslatedRows = remaining > 0
        ? section.rows.filter((row) => currentDocument.formatId === "txt"
          ? !(row.fields[section.columns.indexOf("Translation")] ?? "").trim()
          : currentDocument.getRowStatus(section, row) === "untranslated")
        : [];
      const remainingCell = remaining > 0
        ? linkCell(String(remaining), () => onOccurrences(
          `${section.name}: ${remaining} untranslated ${remaining === 1 ? "entry" : "entries"}`,
          untranslatedRows.map((row) => ({
            section,
            row,
            rows: [row],
            text: row.fields[section.columns.indexOf("English")]
              || row.fields[section.columns.indexOf("Source")]
              || row.key,
          })),
        ))
        : cell(String(remaining));
      tr.append(linkCell(section.name, () => onMap(section.index)),
        cell(`${translated}/${total}`),
        remainingCell,
        progressCell(section.name, progress));
      body.append(tr);
    }
    if (!body.children.length) {
      body.append(messageRow(4, currentPreferences.dashboardIncompleteOnly
        ? `No sections are below ${threshold}% completion.`
        : "No translatable sections were found."));
    }
  }

  function renderSectionStatistics() {
    if (!sectionStatisticsDirty) return;
    sectionStatisticsDirty = false;
    renderMapDistribution();
  }

  function renderSourceStatistics() {
    if (sourceStatisticsDirty) {
      sourceStatistics = currentDocument ? buildSourceStatistics(currentDocument) : new Map();
      sourceStatisticsDirty = false;
    }
    const pagination = root.querySelector("#source-tag-pagination");
    if (!currentDocument) {
      pagination.hidden = true;
      sourceTreemap.render({
        items: [],
        getName: ({ source }) => source,
        getValue: ({ record }) => record.total,
        emptyMessage: "Load a file to compare Source tag usage.",
        label: "Source tags",
      });
      return;
    }
    const sortOptions = {
      getName: ({ source }) => source,
      getValue: ({ record }) => record.total,
    };
    const ranked = sourceTreemap.sortItems(
      [...sourceStatistics].map(([source, record]) => ({ source, record })),
      sortOptions,
    );
    if (!ranked.length) {
      pagination.hidden = true;
      sourceTreemap.render({
        items: [],
        ...sortOptions,
        emptyMessage: "No Source tags were found in named maps.",
        label: "Source tags",
      });
      return;
    }
    const pageCount = Math.ceil(ranked.length / sourceTagPageSize);
    sourceTagPage = Math.min(sourceTagPage, pageCount - 1);
    pagination.hidden = pageCount <= 1;
    root.querySelector("#source-tag-page-status").textContent =
      `Page ${sourceTagPage + 1} of ${pageCount}`;
    root.querySelector('[data-source-page="previous"]').disabled = sourceTagPage === 0;
    root.querySelector('[data-source-page="next"]').disabled = sourceTagPage === pageCount - 1;
    const pageItems = ranked.slice(
      sourceTagPage * sourceTagPageSize,
      (sourceTagPage + 1) * sourceTagPageSize,
    ).map((item) => ({ ...item, color: getSourceColor(item.source) }));
    sourceTreemap.render({
      items: pageItems,
      ...sortOptions,
      getDisplayValue: ({ record }) =>
        `${record.total.toLocaleString()} ${record.total === 1 ? "occurrence" : "occurrences"}`,
      getItemTitle: ({ source }) => `Show details for Source tag "${source}"`,
      onItem: ({ source }) => showSourceDetails(source),
      onSortChange: renderSourceStatistics,
      emptyMessage: "No Source tags were found in named maps.",
      label: `${ranked.length} Source tags, page ${sourceTagPage + 1} of ${pageCount}`,
      maximumItems: sourceTagPageSize,
    });
  }

  function renderSummaryMetrics() {
    const sections = progressRecords;
    const maps = sections.filter(({ section }) => isMapSection(section));
    translationStatisticsGrid.setValue(
      "dashboard-section-count",
      (currentDocument?.sections.length ?? 0).toLocaleString(),
    );
    translationStatisticsGrid.setValue("dashboard-map-count", maps.length.toLocaleString());
    translationStatisticsGrid.setValue("dashboard-entry-count", maps
      .reduce((total, { section }) => total + section.rows.length, 0).toLocaleString());
    renderUniqueWordComparison();
    translationStatisticsGrid.setValue("dashboard-source-count", sourceStatistics.size.toLocaleString());
  }

  function renderUniqueWordComparison() {
    const value = root.querySelector("#dashboard-unique-word-count");
    const targetLanguage = TARGET_LANGUAGE_NAMES[currentPreferences.targetLanguage]
      ?? currentPreferences.targetLanguage;
    value.closest(".statistics-grid-cell").querySelector(".statistics-grid-description").textContent =
      `English vs ${targetLanguage}`;
    if (!currentDocument) {
      translationStatisticsGrid.setValue("dashboard-unique-word-count", "—");
      return;
    }

    const sourceCount = sourceWords.size;
    const targetCount = wordUsageIndex?.words.size ?? 0;
    const sourceValue = root.ownerDocument.createElement("span");
    sourceValue.textContent = sourceCount.toLocaleString();
    const targetValue = root.ownerDocument.createElement("span");
    targetValue.textContent = targetCount.toLocaleString();
    if (sourceCount !== targetCount) {
      sourceValue.dataset.wordCountTone = sourceCount > targetCount ? "greater" : "lesser";
      targetValue.dataset.wordCountTone = targetCount > sourceCount ? "greater" : "lesser";
    }
    value.replaceChildren(
      sourceValue,
      root.ownerDocument.createTextNode(" vs "),
      targetValue,
    );
  }

  function renderMapDistribution() {
    const mapRecords = progressRecords.filter(({ section }) => isMapSection(section)).map((record) => ({
      ...record,
      uniqueWords: sectionWordCounts.get(record.section)?.size ?? 0,
     issueCount: currentIssueCounts.get(record.section.index) ?? 0,
    }));
    let ranked;
    let getValue;
    let getDisplayValue;
    let unit;
    let heading;
    let detailsTitle;
    let detailColumns;
    let getDetails;
    let getOtherDisplayValue;
    let compareItems;
    if (mapDistributionMode === "entries") {
      ranked = mapRecords;
      getValue = ({ section }) => section.rows.length;
      unit = "entries";
      heading = "Maps by entry count";
      detailsTitle = "Other maps by entry count";
      detailColumns = ["Map", "Entries"];
      getDetails = ({ section }) => [section.rows.length.toLocaleString()];
    } else if (mapDistributionMode === "uniqueWords") {
      ranked = mapRecords;
      getValue = (record) => record.uniqueWords;
      unit = "unique words";
      heading = "Maps by unique words";
      detailsTitle = "Other maps by unique words";
      detailColumns = ["Map", "Unique words"];
      getDetails = (record) => [record.uniqueWords.toLocaleString()];
    } else if (mapDistributionMode === "issues") {
      ranked = mapRecords;
      compareItems = (left, right, direction) =>
        direction * (right.issueCount - left.issueCount)
        || left.section.name.localeCompare(right.section.name)
        || left.section.index - right.section.index;
      getValue = (record) => record.issueCount;
      unit = "unresolved issues";
      heading = "Maps by unresolved issues";
      detailsTitle = "Other maps by unresolved issues";
      detailColumns = ["Map", "Unresolved issues"];
      getDetails = (record) => [record.issueCount.toLocaleString()];
    } else {
      const maximumEntries = Math.max(1, ...mapRecords.map(({ section }) => section.rows.length));
      const maximumWords = Math.max(1, ...mapRecords.map(({ uniqueWords }) => uniqueWords));
      ranked = mapRecords.map((record) => ({
        ...record,
        complexity: record.section.rows.length / maximumEntries + record.uniqueWords / maximumWords,
      }));
      compareItems = (left, right, direction) =>
        direction * (right.complexity - left.complexity)
        || direction * (right.section.rows.length - left.section.rows.length)
        || direction * (right.uniqueWords - left.uniqueWords)
        || left.section.name.localeCompare(right.section.name)
        || left.section.index - right.section.index;
      getValue = (record) => record.complexity;
      unit = "complexity score";
      heading = "Maps by complexity";
      detailsTitle = "Other maps by complexity";
      detailColumns = ["Map", "Complexity score"];
      getDetails = (record) => [record.complexity.toFixed(2)];
      getOtherDisplayValue = (records) => `${records.length.toLocaleString()} maps`;
    }
    root.querySelector("#map-distribution-title").textContent = heading;
    mapTreemap.render({
      items: ranked,
      getName: ({ section }) => section.name,
      getValue,
      getSortValue: getValue,
      compareItems,
      getDisplayValue: getDisplayValue
        ?? ((record) => `${getValue(record).toLocaleString()} ${unit}`),
      getOtherDisplayValue: getOtherDisplayValue
        ?? ((records, total) => `${total.toLocaleString()} ${unit}`),
      getItemTitle: ({ section }) => `Open ${section.name} in Maps`,
      getOtherTitle: (records) => `Show ${records.length} other maps`,
      onItem: (record) => onMap(record.section.index),
      onOther: (records) => showMapDetails(records, detailsTitle, detailColumns, getDetails),
      emptyMessage: currentDocument ? "No named maps were found." : "Load a file to compare maps.",
      label: `${ranked.length} maps`,
      otherLabel: "Other maps",
    });
  }

  function showMapDetails(records, title, columns, getValues) {
    const results = mapDetailsTable.rows;
    root.querySelector("#map-details-title").textContent = title;
    const headerRow = mapDetailsTable.head.rows[0] ?? document.createElement("tr");
    mapDetailsTable.setColumnHeader(headerRow);
    headerRow.replaceChildren(...columns.map((column) => {
      const header = document.createElement("th");
      header.scope = "col";
      header.textContent = column;
      return header;
    }));
    results.replaceChildren();
    for (const record of records) {
      const row = document.createElement("tr");
      const mapCell = cell("");
      const link = document.createElement("button");
      link.type = "button";
      link.className = "text-button section-stat-link";
      link.textContent = record.section.name;
      link.addEventListener("click", () => {
        mapDetailsModal.close();
        onMap(record.section.index);
      });
      mapCell.append(link);
      row.append(mapCell, ...getValues(record).map(cell));
      results.append(row);
    }
    mapDetailsModal.show();
  }

  function showSourceDetails(source) {
    const sourceName = source.trim();
    sourceDetailsPages.maps = 0;
    sourceDetailsPages.entries = 0;
    root.querySelector("#source-details-original").textContent = sourceName;
    root.querySelector("#source-details-translation").textContent =
      getSourceTranslation(sourceName) || "Not available";
    const term = getSourceTerm(sourceName);
    terminologyButton.disabled = !term;
    terminologyButton.title = term ? "" : "No matching glossary term is available.";
    terminologyButton.onclick = term
      ? () => {
        sourceDetailsModal.close();
        onOpenTerm(term);
      }
      : null;
    renderSourceDetails();
    sourceDetailsModal.show();
  }

  function renderSourceDetails(list = null) {
    const source = root.querySelector("#source-details-original").textContent;
    const record = sourceStatistics.get(source);
    if (!record) {
      if (list === null || list === "maps") {
        sourceDetailsMapTable.rows.replaceChildren(messageRow(3, "No maps contain this Source tag in the current localisation."));
        root.querySelector("#source-details-map-summary").textContent = "0 maps · 0 entries";
        renderSourceDetailsPagination("maps", 0);
      }
      if (list === null || list === "entries") {
        sourceDetailsEntryTable.rows.replaceChildren(messageRow(
          currentDocument?.formatId === "txt" ? 2 : 3,
          "No entries use this Source tag in the current localisation.",
        ));
        root.querySelector("#source-details-entry-summary").textContent = "0 entries";
        renderSourceDetailsPagination("entries", 0);
      }
      return;
    }
    if (list === null || list === "maps") {
      const records = [...record.sections];
      renderSourceDetailsPagination("maps", records.length);
      const start = sourceDetailsPages.maps * SOURCE_DETAILS_PAGE_SIZE;
      const rows = records.slice(start, start + SOURCE_DETAILS_PAGE_SIZE).map(([section, count]) => {
        const row = document.createElement("tr");
        const mapCell = cell("");
        const link = document.createElement("button");
        link.type = "button";
        link.className = "text-button section-stat-link";
        link.textContent = section.name;
        link.title = `Open ${section.name} in Maps`;
        link.addEventListener("click", () => {
          sourceDetailsModal.close();
          onMap(section.index);
        });
        mapCell.append(link);
        row.append(mapCell, cell(count.toLocaleString()),
          cell(`${(count / section.rows.length * 100).toFixed(2)}%`));
        return row;
      });
      sourceDetailsMapTable.rows.replaceChildren(...rows);
      root.querySelector("#source-details-map-summary").textContent =
        `${records.length.toLocaleString()} ${records.length === 1 ? "map" : "maps"} · ${record.total.toLocaleString()} entries`;
    }
    if (list === null || list === "entries") {
      const records = record.entries;
      renderSourceDetailsPagination("entries", records.length);
      const start = sourceDetailsPages.entries * SOURCE_DETAILS_PAGE_SIZE;
      const rows = records.slice(start, start + SOURCE_DETAILS_PAGE_SIZE).map(({ section, english, translation }) => {
        const row = document.createElement("tr");
        const mapCell = cell("");
        const mapLink = document.createElement("button");
        mapLink.type = "button";
        mapLink.className = "text-button section-stat-link";
        mapLink.textContent = section.name;
        mapLink.title = `Open ${section.name} in Maps`;
        mapLink.addEventListener("click", () => {
          sourceDetailsModal.close();
          onMap(section.index);
        });
        mapCell.append(mapLink);
        row.append(mapCell);
        if (currentDocument?.formatId !== "txt") row.append(cell(english || "—"));
        row.append(cell(translation || "—"));
        return row;
      });
      sourceDetailsEntryTable.rows.replaceChildren(...rows);
      root.querySelector("#source-details-entry-summary").textContent =
        `${records.length.toLocaleString()} ${records.length === 1 ? "entry" : "entries"}`;
    }
  }

  function renderSourceDetailsPagination(list, total) {
    const pageCount = Math.max(1, Math.ceil(total / SOURCE_DETAILS_PAGE_SIZE));
    const page = sourceDetailsPages[list];
    const listName = list === "maps" ? "map" : "entry";
    root.querySelector(`#source-details-${listName}-page`).textContent =
      `Page ${page + 1} of ${pageCount}`;
    root.querySelector(`#source-details-${listName}-pagination`).hidden = pageCount <= 1;
    root.querySelector(`[data-source-detail-page="${list}-previous"]`).disabled = page === 0;
    root.querySelector(`[data-source-detail-page="${list}-next"]`).disabled = page >= pageCount - 1;
  }

  function renderWords() {
    if (wordsDirty) {
      wordsDirty = false;
      wordPage = 0;
      renderWordTotals();
      const minLength = currentPreferences?.minimumWordLength ?? 3;
      const maxLength = currentPreferences?.dashboardMaximumWordLength ?? Infinity;
      const minOccurrences = currentPreferences?.minimumWordOccurrences ?? 1;
      const maxOccurrences = currentPreferences?.dashboardMaximumWordOccurrences ?? Infinity;
      visibleWords = currentDocument && maxLength >= minLength
        ? [...wordUsageIndex.words.values()]
          .filter(wordMatchesFilters)
          .map(createVisibleWord)
        : [];
      sortVisibleWords();
    }
    renderWordWindow();
  }

  function wordMatchesFilters({ word, frequency }) {
    const minLength = currentPreferences?.minimumWordLength ?? 3;
    const maxLength = currentPreferences?.dashboardMaximumWordLength ?? Infinity;
    const minOccurrences = currentPreferences?.minimumWordOccurrences ?? 1;
    const maxOccurrences = currentPreferences?.dashboardMaximumWordOccurrences ?? Infinity;
    const length = [...word].length;
    return maxLength >= minLength
      && length >= minLength && length <= maxLength
      && frequency >= minOccurrences && frequency <= maxOccurrences
      && isWordSpellcheckVisible(word);
  }

  function createVisibleWord(word) {
    return {
      ...word,
      percentage: wordUsageIndex.totalEntries
        ? word.occurrences.length / wordUsageIndex.totalEntries * 100
        : 0,
    };
  }

  function sortVisibleWords() {
    visibleWords = wordsTreemap.sortItems(visibleWords, wordSortOptions);
  }

  function insertVisibleWord(word) {
    let low = 0;
    let high = visibleWords.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const existing = visibleWords[middle];
      const order = wordsTreemap.sortDirection * (word.frequency - existing.frequency)
        || existing.word.localeCompare(word.word);
      if (order < 0) low = middle + 1;
      else high = middle;
    }
    visibleWords.splice(low, 0, word);
  }

  function renderWordTotals() {
    const uniqueCount = root.querySelector("#word-usage-unique-count");
    const occurrenceCount = root.querySelector("#word-usage-occurrence-count");
    if (!wordUsageIndex) {
      uniqueCount.textContent = "—";
      occurrenceCount.textContent = "—";
      return;
    }

    let totalOccurrences = 0;
    for (const entry of wordUsageIndex.words.values()) totalOccurrences += entry.frequency;
    uniqueCount.textContent = wordUsageIndex.words.size.toLocaleString();
    occurrenceCount.textContent = totalOccurrences.toLocaleString();
  }

  function renderWordWindow() {
    const pageCount = Math.max(1, Math.ceil(visibleWords.length / WORD_TREEMAP_PAGE_SIZE));
    wordPage = Math.max(0, Math.min(wordPage, pageCount - 1));
    const start = wordPage * WORD_TREEMAP_PAGE_SIZE;
    const pageWords = visibleWords.slice(start, start + WORD_TREEMAP_PAGE_SIZE);
    wordsTreemap.render({
      items: pageWords,
      ...wordSortOptions,
      getDisplayValue: ({ frequency }) => `${frequency.toLocaleString()} ${frequency === 1 ? "occurrence" : "occurrences"}`,
      getItemActionLabel: ({ word }) => getSpellcheckInfo(word).status === "Not OK"
        ? `Add "${word}" to the dictionary exclusion list`
        : "",
      getItemTitle: ({ word }) => `Show occurrences of "${word}"`,
      getItemClassName: ({ word }) => `treemap-item--${getSpellcheckInfo(word).className}`,
      onItem: ({ word, occurrences }) => onOccurrences(`Target word: ${word}`, occurrences),
      onItemAction: ({ word }) => onAddWordExclusion(word),
      onSortChange() {
        sortVisibleWords();
        renderWordWindow();
      },
      emptyMessage: currentDocument
        ? "No target-language words meet the current filters."
        : "Load a file to view target-language word usage.",
      label: `${visibleWords.length.toLocaleString()} filtered target-language words`,
      maximumItems: WORD_TREEMAP_PAGE_SIZE,
    });
    const pagination = root.querySelector("#word-usage-pagination");
    const pageStatus = root.querySelector("#word-usage-page-status");
    pagination.hidden = visibleWords.length <= WORD_TREEMAP_PAGE_SIZE;
    pageStatus.textContent = `Page ${wordPage + 1} of ${pageCount}`;
    root.querySelector('[data-word-page="previous"]').disabled = wordPage === 0;
    root.querySelector('[data-word-page="next"]').disabled = wordPage >= pageCount - 1;
  }

  function getSpellcheckInfo(word) {
    if (!currentDictionaryAvailable || !currentDictionary || !currentPreferences.dictionaryValidation
      || isWordExcluded(word, currentPreferences.dictionaryExclusions ?? [])) {
      return { status: "N/A", className: "spellcheck-na", rank: 0 };
    }
    return getSpellingResult(currentDictionary, word)
      ? { status: "OK", className: "spellcheck-ok", rank: 2 }
      : { status: "Not OK", className: "spellcheck-not-ok", rank: 1 };
  }

  function isWordSpellcheckVisible(word) {
    if (spellcheckFilter === "all") return true;
    const status = getSpellcheckInfo(word).status;
    return spellcheckFilter === "ok" ? status === "OK" : status === "Not OK";
  }

  return {
    render,
    updateWordExclusion(word, preferences) {
      currentPreferences = preferences;
      const entry = wordUsageIndex?.words.get(word);
      if (!entry) {
        wordsDirty = true;
        renderWords();
        return;
      }
      const visibleIndex = visibleWords.findIndex((visible) => visible.word === word);
      if (wordMatchesFilters(entry)) {
        const visible = createVisibleWord(entry);
        if (visibleIndex < 0) insertVisibleWord(visible);
        else visibleWords[visibleIndex] = visible;
      } else if (visibleIndex >= 0) {
        visibleWords.splice(visibleIndex, 1);
      }
      wordsDirty = false;
      renderWordWindow();
    },
    updateRow,
    updateIssueCounts(issueCounts) {
      currentIssueCounts = issueCounts;
      if (mapDistributionMode === "issues") renderMapDistribution();
    },
    showSourceDetails,
    updateSourceStatistics() {
      sourceStatisticsDirty = true;
      renderSourceStatistics();
    },
    refreshMetadata() {
      renderFileMetadata(currentDocument, currentFileName);
    },
  };
}

function buildSectionWordCounts(localisation) {
  const sections = new Map();
  for (const section of localisation.sections) {
    const translationIndex = section.columns.indexOf("Translation");
    if (!section.name || translationIndex < 0) continue;
    const counts = new Map();
    for (const row of section.rows) {
      for (const word of extractWords(row.fields[translationIndex] ?? "")) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    sections.set(section, counts);
  }
  return sections;
}

function buildSourceWordSet(localisation) {
  const words = new Set();
  for (const section of localisation.sections) {
    if (!section.name) continue;
    const translationIndex = section.columns.indexOf("Translation");
    if (translationIndex < 0) continue;
    const englishIndex = section.columns.indexOf("English");
    const sourceIndex = englishIndex >= 0 ? englishIndex : translationIndex - 1;
    for (const row of section.rows) {
      for (const word of extractWords(row.fields[sourceIndex] ?? "")) words.add(word);
    }
  }
  return words;
}

function getSourceTagPageSize(isNarrow) {
  return SOURCE_TAG_ROWS * (isNarrow ? SOURCE_TAG_COLUMNS.narrow : SOURCE_TAG_COLUMNS.wide);
}

function renderSourceTagTreemap(container, {
  items,
  getName,
  getDisplayValue,
  onItem,
  getItemTitle,
  emptyMessage,
  label,
}) {
  container.replaceChildren();
  container.classList.remove("treemap--has-other-items");
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.append(empty);
    container.removeAttribute("aria-label");
    return;
  }

  for (const item of items) {
    const tile = document.createElement("div");
    tile.className = "source-distribution-item";
    tile.title = getItemTitle(item);
    const name = createSourceTag(getName(item), item.color, () => onItem(item));
    name.classList.add("source-distribution-name");
    const value = document.createElement("span");
    value.className = "source-distribution-count";
    value.textContent = getDisplayValue(item);
    tile.append(name, value);
    container.append(tile);
  }
  container.setAttribute("aria-label", label);
}

function formatEncoding(encoding, hasByteOrderMark) {
  const label = encoding.toLocaleUpperCase();
  return hasByteOrderMark ? `${label} (BOM)` : label;
}

function buildSourceStatistics(localisation) {
  const statistics = new Map();
  for (const section of localisation.sections) {
    const sourceIndex = section.columns.indexOf("Source");
    if (!isMapSection(section) || sourceIndex < 0 || !section.columns.includes("Translation")) continue;
    const englishIndex = section.columns.indexOf("English");
    const translationIndex = section.columns.indexOf("Translation");
    for (const row of section.rows) {
      const source = row.fields[sourceIndex]?.trim();
      if (!source) continue;
      let record = statistics.get(source);
      if (!record) {
        record = { total: 0, sections: new Map(), entries: [] };
        statistics.set(source, record);
      }
      record.total += 1;
      record.sections.set(section, (record.sections.get(section) ?? 0) + 1);
      record.entries.push({
        section,
        row,
        english: row.fields[englishIndex] ?? "",
        translation: row.fields[translationIndex] ?? "",
      });
    }
  }
  return new Map([...statistics].sort(([left], [right]) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })));
}

function updateSectionWordCounts(sectionWordCounts, section, previousText, nextText) {
  const counts = sectionWordCounts.get(section);
  if (!counts) return;
  for (const word of extractWords(previousText)) {
    const nextCount = (counts.get(word) ?? 0) - 1;
    if (nextCount > 0) counts.set(word, nextCount);
    else counts.delete(word);
  }
  for (const word of extractWords(nextText)) counts.set(word, (counts.get(word) ?? 0) + 1);
}

function progressCell(sectionName, percentage) {
  const element = document.createElement("td");
  element.classList.add("progress-cell");
  const bar = document.createElement("progress");
  bar.max = 100;
  bar.value = percentage;
  bar.setAttribute("aria-label", `${sectionName}: ${percentage}% complete`);
  const label = document.createElement("span");
  label.textContent = `${percentage}%`;
  element.append(bar, label);
  return element;
}
