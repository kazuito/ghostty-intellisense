import { parseDocumentLine, parseLine, rangeOf } from "@/core/document";
import { UNKNOWN_FIELD_MESSAGE, type ValidationDiagnostic } from "./types";

const LOCATED_OUTPUT_RE = /^.+?:(\d+):([^:]+):\s*(.+)$/;
const UNLOCATED_OUTPUT_RE = /^([A-Za-z0-9_-]+):\s*(.+)$/;

function findKeyLine(lines: string[], key: string): number {
  return lines.findIndex((line) => {
    const parsed = parseLine(line);
    return "key" in parsed && parsed.key === key;
  });
}

function buildDiagnostic(
  lines: string[],
  lineNum: number,
  field: string,
  message: string,
): ValidationDiagnostic | null {
  const line = lines[lineNum];
  if (!line) return null;

  const parsed = parseDocumentLine(line, lineNum);
  const isUnknownField = message === UNKNOWN_FIELD_MESSAGE;

  return {
    range:
      !isUnknownField && parsed.type === "entry"
        ? parsed.valueRange
        : rangeOf(lineNum, Math.max(0, line.indexOf(field)), field.length),
    message,
    severity: "error",
    code: isUnknownField ? "unknown-key" : "invalid-value",
  };
}

export function parseGhosttyOutput(
  output: string,
  lines: string[],
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const rawLine of output.split("\n")) {
    const located = rawLine.match(LOCATED_OUTPUT_RE);
    if (located) {
      const diagnostic = buildDiagnostic(
        lines,
        parseInt(located[1], 10) - 1,
        (located[2] ?? "").trim(),
        located[3].trim(),
      );
      if (diagnostic) diagnostics.push(diagnostic);
      continue;
    }

    const unlocated = rawLine.match(UNLOCATED_OUTPUT_RE);
    if (unlocated) {
      const field = unlocated[1].trim();
      const diagnostic = buildDiagnostic(
        lines,
        findKeyLine(lines, field),
        field,
        unlocated[2].trim(),
      );
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

/**
 * Safety net for when ghostty reports config errors (non-zero exit) but
 * {@link parseGhosttyOutput} maps none of them to a line — e.g. ghostty changes
 * its output format again. Surfaces the raw CLI output at the top of the file
 * so the problem is visible instead of being silently swallowed.
 */
export function buildUnparsedErrorsDiagnostic(
  output: string,
  lines: string[],
): ValidationDiagnostic | null {
  const detail = output.trim();
  if (!detail) return null;

  const firstLineLength = lines[0]?.length ?? 0;
  return {
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: firstLineLength },
    },
    message: `Ghostty reported configuration errors that could not be mapped to a line:\n${detail}`,
    severity: "error",
    code: "unparsed",
  };
}
