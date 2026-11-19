export class LocalisationDocument {
  constructor({
    version,
    sections,
    sectionIds = [],
    formatId,
    encoding = "utf-8",
    hasByteOrderMark = false,
  } = {}) {
    if (!version || !Array.isArray(sections)) {
      throw new TypeError("A localisation document requires a version and sections.");
    }
    if (typeof encoding !== "string" || !encoding.trim() || typeof hasByteOrderMark !== "boolean") {
      throw new TypeError("A localisation document requires valid encoding metadata.");
    }

    this.formatId = formatId;
    this.encoding = encoding;
    this.hasByteOrderMark = hasByteOrderMark;
    this.version = { ...version };
    this.sectionIds = new Set(
      (Array.isArray(sectionIds) ? sectionIds : String(sectionIds).split(","))
        .map((id) => String(id).trim())
        .filter(Boolean),
    );
    this.sections = sections.map((section, sectionIndex) => {
      const modelSection = {
        index: sectionIndex,
        name: section.name ?? null,
        columns: [...section.columns],
        rows: [],
      };
      modelSection.rows = section.rows.map((row, rowIndex) => ({
        index: rowIndex,
        key: row.key ?? "",
        fields: [...row.fields],
        sourceLine: row.sourceLine,
        section: modelSection,
      }));
      return modelSection;
    });
  }

  updateCell(sectionIndex, rowIndex, columnName, value) {
    const section = this.sections[sectionIndex];
    if (!section) {
      throw new RangeError(`Section index ${sectionIndex} does not exist.`);
    }
    const row = section.rows[rowIndex];
    if (!row) {
      throw new RangeError(`Row index ${rowIndex} does not exist in section ${sectionIndex}.`);
    }
    const columnIndex = section.columns.indexOf(columnName);
    if (columnIndex < 0) {
      throw new RangeError(`Column "${columnName}" does not exist in section ${sectionIndex}.`);
    }
    if (typeof value !== "string") {
      throw new TypeError("Cell values must be strings.");
    }

    while (row.fields.length <= columnIndex) {
      row.fields.push("");
    }
    row.fields[columnIndex] = value;
    row.key = row.fields[Math.max(0, section.columns.indexOf("ID"))] ?? "";
  }

  getRowStatus(section, row) {
    const translationIndex = section.columns.indexOf("Translation");
    if (translationIndex < 0) {
      return "non-translatable";
    }
    const sourceIndex = section.columns.indexOf("English") >= 0
      ? section.columns.indexOf("English")
      : translationIndex - 1;
    const source = row.fields[sourceIndex] ?? "";
    const translation = row.fields[translationIndex] ?? "";
    const sourceText = source.trim();
    const translationText = translation.trim();

    if (row.fields.length !== section.columns.length) {
      return "malformed";
    }
    if (!sourceText && !translationText) {
      return "non-translatable";
    }
    if (!translationText) {
      return "untranslated";
    }
    if (!sourceText || !/\p{L}/u.test(sourceText)) {
      return "untranslatable";
    }
    if (translation === source) {
      return "untranslated";
    }
    return "translated";
  }

  searchRows({ sectionIndex, query = "", status } = {}) {
    const selectedSections = sectionIndex === undefined
      ? this.sections
      : [this.sections[sectionIndex]].filter(Boolean);
    const needle = query.trim().toLocaleLowerCase();
    const results = [];

    for (const section of selectedSections) {
      for (const row of section.rows) {
        if (needle && !row.fields.join(" ").toLocaleLowerCase().includes(needle)) {
          continue;
        }
        const rowStatus = this.getRowStatus(section, row);
        if (status && rowStatus !== status) {
          continue;
        }
        results.push({ section, row, status: rowStatus });
      }
    }
    return results;
  }
}
