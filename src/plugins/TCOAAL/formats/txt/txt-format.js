import { LocalisationDocument } from "../../../../core/document/index.js";

const SUPPORTED_MAJORS = new Set([3]);
const documentStates = new WeakMap();

export class TxtFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "TxtFormatError";
  }
}

export function parseTxtLocalisation(text, {
  sectionIds = "",
  encoding = "utf-8",
  hasByteOrderMark = text?.startsWith("\uFEFF") ?? false,
} = {}) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TxtFormatError("The localisation file is empty.");
  }

  const lines = splitLines(text);
  const selectedSections = new Set(
    (Array.isArray(sectionIds) ? sectionIds : String(sectionIds).split(","))
      .map((id) => String(id).trim())
      .filter(Boolean),
  );
  const builders = [];
  const records = [];
  const ranges = [];
  let activeRange = null;
  let activeBuilder = null;
  let languageFontBuilder = null;
  let versionValue = "";

  const createBuilder = (name, kind, included = true) => {
    const definition = getSectionDefinition(name, kind);
    const builder = {
      name: definition.name,
      columns: definition.columns,
      rows: [],
      ranges: [],
      included,
      kind,
      index: builders.length,
    };
    builders.push(builder);
    return builder;
  };

  const pushRecord = (record, row) => {
    record.rowBuilder = activeBuilder;
    record.rowIndex = activeBuilder.rows.length - 1;
    records.push(record);
  };

  for (let index = 0; index < lines.length;) {
    const sourceLine = lines[index].text;
    const line = index === 0 ? sourceLine.replace(/^\uFEFF/u, "") : sourceLine;
    const heading = line.match(/^\s*\[([^\[\]\r\n]+)\]\s*$/u);

    if (heading) {
      const sourceName = heading[1].trim();
      if (sourceName.toLocaleUpperCase() === "CHOICES" && activeRange?.isMap) {
        index += 1;
        continue;
      }

      if (activeRange) activeRange.endLine = index - 1;
      const upperName = sourceName.toLocaleUpperCase();
      let kind = "entries";
      let included = selectedSections.size === 0 || selectedSections.has(sourceName);
      if (upperName === "VERSION") {
        kind = "version";
        included = true;
        languageFontBuilder = null;
        activeBuilder = createBuilder(null, kind);
      } else if (upperName === "LANGUAGE") {
        kind = "language-font";
        included = true;
        languageFontBuilder = createBuilder(null, kind);
        activeBuilder = languageFontBuilder;
      } else if (upperName === "FONT" && languageFontBuilder) {
        kind = "language-font";
        included = true;
        activeBuilder = languageFontBuilder;
      } else {
        languageFontBuilder = null;
        if (upperName === "CREDITS") {
          kind = "credits";
          included = true;
        }
        activeBuilder = createBuilder(sourceName, kind, included);
      }

      activeRange = {
        sourceName,
        startLine: index,
        endLine: null,
        isMap: sourceName.toLocaleLowerCase().endsWith(".json"),
        builder: activeBuilder,
      };
      activeBuilder.ranges.push(activeRange);
      ranges.push(activeRange);
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (!activeRange || !activeBuilder) {
      throw lineError(index, "Data appears before the first section.");
    }

    if (activeBuilder.kind === "version") {
      const parsedVersion = parseVersionLine(line);
      versionValue = line;
      const row = { key: "Version", fields: ["Version", line], sourceLine: index + 1 };
      activeBuilder.rows.push(row);
      pushRecord({
        type: "version",
        startLine: index,
        endLine: index,
        valueIndex: 1,
        originalValue: line,
      }, row);
      activeBuilder.version = parsedVersion;
      index += 1;
      continue;
    }

    if (activeBuilder.kind === "language-font") {
      if (activeRange.sourceName.toLocaleUpperCase() === "LANGUAGE") {
        if (line.includes(":")) {
          throw lineError(index, "The LANGUAGE section must contain a plain language name.");
        }
        let row = activeBuilder.rows[0];
        if (!row) {
          row = { key: line, fields: [line, "", ""], sourceLine: index + 1 };
          activeBuilder.rows.push(row);
        } else {
          row.fields[0] = line;
          row.key = line;
        }
        pushRecord({
          type: "bare",
          startLine: index,
          endLine: index,
          valueIndex: 0,
          originalValue: line,
        }, row);
      } else {
        const keyValue = parseKeyValue(line, index);
        const column = keyValue.key.toLocaleLowerCase() === "file"
          ? 1
          : keyValue.key.toLocaleLowerCase() === "size"
            ? 2
            : -1;
        if (column < 0) {
          throw lineError(index, `The FONT key "${keyValue.key}" is not supported.`);
        }
        let row = activeBuilder.rows[0];
        if (!row) {
          row = { key: "", fields: ["", "", ""], sourceLine: index + 1 };
          activeBuilder.rows.push(row);
        }
        row.fields[column] = keyValue.value;
        pushRecord({
          type: "key-value",
          startLine: index,
          endLine: index,
          valueIndex: column,
          keyIndex: null,
          prefix: keyValue.prefix,
          originalKey: keyValue.key,
          originalValue: keyValue.value,
        }, row);
      }
      index += 1;
      continue;
    }

    const dialogue = line.match(/^#(.+?)\s+\((.*)\)\s*$/u);
    if (dialogue) {
      const id = dialogue[1].trim();
      const source = dialogue[2].trim();
      const continuationLines = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex].text;
        if (!nextLine.trim()
          || /^\s*\[[^\[\]]+\]\s*$/u.test(nextLine)
          || /^#.+?\s+\(.*\)\s*$/u.test(nextLine)
          || /^#.+?:/u.test(nextLine)) {
          break;
        }
        const continuation = nextLine.match(/^:(?:[ \t]?)(.*)$/u);
        const colonIndex = nextLine.indexOf(":");
        continuationLines.push({
          lineIndex: nextIndex,
          value: continuation ? continuation[1] : nextLine,
          prefix: continuation
            ? nextLine.slice(0, colonIndex + 1)
              + (nextLine[colonIndex + 1] === " " ? " " : "")
            : "",
        });
        nextIndex += 1;
      }
      const translation = continuationLines.map(({ value }) => value).join("\n");
      const fields = [id, source, "", translation];
      const row = { key: id, fields, sourceLine: index + 1 };
      activeBuilder.rows.push(row);
      const endLine = continuationLines.at(-1)?.lineIndex ?? index;
      pushRecord({
        type: "dialogue",
        startLine: index,
        endLine,
        idIndex: 0,
        sourceIndex: 1,
        valueIndex: 3,
        originalId: id,
        originalSource: source,
        originalValue: translation,
        rawHeader: sourceLine,
        continuationLines,
      }, row);
      index = endLine + 1;
      continue;
    }

    const hashKeyValue = line.startsWith("#");
    const keyValue = parseKeyValue(hashKeyValue ? line.slice(1) : line, index);
    const id = keyValue.key.trim();
    if (!id) throw lineError(index, "An entry identifier cannot be empty.");

    let fields;
    const keyIndex = 0;
    let valueIndex;
    if (activeBuilder.kind === "credits") {
      fields = [id, keyValue.value];
      valueIndex = 1;
    } else if (activeRange.isMap) {
      fields = [id, "", "", keyValue.value];
      valueIndex = 3;
    } else if (activeRange.sourceName.toLocaleUpperCase() === "DESCRIPTIONS") {
      fields = [id, id, "", keyValue.value];
      valueIndex = 3;
    } else {
      fields = [id, "", keyValue.value];
      valueIndex = 2;
    }
    const row = { key: id, fields, sourceLine: index + 1 };
    activeBuilder.rows.push(row);
    pushRecord({
      type: "key-value",
      startLine: index,
      endLine: index,
      keyIndex,
      valueIndex,
      originalKey: id,
      originalValue: keyValue.value,
      prefix: `${hashKeyValue ? "#" : ""}${keyValue.prefix}`,
    }, row);
    if (activeBuilder.kind === "version") {
      versionValue = line;
    }
    index += 1;
  }

  if (activeRange) activeRange.endLine = lines.length - 1;
  const version = builders.find(({ kind }) => kind === "version")?.version;
  if (!version || !versionValue) {
    throw new TxtFormatError("The TXT file must contain a valid [VERSION] section.");
  }
  if (!SUPPORTED_MAJORS.has(version.major)) {
    throw new TxtFormatError(`TCOAAL version ${version.text} is not supported by the TXT format.`);
  }

  const documentSections = builders
    .filter(({ included }) => included)
    .map(({ name, columns, rows }) => ({ name, columns, rows }));
  const document = new LocalisationDocument({
    formatId: "txt",
    version,
    sections: documentSections,
    sectionIds: [...selectedSections],
    readonly: false,
    encoding,
    hasByteOrderMark,
  });

  const documentBuilderIndexes = new Map();
  let modelIndex = 0;
  for (const builder of builders) {
    if (!builder.included) continue;
    documentBuilderIndexes.set(builder.index, modelIndex);
    builder.documentIndex = modelIndex;
    modelIndex += 1;
  }
  for (const record of records) {
    const recordDocumentIndex = documentBuilderIndexes.get(record.rowBuilder.index);
    record.row = recordDocumentIndex === undefined
      ? null
      : document.sections[recordDocumentIndex].rows[record.rowIndex];
  }

  const recordsByStart = new Map(
    records.filter(({ row }) => row).map((record) => [record.startLine, record]),
  );
  documentStates.set(document, {
    lines,
    records,
    recordsByStart,
    ranges,
    builders,
    defaultLineEnding: lines.find(({ lineEnding }) => lineEnding)?.lineEnding ?? "\n",
    sectionGroups: builders
      .filter(({ included }) => included)
      .map((builder) => ({ ranges: builder.ranges })),
  });
  return document;
}

export const txtFormat = Object.freeze({
  id: "txt",
  name: "TXT",
  extensions: [".txt"],
  readonly: false,
  detect(input) {
    if (typeof input !== "string") return false;
    const firstLine = input.slice(0, input.search(/[\r\n]/u) < 0
      ? input.length
      : input.search(/[\r\n]/u));
    return /^\uFEFF?\s*\[VERSION\]\s*$/u.test(firstLine);
  },
  parse: parseTxtLocalisation,
  serialize(document) {
    const state = getState(document);
    return renderLines(state, 0, state.lines.length - 1).map(({ text, lineEnding }) => text + lineEnding).join("");
  },
  serializeSection(document, sectionIndex) {
    const state = getState(document);
    const group = state.sectionGroups[sectionIndex];
    if (!group) throw new RangeError(`Section index ${sectionIndex} does not exist.`);
    const versionRange = state.ranges.find(({ sourceName }) =>
      sourceName.toLocaleUpperCase() === "VERSION");
    if (!versionRange) throw new TxtFormatError("The TXT file has no [VERSION] section to export.");
    const selectedRanges = [...new Set([versionRange, ...group.ranges])]
      .sort((left, right) => left.startLine - right.startLine);
    return selectedRanges
      .map((range) => renderLines(state, range.startLine, range.endLine)
        .map(({ text, lineEnding }) => text + lineEnding).join(""))
      .join("");
  },
  replaceSection(document, sectionIndex, sourceDocument, sourceSectionIndex) {
    const targetState = getState(document);
    const sourceState = getState(sourceDocument);
    const targetGroup = targetState.sectionGroups[sectionIndex];
    const sourceGroup = sourceState.sectionGroups[sourceSectionIndex];
    const targetSection = document.sections[sectionIndex];
    const sourceSection = sourceDocument.sections[sourceSectionIndex];
    if (!targetGroup || !sourceGroup || !targetSection || !sourceSection) {
      throw new RangeError("The selected TXT section does not exist.");
    }
    if (targetSection.name !== sourceSection.name
      || targetSection.columns.length !== sourceSection.columns.length
      || targetSection.columns.some((column, index) => column !== sourceSection.columns[index])) {
      throw new TxtFormatError("The selected TXT sections have different names or columns.");
    }

    const currentText = txtFormat.serialize(document);
    const reparsedDocument = parseTxtLocalisation(currentText, {
      sectionIds: [...document.sectionIds],
      encoding: document.encoding,
      hasByteOrderMark: document.hasByteOrderMark,
    });
    const reparsedState = getState(reparsedDocument);
    const reparsedGroup = reparsedState.sectionGroups[sectionIndex];
    const sourceRange = getCombinedRange(sourceGroup.ranges);
    const targetRange = getCombinedRange(reparsedGroup.ranges);
    if (!sourceRange || !targetRange) {
      throw new TxtFormatError("The selected TXT section has no source text to replace.");
    }

    const replacement = renderLines(sourceState, sourceRange.startLine, sourceRange.endLine);
    const updatedLines = [
      ...reparsedState.lines.slice(0, targetRange.startLine),
      ...replacement,
      ...reparsedState.lines.slice(targetRange.endLine + 1),
    ];
    const updatedText = updatedLines.map(({ text, lineEnding }) => text + lineEnding).join("");
    return parseTxtLocalisation(updatedText, {
      sectionIds: [...document.sectionIds],
      encoding: document.encoding,
      hasByteOrderMark: document.hasByteOrderMark,
    });
  },
});

function getSectionDefinition(sourceName, kind) {
  if (kind === "version") {
    return { name: null, columns: ["ID", "Version"] };
  }
  if (kind === "language-font") {
    return { name: null, columns: ["Language", "Font File", "Font Size"] };
  }
  if (kind === "credits") {
    return { name: null, columns: ["ID", "Credits"] };
  }
  const upperName = sourceName.toLocaleUpperCase();
  const displayNames = {
    LABELS: "Labels",
    MENUS: "Menus",
    SPEAKERS: "Speakers",
    ITEMS: "Items",
    DESCRIPTIONS: "Descriptions",
  };
  if (upperName === "DESCRIPTIONS") {
    return { name: "Descriptions", columns: ["ID", "Item", "English", "Translation"] };
  }
  if (upperName === "SPEAKERS") {
    return { name: "Speakers", columns: ["ID", "English", "Translation"] };
  }
  if (upperName === "ITEMS") {
    return { name: "Items", columns: ["ID", "English", "Translation"] };
  }
  if (sourceName.toLocaleLowerCase().endsWith(".json")) {
    return { name: sourceName, columns: ["ID", "Source", "English", "Translation"] };
  }
  return {
    name: displayNames[upperName] ?? sourceName,
    columns: ["ID", "English", "Translation"],
  };
}

function parseVersionLine(line) {
  const match = line.match(/^\s*(\d+)\.(\d+)\.(\d+)(?:\s|:|$)/u);
  if (!match) throw new TxtFormatError("The TXT [VERSION] section does not contain a valid TCOAAL version.");
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    text: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

function parseKeyValue(line, lineIndex) {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 1) {
    throw lineError(lineIndex, "Expected a key and value separated by a colon.");
  }
  const valueStart = colonIndex + 1 + (line[colonIndex + 1] === " " || line[colonIndex + 1] === "\t" ? 1 : 0);
  const key = line.slice(0, colonIndex).trim();
  if (!key) throw lineError(lineIndex, "An entry identifier cannot be empty.");
  return {
    key,
    value: line.slice(valueStart),
    prefix: line.slice(0, valueStart),
  };
}

function splitLines(text) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\r" && text[index] !== "\n") continue;
    let lineEnding = text[index];
    if (text[index] === "\r" && text[index + 1] === "\n") {
      lineEnding = "\r\n";
      index += 1;
    }
    lines.push({ text: text.slice(start, index - lineEnding.length + 1), lineEnding });
    start = index + 1;
  }
  if (start < text.length) lines.push({ text: text.slice(start), lineEnding: "" });
  return lines;
}

function lineError(lineIndex, message) {
  return new TxtFormatError(`${message} (line ${lineIndex + 1}).`);
}

function getState(document) {
  if (!(document instanceof LocalisationDocument) || document.formatId !== "txt") {
    throw new TypeError("The TXT format can only operate on a TXT localisation document.");
  }
  const state = documentStates.get(document);
  if (!state) throw new TxtFormatError("The original TXT localisation data is unavailable.");
  return state;
}

function renderLines(state, startLine, endLine) {
  const output = [];
  for (let index = startLine; index <= endLine;) {
    const record = state.recordsByStart.get(index);
    if (!record || !isRecordChanged(record)) {
      output.push(state.lines[index]);
      index += 1;
      continue;
    }
    const replacement = renderRecord(record, state);
    output.push(...replacement);
    index = record.endLine + 1;
  }
  return output;
}

function isRecordChanged(record) {
  if (!record.row) return false;
  if (record.type === "dialogue") {
    return record.row.fields[record.idIndex] !== record.originalId
      || record.row.fields[record.sourceIndex] !== record.originalSource
      || record.row.fields[record.valueIndex] !== record.originalValue;
  }
  return record.row.fields[record.valueIndex] !== record.originalValue
    || (record.keyIndex !== null && record.row.fields[record.keyIndex] !== record.originalKey);
}

function renderRecord(record, state) {
  const row = record.row;
  if (record.type === "dialogue") {
    const id = validateLineValue(row.fields[record.idIndex], "entry identifier");
    const source = validateLineValue(row.fields[record.sourceIndex], "source tag");
    const header = id === record.originalId && source === record.originalSource
      ? record.rawHeader
      : `#${id} (${source})`;
    const translation = row.fields[record.valueIndex] ?? "";
    const continuationLines = translation.split("\n");
    const originalContinuationLines = record.continuationLines;
    const rendered = [{
      text: header,
      lineEnding: state.lines[record.startLine].lineEnding
        || (continuationLines.length ? state.defaultLineEnding : ""),
    }];
    continuationLines.forEach((value, index) => {
      const original = originalContinuationLines[index];
      const lineIndex = original?.lineIndex ?? record.endLine;
      const prefix = original?.prefix || ": ";
      const lineEnding = index === continuationLines.length - 1
        ? state.lines[record.endLine].lineEnding
        : state.lines[lineIndex]?.lineEnding || state.defaultLineEnding;
      rendered.push({ text: `${prefix}${value}`, lineEnding });
    });
    return rendered;
  }

  const value = row.fields[record.valueIndex] ?? "";
  validateLineValue(value, "entry value");
  const lineEnding = state.lines[record.startLine].lineEnding;
  if (record.type === "bare") {
    return [{ text: value, lineEnding }];
  }
  if (record.type === "version") {
    return [{ text: value, lineEnding }];
  }
  const key = record.keyIndex === null
    ? record.originalKey
    : validateLineValue(row.fields[record.keyIndex] ?? "", "entry identifier");
  const prefix = key === record.originalKey
    ? record.prefix
    : `${record.prefix.startsWith("#") ? "#" : ""}${key} : `;
  return [{ text: `${prefix}${value}`, lineEnding }];
}

function validateLineValue(value, label) {
  if (typeof value !== "string" || /[\r\n]/u.test(value)) {
    throw new TxtFormatError(`A TXT ${label} cannot contain a line break.`);
  }
  return value;
}

function getCombinedRange(ranges) {
  if (!ranges.length) return null;
  return {
    startLine: Math.min(...ranges.map(({ startLine }) => startLine)),
    endLine: Math.max(...ranges.map(({ endLine }) => endLine)),
  };
}
