import { CONFIG_KEY_VALUE_SEPARATOR } from "@/core/constants";
import { parseDocument, type Range, rangeOf } from "@/core/document";
import { canonicalKey, optionByKey } from "@/core/schema";
import { ghosttyColors } from "@/generated/colors";

export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

export interface DocumentColor {
  range: Range;
  color: Rgb;
}

const namedColors = new Map(
  ghosttyColors.map((color) => [color.name.toLowerCase(), color.hex]),
);

const HEX_RE = /^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/** Parses the hex and X11 forms of Ghostty's `RGB.parse`, as 0–255 channels. */
export function parseColor(token: string): Rgb | undefined {
  if (!HEX_RE.test(token)) {
    const hex = namedColors.get(token.toLowerCase());
    return hex === undefined ? undefined : parseColor(hex);
  }
  const digits = token.replace("#", "");
  const full =
    digits.length === 3
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  return {
    red: Number.parseInt(full.slice(0, 2), 16),
    green: Number.parseInt(full.slice(2, 4), 16),
    blue: Number.parseInt(full.slice(4, 6), 16),
  };
}

function segments(text: string, offset: number, comma: boolean) {
  const parts = comma ? text.split(",") : [text];
  let start = offset;
  return parts.map((part) => {
    const token = part.trim();
    const segment = { token, start: start + part.indexOf(token) };
    start += part.length + 1;
    return segment;
  });
}

export function getDocumentColors(text: string): DocumentColor[] {
  const colors: DocumentColor[] = [];
  for (const line of parseDocument(text)) {
    if (line.type !== "entry") continue;

    const key = canonicalKey(line.key);
    const valueStart = line.eqIndex + 1;
    let candidates: { token: string; start: number }[];
    if (key === "palette") {
      const innerEq = line.rawValue.indexOf(CONFIG_KEY_VALUE_SEPARATOR);
      if (innerEq < 0) continue;
      candidates = segments(
        line.rawValue.slice(innerEq + 1),
        valueStart + innerEq + 1,
        false,
      );
    } else {
      const option = optionByKey.get(key);
      if (!option?.assets?.includes("color")) continue;
      candidates = segments(line.rawValue, valueStart, option.comma ?? false);
    }

    for (const { token, start } of candidates) {
      const color = parseColor(token);
      if (color) {
        colors.push({ range: rangeOf(line.line, start, token.length), color });
      }
    }
  }
  return colors;
}

const toHex = (channel: number) =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, "0");

/**
 * Hex label for a picked color (channels in 0–1) that keeps the replaced
 * value's style: uppercase digits stay uppercase and a bare hex stays bare.
 */
export function colorPresentation(color: Rgb, original: string): string {
  const hex = `${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
  const isHex = HEX_RE.test(original);
  const cased = isHex && /[A-F]/.test(original) ? hex.toUpperCase() : hex;
  return isHex && !original.startsWith("#") ? cased : `#${cased}`;
}
