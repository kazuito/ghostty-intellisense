import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  openDoc,
  resetSettings,
  setSetting,
  useGhostty,
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
  suiteSetup(useGhostty);
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

  test("formats through the Format Document command", async () => {
    const doc = await openDoc(MESSY);
    await vscode.commands.executeCommand("editor.action.formatDocument");
    assert.strictEqual(
      doc.getText(),
      "font-size = 14\n\nbackground = #1A1B26\nfont-thicken = true\nfont-feature = -calt, -liga\n# keep  this  \n",
    );
  });

  test("is idempotent", async () => {
    const doc = await openDoc(await format(MESSY));
    assert.deepStrictEqual(await formatEdits(doc), []);
  });

  test("returns no edits for an empty document", async () => {
    assert.deepStrictEqual(await formatEdits(await openDoc("")), []);
  });

  test("leaves values it does not understand untouched", async () => {
    assert.strictEqual(
      await format(
        'font-family = "  Fira Code  "\nbackground = black\npalette = 0=1a1b26\nbogus-key=TRUE\n  # indented comment\n  font-size  \nfont-family=\n',
      ),
      'font-family = "  Fira Code  "\nbackground = black\npalette = 0=#1A1B26\nbogus-key = TRUE\n  # indented comment\nfont-size\nfont-family =\n',
    );
  });

  test("keeps a missing trailing newline missing", async () => {
    assert.strictEqual(await format("\n\n\nfont-size=14"), "\nfont-size = 14");
  });

  test("preserves spacing, case, and indentation when configured", async () => {
    await setSetting("format.equalSpacing", "preserve");
    await setSetting("format.trimWhitespace", false);
    await setSetting("format.colorCase", "preserve");
    await setSetting("format.commaSpacing", "preserve");
    assert.strictEqual(
      await format(
        "  font-size =14\nbackground=#1a1B26\nmacos-icon-screen-color = 1a1b26 ,ffffff\n",
      ),
      "  font-size =14\nbackground=#1a1B26\nmacos-icon-screen-color = #1a1b26 ,#ffffff\n",
    );
  });

  test("picks up setting changes without a restart", async () => {
    await setSetting("format.equalSpacing", "no-space");
    assert.strictEqual(await format("font-size = 14\n"), "font-size=14\n");
    await setSetting("format.equalSpacing", "space");
    assert.strictEqual(await format("font-size=14\n"), "font-size = 14\n");
  });

  test("preserves CRLF line endings", async () => {
    assert.strictEqual(
      await format("font-size=14\r\ncursor-style=bar\r\n"),
      "font-size = 14\r\ncursor-style = bar\r\n",
    );
  });
});
