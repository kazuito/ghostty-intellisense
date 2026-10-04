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

export async function openDoc(content: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({
    language: LANGUAGE_ID,
    content,
  });
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

export function diagnosticsOf(doc: vscode.TextDocument): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(doc.uri);
}

export function codeOf(diagnostic: vscode.Diagnostic): string | undefined {
  const { code } = diagnostic;
  return typeof code === "object" ? String(code.value) : code?.toString();
}
