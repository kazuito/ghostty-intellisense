import path from "node:path";
import * as vscode from "vscode";

export const LANGUAGE_ID = "ghostty-config";
export const FAKE_GHOSTTY = path.resolve(
  __dirname,
  "../../test/e2e/fixtures/bin/ghostty",
);
/** Default `font-size` reported by the fake CLI; no real install uses it. */
export const FAKE_FONT_SIZE_DEFAULT = "42";

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
 * Points the extension at the fake CLI and waits until the language server
 * serves its data, so no test can silently pass against a real Ghostty.
 */
export async function useFakeGhostty(): Promise<void> {
  await resetSettings();
  await setSetting("executablePath", FAKE_GHOSTTY);
  const doc = await openDoc("font-size = 14");
  await waitFor(
    () => hoverText(doc, new vscode.Position(0, 2)),
    (text) => text.includes(`\`${FAKE_FONT_SIZE_DEFAULT}\``),
    20_000,
  );
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
 * A line the fake CLI always rejects. Waiting for its diagnostic proves a
 * full CLI round trip finished, so absence assertions can't pass early.
 */
export const SENTINEL = "bogus-key = 1";
