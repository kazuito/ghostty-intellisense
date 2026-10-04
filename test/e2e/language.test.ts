import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  FAKE_FONT_SIZE_DEFAULT,
  FAKE_GHOSTTY,
  hoverText,
  LANGUAGE_ID,
  openDoc,
  resetSettings,
  setSetting,
  useFakeGhostty,
  waitFor,
} from "./helpers";

async function completionLabels(
  doc: vscode.TextDocument,
  position: vscode.Position,
): Promise<string[]> {
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    doc.uri,
    position,
  );
  return list.items.map((item) =>
    typeof item.label === "string" ? item.label : item.label.label,
  );
}

async function completionsAtEnd(content: string): Promise<string[]> {
  const doc = await openDoc(content);
  const last = doc.lineAt(doc.lineCount - 1);
  return completionLabels(doc, last.range.end);
}

suite("language", () => {
  suiteSetup(useFakeGhostty);
  teardown(closeAll);
  suiteTeardown(resetSettings);

  test("activates the extension", () => {
    const extension = vscode.extensions.getExtension("kazuito.ghostty");
    assert.ok(extension?.isActive);
  });

  test("detects .ghostty files and ghostty/config paths", async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(root, "fixture workspace is open");
    for (const file of ["basic.ghostty", "ghostty/config"]) {
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(root, file),
      );
      assert.strictEqual(doc.languageId, LANGUAGE_ID, file);
    }
  });

  test("hover shows description, CLI default, and reference link", async () => {
    const doc = await openDoc("font-size = 14");
    const text = await hoverText(doc, new vscode.Position(0, 3));
    assert.match(text, /\*\*font-size\*\*/);
    assert.ok(text.includes(`**Default:** \`${FAKE_FONT_SIZE_DEFAULT}\``));
    assert.ok(
      text.includes("https://ghostty.org/docs/config/reference#font-size"),
    );
  });

  test("hover is empty for comments and unknown keys", async () => {
    const doc = await openDoc("# font-size\nbogus-key = 1");
    assert.strictEqual(await hoverText(doc, new vscode.Position(0, 4)), "");
    assert.strictEqual(await hoverText(doc, new vscode.Position(1, 2)), "");
  });

  test("completes keys and skips non-additive keys already set", async () => {
    const labels = await completionsAtEnd(
      "font-size = 14\nkeybind = a=ignore\n",
    );
    assert.ok(labels.includes("font-family"));
    assert.ok(labels.includes("keybind"), "additive keys stay available");
    assert.ok(!labels.includes("font-size"), "duplicate key suggested");
  });

  test("completes enum values", async () => {
    const labels = await completionsAtEnd("cursor-style = ");
    for (const value of ["bar", "block", "underline"]) {
      assert.ok(labels.includes(value), value);
    }
  });

  test("completes installed fonts from the CLI", async () => {
    const labels = await completionsAtEnd("font-family = ");
    assert.ok(labels.includes("Fake Mono"), labels.join(", "));
    assert.ok(labels.includes("Fake Sans"));
  });

  test("completes keybind actions from the CLI", async () => {
    const labels = await completionsAtEnd("keybind = cmd+t=");
    assert.ok(labels.includes("new_tab"), labels.join(", "));
  });

  test("provides document symbols for every entry", async () => {
    const doc = await openDoc(
      "# comment\nfont-size = 14\n\ncursor-style = bar\nkeybind = a=ignore",
    );
    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[]
    >("vscode.executeDocumentSymbolProvider", doc.uri);
    assert.deepStrictEqual(
      symbols.map((s) => [s.name, s.range.start.line]),
      [
        ["font-size", 1],
        ["cursor-style", 3],
        ["keybind", 4],
      ],
    );
  });

  test("reloads CLI data when ghostty.executablePath changes", async () => {
    const doc = await openDoc("font-size = 14");
    const position = new vscode.Position(0, 3);
    const hasDefault = (text: string) => text.includes("**Default:**");

    await setSetting("executablePath", "/nonexistent/ghostty");
    await waitFor(
      () => hoverText(doc, position),
      (t) => !hasDefault(t),
    );

    await setSetting("executablePath", FAKE_GHOSTTY);
    await waitFor(() => hoverText(doc, position), hasDefault);
  });
});
