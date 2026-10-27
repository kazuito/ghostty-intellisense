import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import {
  closeAll,
  codeOf,
  diagnosticsOf,
  FAKE_GHOSTTY,
  openDoc,
  replaceText,
  resetSettings,
  SENTINEL,
  setSetting,
  sleep,
  summarize,
  useFakeGhostty,
  waitFor,
  waitForCodes,
} from "./helpers";

suite("diagnostics", () => {
  let includeDir: string;
  let included: string;

  suiteSetup(async () => {
    includeDir = mkdtempSync(path.join(tmpdir(), "ghostty-e2e-"));
    included = path.join(includeDir, "included");
    writeFileSync(included, "cursor-style = nope\n");
    await useFakeGhostty();
  });
  teardown(closeAll);
  suiteTeardown(async () => {
    rmSync(includeDir, { recursive: true, force: true });
    await resetSettings();
  });

  test("merges in-process and CLI diagnostics with precise ranges", async () => {
    const doc = await openDoc(
      "font-size = 14\nfont-size = 15\nbogus-key = 1\ncursor-style = nope\n",
    );
    const diags = await waitForCodes(doc, [
      "duplicate-key",
      "unknown-key",
      "invalid-value",
    ]);
    assert.deepStrictEqual(
      diags
        .map((d) => [codeOf(d), d.severity])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [
        ["duplicate-key", vscode.DiagnosticSeverity.Information],
        ["invalid-value", vscode.DiagnosticSeverity.Error],
        ["unknown-key", vscode.DiagnosticSeverity.Error],
      ],
    );
    assert.deepStrictEqual(summarize(diags), [
      { code: "duplicate-key", line: 1, start: 0, end: 9 },
      { code: "unknown-key", line: 2, start: 0, end: 9 },
      { code: "invalid-value", line: 3, start: 15, end: 19 },
    ]);
  });

  test("validates files opened from the workspace", async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(root, "fixture workspace is open");
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(root, "errors.ghostty"),
    );
    await vscode.window.showTextDocument(doc);
    await waitForCodes(doc, ["duplicate-key", "unknown-key", "invalid-value"]);
  });

  test("reports every repeated non-additive key against its first line", async () => {
    const doc = await openDoc(
      `font-size = 14\n  font-size=15\nfont-size = 16\n${SENTINEL}\n`,
    );
    const diags = await waitForCodes(doc, [
      "duplicate-key",
      "duplicate-key",
      "unknown-key",
    ]);
    const duplicates = diags.filter((d) => codeOf(d) === "duplicate-key");
    assert.deepStrictEqual(summarize(duplicates), [
      { code: "duplicate-key", line: 1, start: 2, end: 11 },
      { code: "duplicate-key", line: 2, start: 0, end: 9 },
    ]);
    for (const d of duplicates) {
      assert.match(d.message, /first defined on line 1\b/);
    }
  });

  test("ignores repeated additive keys and keys in comments", async () => {
    const doc = await openDoc(
      [
        "keybind = ctrl+a=new_tab",
        "keybind = ctrl+b=close_surface",
        "palette = 0=#000000",
        "palette = 1=#ffffff",
        "# font-size = 12",
        "font-size = 14",
        SENTINEL,
      ].join("\n"),
    );
    await waitForCodes(doc, ["unknown-key"]);
  });

  test("ranges invalid values that are not enums", async () => {
    const doc = await openDoc("font-size = abc\nfont-thicken = maybe\n");
    const diags = await waitForCodes(doc, ["invalid-value", "invalid-value"]);
    assert.deepStrictEqual(summarize(diags), [
      { code: "invalid-value", line: 0, start: 12, end: 15 },
      { code: "invalid-value", line: 1, start: 15, end: 20 },
    ]);
    assert.ok(diags.some((d) => d.message === 'invalid value "abc"'));
  });

  test("uses UTF-16 columns for non-ASCII values", async () => {
    const doc = await openDoc("cursor-style = \u{1F642}\n");
    const diags = await waitForCodes(doc, ["invalid-value"]);
    assert.deepStrictEqual(summarize(diags), [
      { code: "invalid-value", line: 0, start: 15, end: 17 },
    ]);
  });

  test("ranges diagnostics correctly in CRLF documents", async () => {
    const doc = await openDoc(
      "cursor-style=nope   \r\n  font-sise = 1\r\nfont-size = 14\r\nfont-size = 15\r\n",
    );
    assert.strictEqual(doc.eol, vscode.EndOfLine.CRLF);
    const diags = await waitForCodes(doc, [
      "invalid-value",
      "unknown-key",
      "duplicate-key",
    ]);
    assert.deepStrictEqual(summarize(diags), [
      { code: "invalid-value", line: 0, start: 13, end: 17 },
      { code: "unknown-key", line: 1, start: 2, end: 11 },
      { code: "duplicate-key", line: 3, start: 0, end: 9 },
    ]);
  });

  test("maps unlocated CLI output once a theme is loaded", async () => {
    const doc = await openDoc(
      "theme = Dracula\nfont-size = 14\nbogus-key = 1\ncursor-style = nope\n",
    );
    const diags = await waitForCodes(doc, ["unknown-key", "invalid-value"]);
    assert.deepStrictEqual(summarize(diags), [
      { code: "unknown-key", line: 2, start: 0, end: 9 },
      { code: "invalid-value", line: 3, start: 15, end: 19 },
    ]);
  });

  test("surfaces CLI errors that cannot be mapped to a line", async () => {
    const doc = await openDoc("theme = Missing Theme\nfont-size = 14\n");
    const [diag] = await waitForCodes(doc, ["unparsed"]);
    assert.ok(diag);
    assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Error);
    assert.match(diag.message, /theme "Missing Theme" not found/);
    assert.deepStrictEqual(summarize([diag]), [
      { code: "unparsed", line: 0, start: 0, end: 21 },
    ]);
  });

  test("keeps errors from included config files off unrelated lines", async () => {
    const doc = await openDoc(
      `font-size = 14\nconfig-file = ${included}\n${SENTINEL}\n`,
    );
    const diags = await waitForCodes(doc, ["unknown-key"]);
    assert.deepStrictEqual(summarize(diags), [
      { code: "unknown-key", line: 2, start: 0, end: 9 },
    ]);
  });

  test("surfaces include-only errors instead of dropping them", async () => {
    const doc = await openDoc(`font-size = 14\nconfig-file = ${included}\n`);
    const [diag] = await waitForCodes(doc, ["unparsed"]);
    assert.ok(diag?.message.includes(included), diag?.message);
  });

  test("reports missing config-file includes unless optional", async () => {
    const doc = await openDoc(
      `config-file = ?${includeDir}/optional\n${SENTINEL}\n`,
    );
    await waitForCodes(doc, ["unknown-key"]);

    await replaceText(doc, `config-file = ${includeDir}/required\n`);
    const [diag] = await waitForCodes(doc, ["unparsed"]);
    assert.match(diag?.message ?? "", /FileNotFound/);
  });

  test("clears diagnostics once the problems are fixed", async () => {
    const doc = await openDoc(
      "bogus-key = 1\nfont-size = 14\nfont-size = 15\n",
    );
    await waitForCodes(doc, ["unknown-key", "duplicate-key"]);
    await replaceText(doc, "cursor-style = block\nfont-size = 14\n");
    await waitForCodes(doc, []);
  });

  test("settles on the final text after rapid edits", async () => {
    const doc = await openDoc(SENTINEL);
    await waitForCodes(doc, ["unknown-key"]);
    for (const text of [
      "font-sise = 1",
      "cursor-style = nope",
      "font-size = 1\nfont-size = 2",
      "font-size = 14",
    ]) {
      await replaceText(doc, text);
    }
    await waitForCodes(doc, []);
    await sleep(1_000);
    assert.deepStrictEqual(diagnosticsOf(doc), [], "stale result arrived");
  });

  test("validates open documents independently", async () => {
    const first = await openDoc(SENTINEL);
    const second = await openDoc("cursor-style = nope");
    const third = await openDoc("font-size = 14\nfont-size = 15");
    await Promise.all([
      waitForCodes(first, ["unknown-key"]),
      waitForCodes(second, ["invalid-value"]),
      waitForCodes(third, ["duplicate-key"]),
    ]);
  });

  test("clears diagnostics when a document is closed", async () => {
    const doc = await openDoc(SENTINEL);
    await waitForCodes(doc, ["unknown-key"]);
    const { uri } = doc;
    await closeAll();
    await waitFor(
      () => vscode.languages.getDiagnostics(uri),
      (diags) => diags.length === 0,
    );
  });

  test("follows language mode changes", async () => {
    const doc = await openDoc(SENTINEL, "plaintext");
    await sleep(1_000);
    assert.deepStrictEqual(diagnosticsOf(doc), []);

    const ghostty = await vscode.languages.setTextDocumentLanguage(
      doc,
      "ghostty-config",
    );
    await waitForCodes(ghostty, ["unknown-key"]);

    const plain = await vscode.languages.setTextDocumentLanguage(
      ghostty,
      "plaintext",
    );
    await waitForCodes(plain, []);
  });

  test("keeps in-process checks and revalidates when the CLI returns", async () => {
    const doc = await openDoc(`font-size = 14\nfont-size = 15\n${SENTINEL}`);
    await waitForCodes(doc, ["duplicate-key", "unknown-key"]);
    try {
      await setSetting("executablePath", "/nonexistent/ghostty");
      await replaceText(doc, `font-size = 14\nfont-size = 15\n${SENTINEL}\n`);
      await waitForCodes(doc, ["duplicate-key"]);
      await sleep(1_000);
      assert.deepStrictEqual(diagnosticsOf(doc).map(codeOf), ["duplicate-key"]);
    } finally {
      await setSetting("executablePath", FAKE_GHOSTTY);
    }
    await waitForCodes(doc, ["duplicate-key", "unknown-key"]);
  });

  test("handles large documents", async () => {
    const lines = [
      "font-size = 14",
      ...Array.from(
        { length: 3_000 },
        (_, i) => `keybind = ctrl+shift+f${i}=new_tab`,
      ),
      SENTINEL,
    ];
    const doc = await openDoc(lines.join("\n"));
    const diags = await waitForCodes(doc, ["unknown-key"]);
    assert.strictEqual(diags[0]?.range.start.line, lines.length - 1);
  });
});
