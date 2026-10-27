import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  openDoc,
  resetSettings,
  useFakeGhostty,
  waitForCodes,
} from "./helpers";

async function quickFixes(
  doc: vscode.TextDocument,
  range: vscode.Range,
): Promise<vscode.CodeAction[]> {
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    doc.uri,
    range,
  );
  // Only edit-carrying actions are ours; VS Code stable adds chat actions.
  return (actions ?? []).filter((action) => action.edit);
}

const titles = (actions: vscode.CodeAction[]) => actions.map((a) => a.title);

async function apply(
  doc: vscode.TextDocument,
  actions: vscode.CodeAction[],
  title: string,
) {
  const action = actions.find((a) => a.title === title);
  assert.ok(action?.edit, `${title} in ${titles(actions)}`);
  assert.ok(await vscode.workspace.applyEdit(action.edit));
  return doc.getText();
}

/** Opens `content`, waits for `codes`, and returns fixes for the first one. */
async function fixesFor(content: string, codes: string[]) {
  const doc = await openDoc(content);
  const [diagnostic] = await waitForCodes(doc, codes);
  assert.ok(diagnostic);
  return { doc, actions: await quickFixes(doc, diagnostic.range) };
}

suite("code actions", () => {
  suiteSetup(useFakeGhostty);
  teardown(closeAll);
  suiteTeardown(resetSettings);

  test("Did you mean: closest keys first, replacing only the key", async () => {
    const { doc, actions } = await fixesFor("  font-sise = 14\n", [
      "unknown-key",
    ]);
    assert.deepStrictEqual(titles(actions), [
      "Did you mean 'font-size'?",
      "Did you mean 'font-style'?",
      "Did you mean 'font-family'?",
      "Remove line",
    ]);
    for (const action of actions) {
      assert.strictEqual(
        action.kind?.value,
        vscode.CodeActionKind.QuickFix.value,
      );
    }
    assert.strictEqual(
      await apply(doc, actions, "Did you mean 'font-size'?"),
      "  font-size = 14\n",
    );
    await waitForCodes(doc, []);
  });

  test("offers only Remove line for keys with no close match", async () => {
    const { doc, actions } = await fixesFor(
      "font-size = 14\nbogus-key = 1\ncursor-style = bar\n",
      ["unknown-key"],
    );
    assert.deepStrictEqual(titles(actions), ["Remove line"]);
    assert.strictEqual(
      await apply(doc, actions, "Remove line"),
      "font-size = 14\ncursor-style = bar\n",
    );
  });

  test("Remove line on the last line without a trailing newline", async () => {
    const { doc, actions } = await fixesFor("font-size = 14\nbogus-key = 1", [
      "unknown-key",
    ]);
    assert.strictEqual(
      await apply(doc, actions, "Remove line"),
      "font-size = 14\n",
    );
  });

  test("Remove line for a duplicate key", async () => {
    const { doc, actions } = await fixesFor(
      "font-size = 14\nfont-size = 15\ncursor-style = bar\n",
      ["duplicate-key"],
    );
    assert.deepStrictEqual(titles(actions), ["Remove line"]);
    assert.strictEqual(
      await apply(doc, actions, "Remove line"),
      "font-size = 14\ncursor-style = bar\n",
    );
    await waitForCodes(doc, []);
  });

  test("Replace with a valid enum value", async () => {
    const { doc, actions } = await fixesFor("cursor-style = nope\n", [
      "invalid-value",
    ]);
    assert.deepStrictEqual(titles(actions), [
      "Replace with 'block'",
      "Replace with 'bar'",
      "Replace with 'underline'",
      "Replace with 'block_hollow'",
    ]);
    assert.strictEqual(
      await apply(doc, actions, "Replace with 'bar'"),
      "cursor-style = bar\n",
    );
    await waitForCodes(doc, []);
  });

  test("Replace with a boolean for boolean keys", async () => {
    const { doc, actions } = await fixesFor("font-thicken = maybe\n", [
      "invalid-value",
    ]);
    assert.deepStrictEqual(titles(actions), [
      "Replace with 'true'",
      "Replace with 'false'",
    ]);
    assert.strictEqual(
      await apply(doc, actions, "Replace with 'true'"),
      "font-thicken = true\n",
    );
    await waitForCodes(doc, []);
  });

  test("offers no replacements for values without an enum", async () => {
    const { actions } = await fixesFor("font-size = abc\n", ["invalid-value"]);
    assert.deepStrictEqual(titles(actions), []);
  });

  test("replaces only the value in a CRLF document", async () => {
    const { doc, actions } = await fixesFor(
      "cursor-style=nope   \r\nfont-size = 14\r\n",
      ["invalid-value"],
    );
    assert.strictEqual(
      await apply(doc, actions, "Replace with 'bar'"),
      "cursor-style=bar   \r\nfont-size = 14\r\n",
    );
  });

  test("scopes fixes to the requested range", async () => {
    const doc = await openDoc("cursor-style = nope\nfont-sise = 14\n");
    await waitForCodes(doc, ["invalid-value", "unknown-key"]);

    const firstLine = titles(await quickFixes(doc, doc.lineAt(0).range));
    assert.ok(firstLine.includes("Replace with 'bar'"));
    assert.ok(!firstLine.some((t) => t.startsWith("Did you mean")));

    const everything = titles(
      await quickFixes(doc, new vscode.Range(0, 0, 2, 0)),
    );
    assert.ok(everything.includes("Replace with 'bar'"));
    assert.ok(everything.includes("Did you mean 'font-size'?"));

    const clean = await openDoc(`font-size = 14\nbogus-key = 1`);
    await waitForCodes(clean, ["unknown-key"]);
    assert.deepStrictEqual(await quickFixes(clean, clean.lineAt(0).range), []);
  });
});
