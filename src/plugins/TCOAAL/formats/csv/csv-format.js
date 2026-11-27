import { LocalisationDocument } from "../../../../core/document/index.js";
import {
  parseCsvLocalisation,
  replaceCsvSection,
  serializeCsvLocalisation,
  serializeCsvSection,
} from "./csv-document.js";

export function parseLocalisation(text, options) {
  return parseCsvLocalisation(text, options);
}

export const csvFormat = Object.freeze({
  id: "csv",
  name: "CSV",
  extensions: [".csv"],
  readonly: false,
  detect(input) {
    if (typeof input !== "string") {
      return false;
    }
    const newlineIndex = input.search(/[\r\n]/u);
    const firstLine = newlineIndex < 0 ? input : input.slice(0, newlineIndex);
    return /^\uFEFF?\s*(?:Version|"Version")\s*(?:,|$)/u.test(firstLine);
  },
  parse: parseLocalisation,
  serialize(document) {
    if (!(document instanceof LocalisationDocument)) {
      throw new TypeError("The CSV format can only serialize a CSV localisation document.");
    }
    return serializeCsvLocalisation(document);
  },
  serializeSection(document, sectionIndex) {
    if (!(document instanceof LocalisationDocument)) {
      throw new TypeError("The CSV format can only export a section from a CSV localisation document.");
    }
    return serializeCsvSection(document, sectionIndex);
  },
  replaceSection(document, sectionIndex, sourceDocument, sourceSectionIndex) {
    if (!(document instanceof LocalisationDocument) || !(sourceDocument instanceof LocalisationDocument)) {
      throw new TypeError("The CSV format can only replace sections between CSV localisation documents.");
    }
    return replaceCsvSection(document, sectionIndex, sourceDocument, sourceSectionIndex);
  },
});
