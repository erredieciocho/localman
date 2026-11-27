import { LocalisationDocument } from "../../../../core/document/index.js";

const MAGIC = "LANGDATA";
const SUPPORTED_MAJORS = new Set([1, 2, 3]);
const TRANSLATION_TABLES = [
  ["sysLabel", "strings"],
  ["sysMenus", "strings"],
  ["labelLUT", "strings"],
  ["linesLUT", "stringArrays"],
];

export class CldFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "CldFormatError";
  }
}

export function parseCldLocalisation(text, {
  sectionIds = "",
  encoding = "utf-8",
  hasByteOrderMark = text?.startsWith("\uFEFF") ?? false,
} = {}) {
  if (typeof text !== "string" || text.length === 0) {
    throw new CldFormatError("The localisation file is empty.");
  }

  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const content = bom ? text.slice(1) : text;
  if (!content.startsWith(MAGIC)) {
    throw new CldFormatError("The file does not have a valid CLD header.");
  }

  let data;
  try {
    data = JSON.parse(content.slice(MAGIC.length));
  } catch (error) {
    throw new CldFormatError(`The CLD payload is not valid JSON: ${error.message}`);
  }

  if (!isRecord(data) || typeof data.langVers !== "string" || typeof data.langName !== "string") {
    throw new CldFormatError("The CLD payload must include language version and name metadata.");
  }
  const versionMatch = data.langVers.match(/^(\d+)\.(\d+)\.(\d+)(?:\s|$)/u);
  if (!versionMatch) {
    throw new CldFormatError("The CLD file does not contain a valid TCOAAL version.");
  }
  const version = {
    major: Number(versionMatch[1]),
    minor: Number(versionMatch[2]),
    patch: Number(versionMatch[3]),
    text: versionMatch[0].trim(),
  };
  if (!SUPPORTED_MAJORS.has(version.major)) {
    throw new CldFormatError(`TCOAAL version ${version.text} is not supported.`);
  }
  if (data.langInfo !== undefined
    && (!Array.isArray(data.langInfo) || data.langInfo.some((entry) => typeof entry !== "string"))) {
    throw new CldFormatError("The CLD language information must be an array of strings.");
  }
  if (data.fontFace !== undefined && typeof data.fontFace !== "string") {
    throw new CldFormatError("The CLD font face must be a string.");
  }
  if (data.fontSize !== undefined && (typeof data.fontSize !== "number" || !Number.isFinite(data.fontSize))) {
    throw new CldFormatError("The CLD font size must be a finite number.");
  }
  if (data.fontFile !== undefined && data.fontFile !== null && typeof data.fontFile !== "string") {
    throw new CldFormatError("The CLD font file must be a string or null.");
  }
  if (data.imgFiles !== undefined) validateStringRecord(data.imgFiles, "image files");

  let hasTranslationTable = false;
  for (const [name, shape] of TRANSLATION_TABLES) {
    if (data[name] === undefined) continue;
    hasTranslationTable = true;
    if (shape === "strings") validateStringRecord(data[name], name);
    else validateStringArrayRecord(data[name], name);
  }
  if (!hasTranslationTable) {
    throw new CldFormatError("The CLD payload does not contain any supported translation tables.");
  }

  const selectedSections = new Set(
    (Array.isArray(sectionIds) ? sectionIds : String(sectionIds).split(","))
      .map((id) => String(id).trim())
      .filter(Boolean),
  );
  const sections = [];
  const addSection = (name, columns, entries) => {
    if (selectedSections.size > 0 && !selectedSections.has(name)) return;
    const section = {
      name,
      columns,
      rows: entries.map(([key, fields]) => ({ key, fields })),
    };
    sections.push(section);
  };

  addSection("langName", ["ID", "Language"], [["langName", ["langName", data.langName]]]);
  if (data.langInfo) {
    addSection("langInfo", ["ID", "Credits"],
      data.langInfo.map((entry, index) => [String(index + 1), [String(index + 1), entry]]));
  }
  for (const [name, shape] of TRANSLATION_TABLES) {
    const table = data[name];
    if (!table) continue;
    const entries = [];
    for (const [id, value] of Object.entries(table)) {
      if (shape === "stringArrays") {
        value.forEach((part) => entries.push([id, [id, "", part]]));
      } else {
        entries.push([id, [id, "", value]]);
      }
    }
    addSection(name, ["ID", "Source", "Translation"], entries);
  }

  const document = new LocalisationDocument({
    formatId: "cld",
    version,
    sections,
    sectionIds: [...selectedSections],
    readonly: true,
    encoding,
    hasByteOrderMark,
  });
  return document;
}

export const cldFormat = Object.freeze({
  id: "cld",
  name: "CLD",
  extensions: [".cld"],
  readonly: true,
  detect(input) {
    if (typeof input !== "string") return false;
    return (input.startsWith("\uFEFF") ? input.slice(1) : input).startsWith(MAGIC);
  },
  parse: parseCldLocalisation,
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStringRecord(value, name) {
  if (!isRecord(value)
    || Object.entries(value).some(([key, item]) => !key || typeof item !== "string")) {
    throw new CldFormatError(`The CLD ${name} table must map identifiers to strings.`);
  }
}

function validateStringArrayRecord(value, name) {
  if (!isRecord(value)
    || Object.entries(value).some(([key, items]) =>
      !key || !Array.isArray(items) || items.some((item) => typeof item !== "string"))) {
    throw new CldFormatError(`The CLD ${name} table must map identifiers to arrays of strings.`);
  }
}
