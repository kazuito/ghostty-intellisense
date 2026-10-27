import { execFileSync } from "node:child_process";
import path from "node:path";
import * as vscode from "vscode";
import { type GhosttyAction, parseActionsOutput } from "@/ghostty/actions";
import { GHOSTTY_CLI_FLAGS } from "@/ghostty/constants";
import {
  GHOSTTY_PIN,
  ghosttyVersionOf,
  pinMismatchMessage,
  pinnedGhosttyBin,
} from "../ghostty";

export const LANGUAGE_ID = "ghostty-config";

export const GHOSTTY_BIN = pinnedGhosttyBin(path.resolve(__dirname, "../.."));

function ghostty(...args: string[]): string {
  return execFileSync(GHOSTTY_BIN, args, {
    encoding: "utf8",
    timeout: 10_000,
  });
}

export function cliActions(): GhosttyAction[] {
  return parseActionsOutput(
    ghostty(GHOSTTY_CLI_FLAGS.LIST_ACTIONS, GHOSTTY_CLI_FLAGS.DOCS),
  );
}

export async function waitFor<T>(
  probe: () => T | Thenable<T>,
  until: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await probe();
    if (until(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(
    `waitFor timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`,
  );
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration("ghostty")
    .update(key, value, vscode.ConfigurationTarget.Global);
}

export async function resetSettings(prefix = ""): Promise<void> {
  const config = vscode.workspace.getConfiguration("ghostty");
  const keys = [
    "executablePath",
    "format.equalSpacing",
    "format.blankLines",
    "format.colorCase",
    "format.colorAddPrefix",
    "format.booleanCase",
    "format.commaSpacing",
    "format.trimWhitespace",
  ];
  for (const key of keys.filter((k) => k.startsWith(prefix))) {
    await config.update(key, undefined, vscode.ConfigurationTarget.Global);
  }
}

export async function openDoc(
  content: string,
  language = LANGUAGE_ID,
): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({ language, content });
  await vscode.window.showTextDocument(doc);
  return doc;
}

export async function hoverText(
  doc: vscode.TextDocument,
  position: vscode.Position,
): Promise<string> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    doc.uri,
    position,
  );
  return hovers
    .flatMap((h) => h.contents)
    .map((c) => (typeof c === "string" ? c : c.value))
    .join("\n");
}

/**
 * Points the extension at the pinned Ghostty release and waits until the
 * language server has reloaded from it. Going through a missing executable
 * first proves the data came from this binary, not one loaded at startup.
 */
export async function useGhostty(): Promise<void> {
  const version = ghosttyVersionOf(GHOSTTY_BIN);
  if (version !== GHOSTTY_PIN.version) {
    throw new Error(pinMismatchMessage(GHOSTTY_BIN, version));
  }
  await resetSettings();
  const doc = await openDoc("font-size = 14");
  const hover = () => hoverText(doc, new vscode.Position(0, 2));
  const hasDefault = (text: string) => text.includes("**Default:**");

  await setSetting("executablePath", "/nonexistent/ghostty");
  await waitFor(
    hover,
    (text) => text.includes("**font-size**") && !hasDefault(text),
    20_000,
  );
  await setSetting("executablePath", GHOSTTY_BIN);
  await waitFor(hover, hasDefault, 20_000);
  await closeAll();
}

/** Reverts before closing so dirty untitled docs never raise a save prompt. */
export async function closeAll(): Promise<void> {
  for (let i = 0; i < 50 && vscode.window.activeTextEditor; i++) {
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor",
    );
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function replaceText(
  doc: vscode.TextDocument,
  text: string,
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
  if (!(await vscode.workspace.applyEdit(edit))) {
    throw new Error("applyEdit failed");
  }
}

export function diagnosticsOf(doc: vscode.TextDocument): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(doc.uri);
}

export function codeOf(diagnostic: vscode.Diagnostic): string | undefined {
  const { code } = diagnostic;
  return typeof code === "object" ? String(code.value) : code?.toString();
}

export function summarize(diagnostics: vscode.Diagnostic[]) {
  return diagnostics
    .map((d) => ({
      code: codeOf(d),
      line: d.range.start.line,
      start: d.range.start.character,
      end: d.range.end.character,
    }))
    .sort((a, b) => a.line - b.line || a.start - b.start);
}

/** Resolves once the document's diagnostic codes are exactly `codes`. */
export async function waitForCodes(
  doc: vscode.TextDocument,
  codes: string[],
): Promise<vscode.Diagnostic[]> {
  const sorted = JSON.stringify([...codes].sort());
  return waitFor(
    () => diagnosticsOf(doc),
    (diags) => JSON.stringify(diags.map(codeOf).sort()) === sorted,
  );
}

/**
 * A line Ghostty always rejects. Waiting for its diagnostic proves a
 * full CLI round trip finished, so absence assertions can't pass early.
 */
export const SENTINEL = "bogus-key = 1";
