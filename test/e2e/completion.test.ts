import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  FAKE_FONT_SIZE_DEFAULT,
  FAKE_GHOSTTY,
  hoverText,
  openDoc,
  resetSettings,
  setSetting,
  useFakeGhostty,
  waitFor,
} from "./helpers";

interface Item {
  label: string;
  kind: vscode.CompletionItemKind | undefined;
  detail: string | undefined;
  insertText: string | undefined;
  replace: [number, number] | undefined;
}

function toItem(item: vscode.CompletionItem): Item {
  const range =
    item.range instanceof vscode.Range ? item.range : item.range?.replacing;
  return {
    label: typeof item.label === "string" ? item.label : item.label.label,
    kind: item.kind,
    detail: item.detail,
    insertText:
      typeof item.insertText === "string" ? item.insertText : undefined,
    replace: range && [range.start.character, range.end.character],
  };
}

/**
 * Completions at the end of `content`, limited to `kind` so word-based
 * suggestions from VS Code itself never leak into assertions.
 */
async function completionsAtEnd(
  content: string,
  kind: vscode.CompletionItemKind,
): Promise<Item[]> {
  const doc = await openDoc(content);
  const position = doc.lineAt(doc.lineCount - 1).range.end;
  const list = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    doc.uri,
    position,
  );
  return list.items.map(toItem).filter((item) => item.kind === kind);
}

const keys = (content: string) =>
  completionsAtEnd(content, vscode.CompletionItemKind.Property);
const values = (content: string) =>
  completionsAtEnd(content, vscode.CompletionItemKind.Value);
const labels = (items: Item[]) => items.map((item) => item.label);

suite("completion", () => {
  suiteSetup(useFakeGhostty);
  teardown(closeAll);
  suiteTeardown(resetSettings);

  test("completes keys and skips non-additive keys already set", async () => {
    const found = labels(await keys("font-size = 14\nkeybind = a=ignore\n"));
    assert.ok(found.includes("font-family"));
    assert.ok(found.includes("keybind"), "additive keys stay available");
    assert.ok(!found.includes("font-size"), "duplicate key suggested");
  });

  test("keeps suggesting a key while it is being typed again", async () => {
    const found = labels(await keys("font-size = 14\nfont-size"));
    assert.ok(found.includes("font-size"));
  });

  test("filters keys by prefix and replaces only the prefix", async () => {
    const items = await keys("  font-s");
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.ok(item.label.startsWith("font-s"), item.label);
      assert.deepStrictEqual(item.replace, [2, 8], item.label);
    }
    const fontSize = items.find((item) => item.label === "font-size");
    assert.strictEqual(fontSize?.insertText, "font-size = ");
    assert.match(
      fontSize?.detail ?? "",
      new RegExp(`\\(default: ${FAKE_FONT_SIZE_DEFAULT}\\)$`),
    );
  });

  test("offers nothing inside comments", async () => {
    assert.deepStrictEqual(await keys("# font-s"), []);
    assert.deepStrictEqual(await values("# cursor-style = "), []);
  });

  test("offers no values for unknown keys", async () => {
    assert.deepStrictEqual(await values("bogus-key = "), []);
  });

  test("completes enum values and marks the CLI default", async () => {
    const items = await values("cursor-style = ");
    assert.deepStrictEqual(labels(items).sort(), [
      "bar",
      "block",
      "block_hollow",
      "underline",
    ]);
    const detail = (label: string) =>
      items.find((item) => item.label === label)?.detail;
    assert.strictEqual(detail("block"), "default");
    assert.strictEqual(detail("bar"), undefined);
  });

  test("completes only the segment after the last comma", async () => {
    const content = "font-synthetic-style = bold, no-";
    const items = await values(content);
    assert.deepStrictEqual(labels(items).sort(), [
      "no-bold",
      "no-bold-italic",
      "no-italic",
    ]);
    for (const item of items) {
      assert.deepStrictEqual(item.replace, [
        content.length - 3,
        content.length,
      ]);
    }
  });

  test("completes named colors with their hex value", async () => {
    const items = await values("background = re");
    assert.ok(labels(items).includes("red"));
    assert.ok(labels(items).includes("rebecca purple"));
    for (const item of items) {
      assert.ok(item.label.startsWith("re"), item.label);
      assert.match(item.detail ?? "", /^#[0-9a-f]{6}$/i, item.label);
    }
    assert.strictEqual(
      items.find((item) => item.label === "red")?.detail,
      "#ff0000",
    );
  });

  test("completes installed fonts from the CLI", async () => {
    assert.deepStrictEqual(labels(await values("font-family = ")).sort(), [
      "Fake Mono",
      "Fake Sans",
    ]);
  });

  test("matches font prefixes that contain spaces", async () => {
    const content = "font-family = Fake S";
    const items = await values(content);
    assert.deepStrictEqual(labels(items), ["Fake Sans"]);
    assert.deepStrictEqual(items[0]?.replace, [14, content.length]);
  });

  test("completes keybind actions from the CLI", async () => {
    const found = labels(await values("keybind = cmd+t="));
    assert.deepStrictEqual(found.sort(), ["close_surface", "new_tab"]);
  });

  test("filters keybind actions by prefix with their docs", async () => {
    const content = "keybind = cmd+w=clo";
    const items = await values(content);
    assert.deepStrictEqual(items, [
      {
        label: "close_surface",
        kind: vscode.CompletionItemKind.Value,
        detail: "Close the current surface.",
        insertText: "close_surface",
        replace: [content.length - 3, content.length],
      },
    ]);
  });

  test("falls back to built-in data without the CLI", async () => {
    try {
      await setSetting("executablePath", "/nonexistent/ghostty");
      const probe = await openDoc("font-size = 14");
      await waitFor(
        () => hoverText(probe, new vscode.Position(0, 2)),
        (text) => text.includes("**font-size**") && !text.includes("Default"),
      );

      assert.deepStrictEqual(await values("font-family = "), []);
      assert.deepStrictEqual(await values("keybind = cmd+t="), []);
      assert.ok(labels(await values("background = re")).includes("red"));
      assert.ok(labels(await values("cursor-style = ")).includes("bar"));
    } finally {
      await setSetting("executablePath", FAKE_GHOSTTY);
    }
  });
});
