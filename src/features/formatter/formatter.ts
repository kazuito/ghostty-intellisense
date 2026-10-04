import { CONFIG_KEY_VALUE_SEPARATOR } from "@/core/constants";
import { type ParsedLine, parseLine } from "@/core/document";
import { optionByKey } from "@/core/schema";

export interface FormatterOptions {
  /** Spacing around "=". "space" → `key = value`; "no-space" → `key=value`; "preserve" → leave as-is. */
  equalSpacing: "space" | "no-space" | "preserve";
  /** How to handle runs of consecutive blank lines. */
  blankLines: "collapse" | "preserve";
  /** Case normalization applied to hex color digits. */
  colorCase: "uppercase" | "lowercase" | "preserve";
  /** Whether to ensure hex colors are prefixed with "#". */
  colorAddPrefix: boolean;
  /** Case normalization for boolean literals. */
  booleanCase: "lowercase" | "preserve";
  /** Spacing after commas in comma-separated values. */
  commaSpacing: "space" | "no-space" | "preserve";
  /** Remove leading and trailing whitespace from config lines. */
  trimWhitespace: boolean;
}

export const DEFAULT_FORMATTER_OPTIONS: FormatterOptions = {
  equalSpacing: "space",
  blankLines: "collapse",
  colorCase: "uppercase",
  colorAddPrefix: true,
  booleanCase: "lowercase",
  commaSpacing: "space",
  trimWhitespace: true,
};

const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;

export function isHexColor(token: string): boolean {
  return HEX_RE.test(token);
}

export function formatColor(token: string, opts: FormatterOptions): string {
  if (!isHexColor(token)) return token;
  const bare = token.startsWith("#") ? token.slice(1) : token;
  const cased =
    opts.colorCase === "uppercase"
      ? bare.toUpperCase()
      : opts.colorCase === "lowercase"
        ? bare.toLowerCase()
        : bare;
  return opts.colorAddPrefix ? `#${cased}` : cased;
}

export function formatBoolean(token: string, opts: FormatterOptions): string {
  if (opts.booleanCase === "preserve") return token;
  const lower = token.toLowerCase();
  if (lower === "true") return "true";
  if (lower === "false") return "false";
  return token;
}

export function formatCommaSeparated(
  value: string,
  opts: FormatterOptions,
  tokenFormatter: (token: string) => string,
): string {
  if (opts.commaSpacing === "preserve") {
    return value.replace(/[^,]+/g, (segment) => {
      const trimmed = segment.trim();
      const leading = segment.match(/^(\s*)/)?.[1] ?? "";
      const trailing = segment.match(/(\s*)$/)?.[1] ?? "";
      return `${leading}${tokenFormatter(trimmed)}${trailing}`;
    });
  }
  const sep = opts.commaSpacing === "no-space" ? "," : ", ";
  return value
    .split(/\s*,\s*/)
    .map((t) => tokenFormatter(t.trim()))
    .join(sep);
}

/** Handles the palette special case: value is `<index>=<color>`. */
export function formatPaletteValue(
  value: string,
  opts: FormatterOptions,
): string {
  const innerEq = value.indexOf(CONFIG_KEY_VALUE_SEPARATOR);
  if (innerEq < 0) return value;
  const prefix = value.slice(0, innerEq + 1);
  const color = value.slice(innerEq + 1);
  return prefix + formatColor(color, opts);
}

export function formatValue(
  key: string,
  rawValue: string,
  opts: FormatterOptions,
): string {
  const value = rawValue.trim();
  if (value === "") return value;

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value;
  }

  if (key === "palette") return formatPaletteValue(value, opts);

  const option = optionByKey.get(key);
  if (!option) return value;

  const formatToken = option.assets?.includes("color")
    ? (token: string) => formatColor(token, opts)
    : (token: string) => formatBoolean(token, opts);
  return option.comma
    ? formatCommaSeparated(value, opts, formatToken)
    : formatToken(value);
}

export function formatLine(parsed: ParsedLine, opts: FormatterOptions): string {
  if (parsed.type === "blank") return "";
  if (parsed.type === "comment") return parsed.raw;

  if (parsed.type === "unknown") {
    return opts.trimWhitespace ? parsed.raw.trim() : parsed.raw;
  }

  const { key, rawValue, raw, eqIndex } = parsed;
  const value = formatValue(key, rawValue, opts);

  if (opts.equalSpacing === "preserve") {
    const lhsRaw = raw.slice(0, eqIndex);
    const rhsRaw = raw.slice(eqIndex + 1);
    const rhsLeading = rhsRaw.match(/^(\s*)/)?.[1] ?? "";
    const line = `${lhsRaw}=${rhsLeading}${value}`;
    return opts.trimWhitespace ? line.trim() : line;
  }

  if (opts.equalSpacing === "no-space") return `${key}=${value}`;
  return value === "" ? `${key} =` : `${key} = ${value}`;
}

/**
 * Detects the document's line-ending style from its first line break
 * (mirrors Prettier's `endOfLine: "auto"`), so mixed-EOL input is normalized
 * to one consistent style instead of leaking `\r` into parsed line content.
 */
function detectEol(text: string): "\n" | "\r\n" {
  const index = text.indexOf("\n");
  return index > 0 && text[index - 1] === "\r" ? "\r\n" : "\n";
}

export function formatDocument(text: string, opts: FormatterOptions): string {
  const eol = detectEol(text);
  const hadTrailingNewline = /\r?\n$/.test(text);
  const lines = text.split(/\r\n|\n/);

  if (hadTrailingNewline && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const out: string[] = [];
  let consecutiveBlanks = 0;

  for (const raw of lines) {
    const parsed = parseLine(raw);
    const formatted = formatLine(parsed, opts);

    if (parsed.type === "blank") {
      if (opts.blankLines === "preserve" || consecutiveBlanks === 0) {
        out.push(formatted);
        consecutiveBlanks++;
      }
    } else {
      consecutiveBlanks = 0;
      out.push(formatted);
    }
  }

  const result = out.join(eol);
  return hadTrailingNewline ? `${result}${eol}` : result;
}
