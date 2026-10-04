import type { Range } from "@/core/document";

export type DiagnosticSeverity = "warning" | "information" | "error";

/** Literal message ghostty's `+validate-config` emits for an unrecognized key. */
export const UNKNOWN_FIELD_MESSAGE = "unknown field";

/**
 * Stable identifier for what kind of problem a diagnostic represents,
 * independent of its human-readable message. Code actions dispatch on this
 * instead of parsing message text, so wording changes can't silently break
 * quick fixes.
 */
export type ValidationDiagnosticCode =
  | "unknown-key"
  | "duplicate-key"
  | "invalid-value"
  | "unparsed";

export interface ValidationDiagnostic {
  range: Range;
  message: string;
  severity: DiagnosticSeverity;
  code: ValidationDiagnosticCode;
}

export interface ValidationResult {
  output: string;
  /**
   * True when ghostty ran and exited non-zero, i.e. it found config problems.
   * Distinguishes "config has errors" from "ghostty missing / aborted / timed
   * out" so the caller can detect when error output went unparsed instead of
   * silently dropping it.
   */
  reportedErrors: boolean;
}
