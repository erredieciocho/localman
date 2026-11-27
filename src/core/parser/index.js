export class ParserRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParserRegistryError";
  }
}

export class UnsupportedFormatError extends ParserRegistryError {
  constructor() {
    super("No registered format recognizes the input.");
    this.name = "UnsupportedFormatError";
  }
}

export class AmbiguousFormatError extends ParserRegistryError {
  constructor(formatIds) {
    super(`More than one registered format recognizes the input: ${formatIds.join(", ")}.`);
    this.name = "AmbiguousFormatError";
    this.formatIds = formatIds;
  }
}

export class ReadOnlyFormatError extends ParserRegistryError {
  constructor(formatName) {
    super(`${formatName} localisation files are read-only and cannot be changed or exported.`);
    this.name = "ReadOnlyFormatError";
  }
}

export function createParserRegistry(formats = []) {
  if (!Array.isArray(formats)) {
    throw new TypeError("Parser formats must be provided as an array.");
  }

  const formatsById = new Map();
  const sourceInputs = new WeakMap();
  for (const format of formats) {
    if (!format || typeof format !== "object"
      || typeof format.id !== "string" || !format.id.trim()
      || typeof format.name !== "string" || !format.name.trim()
      || !Array.isArray(format.extensions)
      || typeof format.detect !== "function"
      || typeof format.parse !== "function"
      || (format.readonly !== undefined && typeof format.readonly !== "boolean")
      || (!format.readonly && typeof format.serialize !== "function")
      || (format.readonly && format.serialize !== undefined)
      || (format.serializeSection !== undefined && typeof format.serializeSection !== "function")
      || (format.replaceSection !== undefined && typeof format.replaceSection !== "function")) {
      throw new TypeError("Each parser format must define an id, name, extensions, detect and parse; editable formats must also define serialization.");
    }
    if (formatsById.has(format.id)) {
      throw new ParserRegistryError(`Parser format "${format.id}" is registered more than once.`);
    }
    formatsById.set(format.id, format);
  }

  function getFormat(document) {
    const formatId = document?.formatId;
    const format = formatsById.get(formatId);
    if (!format) {
      throw new ParserRegistryError(
        `No registered format can serialize document format "${formatId ?? "unknown"}".`,
      );
    }
    return format;
  }

  function parse(input, options) {
    if (typeof input !== "string") {
      throw new TypeError("Parser input must be a string.");
    }
    const matches = [];
    for (const format of formatsById.values()) {
      const recognized = format.detect(input);
      if (typeof recognized !== "boolean") {
        throw new ParserRegistryError(`Parser format "${format.id}" must return a boolean from detect().`);
      }
      if (recognized) matches.push(format);
    }
    if (matches.length === 0) {
      throw new UnsupportedFormatError();
    }
    if (matches.length > 1) {
      throw new AmbiguousFormatError(matches.map(({ id }) => id));
    }
    const format = matches[0];
    const document = format.parse(input, options);
    if (!document || typeof document !== "object" || document.formatId !== format.id) {
      throw new ParserRegistryError(
        `Parser format "${format.id}" must return a document with the matching formatId.`,
      );
    }
    if (Boolean(format.readonly) !== Boolean(document.readonly)) {
      throw new ParserRegistryError(
        `Parser format "${format.id}" must return a document with matching read-only metadata.`,
      );
    }
    sourceInputs.set(document, input);
    return document;
  }

  function requireEditable(format) {
    if (format.readonly) throw new ReadOnlyFormatError(format.name);
  }

  return Object.freeze({
    parse,
    reparse(document, options) {
      getFormat(document);
      const input = sourceInputs.get(document);
      if (input === undefined) {
        throw new ParserRegistryError("The original localisation input is unavailable for reparsing.");
      }
      return parse(input, options);
    },
    supportsSectionOperations(document) {
      const format = getFormat(document);
      return Boolean(format.serializeSection && format.replaceSection);
    },
    serialize(document, options) {
      const format = getFormat(document);
      requireEditable(format);
      return format.serialize(document, options);
    },
    serializeSection(document, sectionIndex, options) {
      const format = getFormat(document);
      requireEditable(format);
      if (!format.serializeSection) {
        throw new ParserRegistryError(`Parser format "${format.id}" does not support section export.`);
      }
      return format.serializeSection(document, sectionIndex, options);
    },
    replaceSection(document, sectionIndex, sourceDocument, sourceSectionIndex, options) {
      const format = getFormat(document);
      requireEditable(format);
      if (sourceDocument?.formatId !== format.id || !format.replaceSection) {
        throw new ParserRegistryError(`Parser format "${format.id}" does not support this section import.`);
      }
      const replaced = format.replaceSection(document, sectionIndex, sourceDocument, sourceSectionIndex, options);
      if (!replaced || typeof replaced !== "object" || replaced.formatId !== format.id) {
        throw new ParserRegistryError(
          `Parser format "${format.id}" must return a replacement document with the matching formatId.`,
        );
      }
      return replaced;
    },
  });
}
