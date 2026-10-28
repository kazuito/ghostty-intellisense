import { unlink } from "node:fs/promises";
import {
  type Connection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  type TextDocuments,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { GHOSTTY_CONFIG_SECTION } from "@/core/constants";
import { splitLines } from "@/core/document";
import {
  buildUnparsedErrorsDiagnostic,
  createValidationTempPath,
  parseGhosttyOutput,
  runGhosttyValidation,
  type ValidationDiagnostic,
  validateInProcess,
} from ".";

const CLI_VALIDATION_DEBOUNCE_MS = 300;

interface ValidationState {
  controller: AbortController | null;
  tmpPath: string;
}

function toLspSeverity(
  severity: ValidationDiagnostic["severity"],
): DiagnosticSeverity {
  switch (severity) {
    case "warning":
      return DiagnosticSeverity.Warning;
    case "information":
      return DiagnosticSeverity.Information;
    case "error":
      return DiagnosticSeverity.Error;
    case "hint":
      return DiagnosticSeverity.Hint;
  }
}

function toLspDiagnostic(diagnostic: ValidationDiagnostic): Diagnostic {
  const lspDiagnostic = Diagnostic.create(
    diagnostic.range,
    diagnostic.message,
    toLspSeverity(diagnostic.severity),
    diagnostic.code,
  );
  if (diagnostic.deprecated) lspDiagnostic.tags = [DiagnosticTag.Deprecated];
  return lspDiagnostic;
}

async function validateDocumentAsync(
  connection: Connection,
  uri: string,
  text: string,
  state: ValidationState,
  inProcessDiags: Diagnostic[],
  lastCliDiags: Map<string, Diagnostic[]>,
): Promise<void> {
  const controller = new AbortController();
  state.controller = controller;

  try {
    const raw = await connection.workspace.getConfiguration({
      scopeUri: uri,
      section: GHOSTTY_CONFIG_SECTION,
    });
    if (state.controller !== controller) return;

    const executablePath: string =
      (raw as { executablePath?: string })?.executablePath ?? "";
    const { output, reportedErrors } = await runGhosttyValidation(
      text,
      executablePath,
      state.tmpPath,
      controller.signal,
    );
    if (state.controller !== controller) return;

    state.controller = null;
    const lines = splitLines(text);
    const parsed = parseGhosttyOutput(output, lines, state.tmpPath);

    if (reportedErrors && parsed.length === 0) {
      connection.console.warn(
        `Ghostty reported config errors but none could be parsed. Raw output:\n${output.trim()}`,
      );
      const fallback = buildUnparsedErrorsDiagnostic(output, lines);
      if (fallback) parsed.push(fallback);
    }

    const cliDiags = parsed.map(toLspDiagnostic);
    lastCliDiags.set(uri, cliDiags);

    connection.sendDiagnostics({
      uri,
      diagnostics: [...inProcessDiags, ...cliDiags],
    });
  } catch (error) {
    if (state.controller === controller) {
      state.controller = null;
    }
    connection.console.error(
      `Ghostty validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function registerDiagnosticsProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): { revalidateOpenDocuments: () => void } {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const validationStates = new Map<string, ValidationState>();
  const lastCliDiags = new Map<string, Diagnostic[]>();

  function getValidationState(uri: string): ValidationState {
    let state = validationStates.get(uri);
    if (!state) {
      state = {
        controller: null,
        tmpPath: createValidationTempPath(),
      };
      validationStates.set(uri, state);
    }
    return state;
  }

  function cancelValidation(uri: string): void {
    const state = validationStates.get(uri);
    state?.controller?.abort();
    if (state) {
      state.controller = null;
    }
  }

  function scheduleValidation(doc: TextDocument): void {
    const uri = doc.uri;
    const text = doc.getText();
    const inProcessDiags = validateInProcess(text).map(toLspDiagnostic);
    const state = getValidationState(uri);

    cancelValidation(uri);

    connection.sendDiagnostics({
      uri,
      diagnostics: [...inProcessDiags, ...(lastCliDiags.get(uri) ?? [])],
    });

    clearTimeout(debounceTimers.get(uri));
    debounceTimers.set(
      uri,
      setTimeout(() => {
        debounceTimers.delete(uri);
        void validateDocumentAsync(
          connection,
          uri,
          text,
          state,
          inProcessDiags,
          lastCliDiags,
        );
      }, CLI_VALIDATION_DEBOUNCE_MS),
    );
  }

  documents.onDidOpen((e) => scheduleValidation(e.document));
  documents.onDidChangeContent((e) => scheduleValidation(e.document));
  documents.onDidClose((e) => {
    const uri = e.document.uri;
    clearTimeout(debounceTimers.get(uri));
    debounceTimers.delete(uri);
    cancelValidation(uri);
    const state = validationStates.get(uri);
    validationStates.delete(uri);
    lastCliDiags.delete(uri);
    if (state) {
      unlink(state.tmpPath).catch(() => {});
    }
    connection.sendDiagnostics({ uri, diagnostics: [] });
  });

  return {
    revalidateOpenDocuments: () => {
      for (const doc of documents.all()) {
        scheduleValidation(doc);
      }
    },
  };
}
