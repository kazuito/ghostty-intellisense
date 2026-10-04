import { parseDocument } from "@/core/document";
import { additiveKeys, optionByKey } from "@/core/schema";
import type { ValidationDiagnostic } from "./types";

export function validateInProcess(text: string): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const seenKeys = new Map<string, number>();

  for (const line of parseDocument(text)) {
    if (!("key" in line)) continue;
    const { key } = line;
    if (!optionByKey.has(key) || additiveKeys.has(key)) continue;

    const firstLine = seenKeys.get(key);
    if (firstLine === undefined) {
      seenKeys.set(key, line.line);
      continue;
    }

    diagnostics.push({
      range: line.keyRange,
      message: `Duplicate key '${key}' (first defined on line ${firstLine + 1})`,
      severity: "information",
      code: "duplicate-key",
    });
  }

  return diagnostics;
}
