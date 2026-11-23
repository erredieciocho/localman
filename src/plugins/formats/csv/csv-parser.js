export class CsvParseError extends Error {
  constructor(message, line) {
    super(`${message} (line ${line})`);
    this.name = "CsvParseError";
    this.line = line;
  }
}

export function parseCsvRecords(text, { delimiter = ",", quote = '"' } = {}) {
  if (typeof text !== "string") {
    throw new TypeError("CSV input must be a string.");
  }
  if (delimiter.length !== 1 || quote.length !== 1 || delimiter === quote) {
    throw new TypeError("CSV delimiter and quote must be distinct single characters.");
  }
  if (text.length === 0) {
    return [];
  }

  const records = [];
  let fields = [];
  let field = "";
  let raw = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let recordLine = 1;

  const finishField = () => {
    fields.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRecord = (lineEnding) => {
    finishField();
    records.push({ fields, raw, lineEnding, line: recordLine });
    fields = [];
    raw = "";
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      raw += character;
      if (character === quote) {
        if (text[index + 1] === quote) {
          raw += text[index + 1];
          field += quote;
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
        if (character === "\n") {
          line += 1;
        } else if (character === "\r" && text[index + 1] !== "\n") {
          line += 1;
        }
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        raw += character;
        finishField();
      } else if (isHorizontalWhitespace(character)) {
        raw += character;
        field += character;
      } else if (character === "\n" || character === "\r") {
        const lineEnding = character === "\r" && text[index + 1] === "\n" ? "\r\n" : character;
        if (lineEnding === "\r\n") {
          index += 1;
        }
        finishRecord(lineEnding);
        line += 1;
      } else {
        throw new CsvParseError("Unexpected character after a closing quote", line);
      }
      continue;
    }

    if (character === quote) {
      if (field.length !== 0) {
        throw new CsvParseError("Unexpected quote in an unquoted field", line);
      }
      raw += character;
      quoted = true;
    } else if (character === delimiter) {
      raw += character;
      finishField();
    } else if (character === "\n" || character === "\r") {
      const lineEnding = character === "\r" && text[index + 1] === "\n" ? "\r\n" : character;
      if (lineEnding === "\r\n") {
        index += 1;
      }
      finishRecord(lineEnding);
      line += 1;
    } else {
      field += character;
      raw += character;
    }
  }

  if (quoted) {
    throw new CsvParseError("Unterminated quoted field", line);
  }
  if (raw.length > 0 || field.length > 0 || fields.length > 0 || afterQuote) {
    finishField();
    records.push({ fields, raw, lineEnding: "", line: recordLine });
  }

  return records;
}

function isHorizontalWhitespace(character) {
  return /[\t\v\f \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/u.test(character);
}

export function serializeCsvRecord(fields, { delimiter = ",", quote = '"' } = {}) {
  if (!Array.isArray(fields)) {
    throw new TypeError("CSV record fields must be an array.");
  }

  return fields.map((value) => {
    const text = String(value ?? "");
    if (text.includes(delimiter) || text.includes(quote) || /[\r\n]/u.test(text) || text.trim() !== text) {
      return `${quote}${text.replaceAll(quote, quote + quote)}${quote}`;
    }
    return text;
  }).join(delimiter);
}
