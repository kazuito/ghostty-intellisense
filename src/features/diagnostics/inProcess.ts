import { parseDocument } from "@/core/document";
import {
  additiveKeys,
  canonicalKey,
  deprecatedValue,
  optionByKey,
  renamedKeys,
} from "@/core/schema";
import type { ValidationDiagnostic } from "./types";

export function validateInProcess(text: string): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const seenKeys = new Map<string, { line: number; key: string }>();

  for (const line of parseDocument(text)) {
    if (!("key" in line)) continue;
    const { key } = line;
    const canonical = canonicalKey(key);

    const renamed = renamedKeys.get(key);
    if (renamed) {
      diagnostics.push({
        range: line.keyRange,
        message: `'${key}' is deprecated; use '${renamed}' instead`,
        severity: "hint",
        code: "deprecated-key",
        deprecated: true,
      });
    }

    if (line.type === "entry") {
      const value = line.rawValue.trim();
      const deprecated = deprecatedValue(canonical, value);
      if (deprecated) {
        const advice =
          deprecated.advice ??
          deprecated.replacements.map((r) => `'${r}'`).join(" or ");
        diagnostics.push({
          range: line.valueRange,
          message: `'${key} = ${value}' is deprecated; use ${advice} instead`,
          severity: "hint",
          code: "deprecated-value",
          deprecated: true,
        });
      }
    }

    if (!optionByKey.has(canonical) || additiveKeys.has(canonical)) continue;

    const first = seenKeys.get(canonical);
    if (first === undefined) {
      seenKeys.set(canonical, { line: line.line, key });
      continue;
    }

    const alias = first.key === key ? "" : ` as '${first.key}'`;
    diagnostics.push({
      range: line.keyRange,
      message: `Duplicate key '${key}' (first defined on line ${first.line + 1}${alias})`,
      severity: "information",
      code: "duplicate-key",
    });
  }

  return diagnostics;
}
