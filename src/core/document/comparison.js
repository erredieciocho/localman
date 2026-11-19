export function compareLocalisationDocuments(currentDocument, targetDocument) {
  validateDocument(currentDocument, "current");
  validateDocument(targetDocument, "target");
  if (currentDocument.formatId !== targetDocument.formatId) {
    throw new TypeError("Localisation files must use the same format to be compared.");
  }

  const targetSections = groupByName(targetDocument.sections);
  const sections = [];
  for (const currentSection of currentDocument.sections) {
    const nameKey = sectionNameKey(currentSection.name);
    const targetMatches = targetSections.get(nameKey) ?? [];
    const targetSection = targetMatches.shift() ?? null;
    sections.push(compareSections(currentSection, targetSection));
  }

  const currentSections = groupByName(currentDocument.sections);
  for (const targetSection of targetDocument.sections) {
    const nameKey = sectionNameKey(targetSection.name);
    const currentMatches = currentSections.get(nameKey) ?? [];
    if (currentMatches.length) {
      currentMatches.shift();
    } else {
      sections.push(compareSections(null, targetSection));
    }
  }

  const differences = sections.flatMap((section) => section.entries);
  const summary = {
    changed: differences.filter((entry) => entry.status === "changed").length,
    currentOnly: differences.filter((entry) => entry.status === "current-only").length,
    targetOnly: differences.filter((entry) => entry.status === "target-only").length,
  };
  return { sections: sections.filter((section) => section.entries.length), summary };
}

function compareSections(currentSection, targetSection) {
  const currentRows = currentSection?.rows ?? [];
  const targetRowsById = groupRowsById(targetSection);
  const matchedTargetRows = new Set();
  const currentOccurrences = getRowOccurrences(currentSection);
  const targetOccurrences = getRowOccurrences(targetSection);
  const entries = [];

  for (const currentRow of currentRows) {
    const id = getRowId(currentSection, currentRow);
    const targetMatches = targetRowsById.get(id) ?? [];
    const targetRow = targetMatches.shift() ?? null;
    if (!targetRow) {
      entries.push(createEntry(
        "current-only", id, currentOccurrences.get(currentRow), currentSection, currentRow, targetSection, null, [],
      ));
      continue;
    }
    matchedTargetRows.add(targetRow);
    const changes = compareFields(currentSection, currentRow, targetSection, targetRow);
    if (changes.length) {
      entries.push(createEntry(
        "changed", id, currentOccurrences.get(currentRow), currentSection, currentRow, targetSection, targetRow, changes,
      ));
    }
  }

  for (const targetRow of targetSection?.rows ?? []) {
    if (matchedTargetRows.has(targetRow)) continue;
    const id = getRowId(targetSection, targetRow);
    entries.push(createEntry(
      "target-only", id, targetOccurrences.get(targetRow), currentSection, null, targetSection, targetRow, [],
    ));
  }

  return {
    name: currentSection?.name ?? targetSection?.name ?? null,
    currentSectionIndex: currentSection?.index ?? null,
    targetSectionIndex: targetSection?.index ?? null,
    entries,
  };
}

function compareFields(currentSection, currentRow, targetSection, targetRow) {
  const columns = [...new Set([...(currentSection?.columns ?? []), ...(targetSection?.columns ?? [])])];
  return columns.flatMap((column) => {
    const currentValue = getFieldValue(currentSection, currentRow, column);
    const targetValue = getFieldValue(targetSection, targetRow, column);
    return currentValue === targetValue ? [] : [{ column, currentValue, targetValue }];
  });
}

function createEntry(status, id, occurrence, currentSection, currentRow, targetSection, targetRow, changes) {
  const section = currentSection ?? targetSection;
  return {
    status,
    id,
    sectionName: section?.name ?? null,
    occurrence,
    current: snapshotRow(currentSection, currentRow),
    target: snapshotRow(targetSection, targetRow),
    changes,
  };
}

function snapshotRow(section, row) {
  if (!section || !row) return null;
  return {
    index: row.index,
    values: section.columns.map((column, index) => ({
      column,
      value: row.fields[index] ?? "",
    })),
  };
}

function getFieldValue(section, row, column) {
  const columnIndex = section?.columns.indexOf(column) ?? -1;
  return columnIndex < 0 ? null : row.fields[columnIndex] ?? "";
}

function groupRowsById(section) {
  const rowsById = new Map();
  for (const row of section?.rows ?? []) {
    const id = getRowId(section, row);
    if (!rowsById.has(id)) rowsById.set(id, []);
    rowsById.get(id).push(row);
  }
  return rowsById;
}

function getRowOccurrences(section) {
  const occurrences = new Map();
  const counts = new Map();
  for (const row of section?.rows ?? []) {
    const id = getRowId(section, row);
    const occurrence = (counts.get(id) ?? 0) + 1;
    counts.set(id, occurrence);
    occurrences.set(row, occurrence);
  }
  return occurrences;
}

function getRowId(section, row) {
  const idIndex = section.columns.indexOf("ID");
  return idIndex < 0 ? row.key : row.fields[idIndex] ?? "";
}

function groupByName(sections) {
  const sectionsByName = new Map();
  for (const section of sections) {
    const nameKey = sectionNameKey(section.name);
    if (!sectionsByName.has(nameKey)) sectionsByName.set(nameKey, []);
    sectionsByName.get(nameKey).push(section);
  }
  return sectionsByName;
}

function sectionNameKey(name) {
  return name ?? "";
}

function validateDocument(document, label) {
  if (!document || !Array.isArray(document.sections)) {
    throw new TypeError(`The ${label} localisation document must contain sections.`);
  }
}
