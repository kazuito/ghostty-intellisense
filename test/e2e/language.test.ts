import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  GHOSTTY_BIN,
  hoverText,
  LANGUAGE_ID,
  openDoc,
  resetSettings,
  setSetting,
  useGhostty,
  waitFor,
} from "./helpers";

async function symbolsOf(doc: vscode.TextDocument) {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    doc.uri,
  );
  return symbols ?? [];
}

function rangeTuple(range: vscode.Range) {
  return [
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  ];
}

suite("language", () => {
  suiteSetup(useGhostty);
  teardown(closeAll);
  suiteTeardown(resetSettings);

  test("activates the extension", () => {
    const extension = vscode.extensions.getExtension("kazuito.ghostty");
    assert.ok(extension?.isActive);
  });

  test("detects .ghostty files and Ghostty config paths", async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(root, "fixture workspace is open");
    const expected = {
      "basic.ghostty": LANGUAGE_ID,
      "ghostty/config": LANGUAGE_ID,
      "com.mitchellh.ghostty/config": LANGUAGE_ID,
      "other/config": "plaintext",
    };
    for (const [file, language] of Object.entries(expected)) {
      const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(root, file),
      );
      assert.strictEqual(doc.languageId, language, file);
    }
  });

  test("hover shows description and reference link", async () => {
    const doc = await openDoc("font-size = 14");
    const text = await hoverText(doc, new vscode.Position(0, 3));
    assert.match(text, /\*\*font-size\*\*/);
    assert.ok(
      text.includes("https://ghostty.org/docs/config/reference#font-size"),
    );
  });

  test("hover works anywhere on an entry line", async () => {
    const doc = await openDoc("font-size = 14\n  font-size=14\nfont-size");
    for (const position of [
      new vscode.Position(0, 13),
      new vscode.Position(1, 0),
      new vscode.Position(1, 4),
      new vscode.Position(2, 9),
    ]) {
      assert.match(
        await hoverText(doc, position),
        /\*\*font-size\*\*/,
        `${position.line}:${position.character}`,
      );
    }
  });

  test("hover marks an empty CLI default", async () => {
    const doc = await openDoc("font-family = JetBrains Mono");
    const text = await hoverText(doc, new vscode.Position(0, 2));
    assert.ok(text.includes("**Default:** *(empty)*"), text);
  });

  test("hover is empty for comments, blank lines, and unknown keys", async () => {
    const doc = await openDoc("# font-size\n\nbogus-key = 1");
    for (const line of [0, 1, 2]) {
      assert.strictEqual(
        await hoverText(doc, new vscode.Position(line, 0)),
        "",
        `line ${line}`,
      );
    }
  });

  test("ignores documents in other languages", async () => {
    const doc = await openDoc("font-size = 14", "plaintext");
    assert.strictEqual(await hoverText(doc, new vscode.Position(0, 2)), "");
    assert.deepStrictEqual(await symbolsOf(doc), []);
  });

  test("provides document symbols with key selection ranges", async () => {
    const doc = await openDoc(
      "# comment\n  font-size = 14\n\ncursor-style\nkeybind=a=ignore\n",
    );
    const symbols = await symbolsOf(doc);
    assert.deepStrictEqual(
      symbols.map((s) => [
        s.name,
        s.kind,
        rangeTuple(s.range),
        rangeTuple(s.selectionRange),
      ]),
      [
        ["font-size", vscode.SymbolKind.Property, [1, 0, 1, 16], [1, 2, 1, 11]],
        [
          "cursor-style",
          vscode.SymbolKind.Property,
          [3, 0, 3, 12],
          [3, 0, 3, 12],
        ],
        ["keybind", vscode.SymbolKind.Property, [4, 0, 4, 16], [4, 0, 4, 7]],
      ],
    );
  });

  test("keeps symbol ranges inside CRLF lines", async () => {
    const doc = await openDoc("font-size = 14\r\ncursor-style = bar\r\n");
    const symbols = await symbolsOf(doc);
    assert.deepStrictEqual(
      symbols.map((s) => [s.name, rangeTuple(s.range)]),
      [
        ["font-size", [0, 0, 0, 14]],
        ["cursor-style", [1, 0, 1, 18]],
      ],
    );
  });

  test("toggles line comments with #", async () => {
    const doc = await openDoc("font-size = 14");
    await vscode.commands.executeCommand("editor.action.commentLine");
    assert.strictEqual(doc.getText(), "# font-size = 14");
    await vscode.commands.executeCommand("editor.action.commentLine");
    assert.strictEqual(doc.getText(), "font-size = 14");
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

    await setSetting("executablePath", GHOSTTY_BIN);
    await waitFor(() => hoverText(doc, position), hasDefault);
  });
});
