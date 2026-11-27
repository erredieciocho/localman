import { LocalisationDocument } from "../../../../core/document/index.js";
import { parseCsvRecords, serializeCsvRecord } from "./csv-parser.js";

const SUPPORTED_MAJORS = new Set([1, 2, 3]);
const csvStates = new WeakMap();

export class LocalisationFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "LocalisationFormatError";
  }
}

export function parseCsvLocalisation(text, {
  sectionIds = "",
  encoding = "utf-8",
  hasByteOrderMark = text?.startsWith("\uFEFF") ?? false,
} = {}) {
  if (typeof text !== "string" || text.length === 0) {
    throw new LocalisationFormatError("The localisation file is empty.");
  }

  const records = parseCsvRecords(text);
  const versionLabel = records[0]?.fields[0]?.replace(/^\uFEFF/u, "").trim();
  const versionText = records[1]?.fields[0]?.trim() ?? "";
  const versionMatch = versionText.match(/^(\d+)\.(\d+)\.(\d+)(?:\s|$)/u);

  if (versionLabel !== "Version" || !versionMatch) {
    throw new LocalisationFormatError("The file does not contain a valid TCOAAL version header.");
  }

  const version = {
    major: Number(versionMatch[1]),
    minor: Number(versionMatch[2]),
    patch: Number(versionMatch[3]),
    text: versionMatch[0].trim(),
  };
  if (!SUPPORTED_MAJORS.has(version.major)) {
    throw new LocalisationFormatError(`TCOAAL version ${version.text} is not supported.`);
  }

  const sectionSeparator = version.major === 3 && (version.minor > 0 || version.patch >= 13)
    ? ",,,"
    : "";
  const selectedSectionIds = new Set(
    (Array.isArray(sectionIds) ? sectionIds : String(sectionIds).split(","))
      .map((id) => String(id).trim())
      .filter(Boolean),
  );
  const parsed = buildSections(records, sectionSeparator, selectedSectionIds);
  const document = new LocalisationDocument({
    formatId: "csv",
    version,
    sections: parsed.sections,
    sectionIds: [...selectedSectionIds],
    readonly: false,
    encoding,
    hasByteOrderMark,
  });
  const state = {
    records,
    sectionSeparator,
    sectionData: new Map(),
    recordRows: new Map(),
    originalRowFields: new WeakMap(),
  };

  document.sections.forEach((section, index) => {
    const data = parsed.sectionData[index];
    state.sectionData.set(section, data);
    section.rows.forEach((row, rowIndex) => {
      const record = data.dataRecords[rowIndex];
      state.recordRows.set(record, row);
      state.originalRowFields.set(row, [...record.fields]);
    });
  });
  csvStates.set(document, state);
  return document;
}

export function serializeCsvLocalisation(document) {
  const state = getState(document);
  return state.records.map((record) => serializeRecord(record, state)).join("");
}

export function serializeCsvSection(document, sectionIndex) {
  const state = getState(document);
  const section = document.sections[sectionIndex];
  if (!section) {
    throw new RangeError(`Section index ${sectionIndex} does not exist.`);
  }
  const data = state.sectionData.get(section);
  const firstSectionRecord = data.sectionRecord ?? data.headerRecord;
  const sectionRecordIndex = state.records.indexOf(firstSectionRecord);
  const separator = state.records.slice(2, sectionRecordIndex)
    .find((record) => record.raw === state.sectionSeparator);
  const lineEnding = separator?.lineEnding
    || state.records[1]?.lineEnding
    || state.records.find((record) => record.lineEnding)?.lineEnding
    || "\n";
  const separatorRecord = separator ?? {
    fields: state.sectionSeparator === "" ? [""] : state.sectionSeparator.split(","),
    raw: state.sectionSeparator,
    lineEnding,
  };
  const records = [
    ...state.records.slice(0, 2),
    separatorRecord,
    ...(data.sectionRecord ? [data.sectionRecord] : []),
    data.headerRecord,
    ...data.dataRecords,
  ];
  return records.map((record) => serializeRecord(record, state)).join("");
}

export function replaceCsvSection(document, sectionIndex, sourceDocument, sourceSectionIndex) {
  const state = getState(document);
  const sourceState = getState(sourceDocument);
  const target = document.sections[sectionIndex];
  const source = sourceDocument.sections[sourceSectionIndex];
  if (!target) {
    throw new RangeError(`Section index ${sectionIndex} does not exist.`);
  }
  if (!source) {
    throw new RangeError(`Imported section index ${sourceSectionIndex} does not exist.`);
  }
  if (target.name !== source.name) {
    throw new Error(`Imported section "${source.name ?? "unnamed"}" does not match "${target.name ?? "unnamed"}".`);
  }
  if (target.columns.length !== source.columns.length
    || target.columns.some((column, index) => column !== source.columns[index])) {
    throw new Error(`Imported section "${source.name ?? "unnamed"}" has different columns.`);
  }

  const targetData = state.sectionData.get(target);
  if (!targetData || !sourceState.sectionData.has(source)) {
    throw new Error("Could not locate the selected section in a CSV source file.");
  }
  const firstIndex = state.records.indexOf(targetData.sectionRecord ?? targetData.headerRecord);
  const lastRecord = targetData.dataRecords.at(-1) ?? targetData.headerRecord;
  const lastIndex = state.records.indexOf(lastRecord);
  if (firstIndex < 0 || lastIndex < firstIndex) {
    throw new Error("Could not locate the selected section in the source file.");
  }
  const lineEnding = state.records.slice(firstIndex, lastIndex + 1)
    .find((record) => record.lineEnding)?.lineEnding
    || state.records.find((record) => record.lineEnding)?.lineEnding
    || "\n";
  const lastLineEnding = state.records[lastIndex].lineEnding;
  const replacementRows = source.rows.map((row, index) => ({
    fields: [...row.fields],
    raw: serializeCsvRecord(row.fields),
    lineEnding: index === source.rows.length - 1 ? lastLineEnding : lineEnding,
  }));
  const replacementRecords = [
    ...(targetData.sectionRecord ? [targetData.sectionRecord] : []),
    targetData.headerRecord,
    ...replacementRows,
  ];
  const records = [...state.records];
  records.splice(firstIndex, lastIndex - firstIndex + 1, ...replacementRecords);
  const contents = records.map((record) => serializeRecord(record, state)).join("");
  return parseCsvLocalisation(contents, {
    sectionIds: [...document.sectionIds],
    encoding: document.encoding,
    hasByteOrderMark: document.hasByteOrderMark,
  });
}

function buildSections(records, sectionSeparator, selectedSectionIds) {
  const sections = [];
  const sectionData = [];
  let sectionRecords = [];

  const finishSection = () => {
    if (sectionRecords.length === 0) {
      return;
    }

    const first = sectionRecords[0];
    const isNamed = first.fields[0] === "Section";
    const sectionName = isNamed ? first.fields[1] ?? "" : null;
    if (isNamed && sectionRecords.length < 2) {
      throw new LocalisationFormatError(
        `Section "${first.fields[1] ?? ""}" is missing its column header.`,
      );
    }
    const headerRecord = isNamed ? sectionRecords[1] : first;
    const dataRecords = sectionRecords.slice(isNamed ? 2 : 1);
    const columns = headerRecord?.fields.map((name) => name.replace(/^\uFEFF/u, "")) ?? [];
    if (columns.length === 0 || columns.every((name) => name === "")) {
      throw new LocalisationFormatError(`Section at line ${first.line} has no column names.`);
    }
    for (const record of dataRecords) {
      if (record.fields.length !== columns.length) {
        throw new LocalisationFormatError(
          `Row at line ${record.line} in section "${isNamed ? first.fields[1] ?? "" : "unnamed"}" `
          + `has ${record.fields.length} fields; expected ${columns.length}.`,
        );
      }
    }
    if (sectionName && selectedSectionIds.size > 0 && !selectedSectionIds.has(sectionName)) {
      sectionRecords = [];
      return;
    }

    const keyIndex = Math.max(0, columns.indexOf("ID"));
    sections.push({
      name: sectionName,
      columns,
      rows: dataRecords.map((record) => ({
        key: record.fields[keyIndex] ?? "",
        fields: [...record.fields],
        sourceLine: record.line,
      })),
    });
    sectionData.push({
      sectionRecord: isNamed ? first : null,
      headerRecord,
      dataRecords,
    });
    sectionRecords = [];
  };

  for (const record of records) {
    const isSeparator = sectionSeparator === ""
      ? record.raw === ""
      : record.raw === sectionSeparator;
    if (isSeparator) {
      finishSection();
    } else {
      sectionRecords.push(record);
    }
  }
  finishSection();
  return { sections, sectionData };
}

function getState(document) {
  const state = csvStates.get(document);
  if (!state) {
    throw new TypeError("The CSV format requires a document parsed by the CSV plugin.");
  }
  return state;
}

function serializeRecord(record, state) {
  const row = state.recordRows.get(record);
  const originalFields = row && state.originalRowFields.get(row);
  const changed = Boolean(row && (
    row.fields.length !== originalFields.length
    || row.fields.some((value, index) => value !== originalFields[index])
  ));
  const content = changed ? serializeCsvRecord(row.fields) : record.raw;
  return content + record.lineEnding;
}
