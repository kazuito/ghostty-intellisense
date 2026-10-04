import { CONFIG_COMMENT_PREFIX, CONFIG_KEY_VALUE_SEPARATOR } from "./constants";

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type ParsedLine =
  | { type: "blank" }
  | { type: "comment"; raw: string }
  | {
      type: "entry";
      key: string;
      /** Raw value string — everything after "=" without trimming. */
      rawValue: string;
      raw: string;
      eqIndex: number;
    }
  /** A line without a usable `=`; `key` is the trimmed line, e.g. a bare key. */
  | { type: "unknown"; key: string; raw: string };

type LineInfo = { line: number; raw: string; lineRange: Range };

export type ParsedDocumentLine =
  | (LineInfo & { type: "blank" | "comment" })
  | (LineInfo & { type: "unknown"; key: string; keyRange: Range })
  | (LineInfo &
      Extract<ParsedLine, { type: "entry" }> & {
        keyRange: Range;
        valueRange: Range;
      });

export function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trimStart();
  if (trimmed === "") return { type: "blank" };
  if (trimmed.startsWith(CONFIG_COMMENT_PREFIX))
    return { type: "comment", raw };

  const eqIndex = raw.indexOf(CONFIG_KEY_VALUE_SEPARATOR);
  const key = eqIndex < 0 ? "" : raw.slice(0, eqIndex).trim();
  if (!key) return { type: "unknown", key: raw.trim(), raw };

  return { type: "entry", key, rawValue: raw.slice(eqIndex + 1), raw, eqIndex };
}

export function rangeOf(line: number, start: number, length: number): Range {
  return {
    start: { line, character: start },
    end: { line, character: start + length },
  };
}

export function parseDocumentLine(
  raw: string,
  line: number,
): ParsedDocumentLine {
  const parsed = parseLine(raw);
  const lineRange = rangeOf(line, 0, raw.length);

  if (parsed.type === "blank" || parsed.type === "comment") {
    return { type: parsed.type, line, raw, lineRange };
  }

  const keyRange = rangeOf(line, raw.indexOf(parsed.key), parsed.key.length);
  if (parsed.type === "unknown") {
    return { ...parsed, line, lineRange, keyRange };
  }

  const value = parsed.rawValue.trim();
  const valueStart = value
    ? raw.indexOf(value, parsed.eqIndex + 1)
    : parsed.eqIndex + 1;

  return {
    ...parsed,
    line,
    lineRange,
    keyRange,
    valueRange: rangeOf(line, valueStart, value.length),
  };
}

export function parseDocument(text: string): ParsedDocumentLine[] {
  return text.split("\n").map((raw, line) => parseDocumentLine(raw, line));
}
