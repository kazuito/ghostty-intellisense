import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  openDoc,
  resetSettings,
  setSetting,
  useFakeGhostty,
} from "./helpers";

const MESSY =
  "  font-size=14  \n\n\n\nbackground = 1a1b26\nfont-thicken=TRUE\nfont-feature = -calt,-liga\n# keep  this  \n";

async function formatEdits(doc: vscode.TextDocument) {
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    "vscode.executeFormatDocumentProvider",
    doc.uri,
    { tabSize: 2, insertSpaces: true },
  );
  return edits ?? [];
}

async function format(content: string): Promise<string> {
  const doc = await openDoc(content);
  const edit = new vscode.WorkspaceEdit();
  edit.set(doc.uri, await formatEdits(doc));
  assert.ok(await vscode.workspace.applyEdit(edit));
  return doc.getText();
}

suite("formatting", () => {
  suiteSetup(useFakeGhostty);
  teardown(async () => {
    await closeAll();
    await resetSettings("format.");
  });
  suiteTeardown(resetSettings);

  test("formats with default settings", async () => {
    assert.strictEqual(
      await format(MESSY),
      "font-size = 14\n\nbackground = #1A1B26\nfont-thicken = true\nfont-feature = -calt, -liga\n# keep  this  \n",
    );
  });

  test("leaves an already formatted document unchanged", async () => {
    const doc = await openDoc("font-size = 14\ncursor-style = bar\n");
    assert.deepStrictEqual(await formatEdits(doc), []);
  });

  test("honors ghostty.format.* settings", async () => {
    await setSetting("format.equalSpacing", "no-space");
    await setSetting("format.blankLines", "preserve");
    await setSetting("format.colorCase", "lowercase");
    await setSetting("format.colorAddPrefix", false);
    await setSetting("format.booleanCase", "preserve");
    await setSetting("format.commaSpacing", "no-space");
    assert.strictEqual(
      await format(MESSY),
      "font-size=14\n\n\n\nbackground=1a1b26\nfont-thicken=TRUE\nfont-feature=-calt,-liga\n# keep  this  \n",
    );
  });

  test("preserves CRLF line endings", async () => {
    assert.strictEqual(
      await format("font-size=14\r\ncursor-style=bar\r\n"),
      "font-size = 14\r\ncursor-style = bar\r\n",
    );
  });
});
