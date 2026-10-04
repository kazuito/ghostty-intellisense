import * as assert from "node:assert";
import * as vscode from "vscode";
import {
  closeAll,
  codeOf,
  diagnosticsOf,
  openDoc,
  resetSettings,
  useFakeGhostty,
  waitFor,
} from "./helpers";

function summarize(diagnostics: vscode.Diagnostic[]) {
  return diagnostics
    .map((d) => ({
      code: codeOf(d),
      severity: d.severity,
      line: d.range.start.line,
      start: d.range.start.character,
      end: d.range.end.character,
    }))
    .sort((a, b) => a.line - b.line);
}

async function waitForCodes(doc: vscode.TextDocument, codes: string[]) {
  const sorted = [...codes].sort();
  return waitFor(
    () => diagnosticsOf(doc),
    (diags) =>
      JSON.stringify(diags.map(codeOf).sort()) === JSON.stringify(sorted),
  );
}

async function quickFixes(
  doc: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): Promise<vscode.CodeAction[]> {
  return vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    doc.uri,
    diagnostic.range,
  );
}

async function apply(
  doc: vscode.TextDocument,
  actions: vscode.CodeAction[],
  title: string,
) {
  const action = actions.find((a) => a.title === title);
  assert.ok(action?.edit, `${title} in ${actions.map((a) => a.title)}`);
  assert.ok(await vscode.workspace.applyEdit(action.edit));
  return doc.getText();
}

suite("diagnostics", () => {
  suiteSetup(useFakeGhostty);
  teardown(closeAll);
  suiteTeardown(resetSettings);

  test("merges in-process and CLI diagnostics with precise ranges", async () => {
    const doc = await openDoc(
      "font-size = 14\nfont-size = 15\nbogus-key = 1\ncursor-style = nope\n",
    );
    const diags = await waitForCodes(doc, [
      "duplicate-key",
      "unknown-key",
      "invalid-value",
    ]);
    assert.deepStrictEqual(summarize(diags), [
      {
        code: "duplicate-key",
        severity: vscode.DiagnosticSeverity.Information,
        line: 1,
        start: 0,
        end: 9,
      },
      {
        code: "unknown-key",
        severity: vscode.DiagnosticSeverity.Error,
        line: 2,
        start: 0,
        end: 9,
      },
      {
        code: "invalid-value",
        severity: vscode.DiagnosticSeverity.Error,
        line: 3,
        start: 15,
        end: 19,
      },
    ]);
  });

  test("clears diagnostics once the problems are fixed", async () => {
    const doc = await openDoc(
      "bogus-key = 1\nfont-size = 14\nfont-size = 15\n",
    );
    await waitForCodes(doc, ["unknown-key", "duplicate-key"]);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      doc.uri,
      new vscode.Range(0, 0, doc.lineCount, 0),
      "cursor-style = block\nfont-size = 14\n",
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    await waitForCodes(doc, []);
  });

  test("quick fix: Did you mean for a misspelled key", async () => {
    const doc = await openDoc("font-sise = 14\n");
    const [diagnostic] = await waitForCodes(doc, ["unknown-key"]);
    const text = await apply(
      doc,
      await quickFixes(doc, diagnostic),
      "Did you mean 'font-size'?",
    );
    assert.strictEqual(text, "font-size = 14\n");
    await waitForCodes(doc, []);
  });

  test("quick fix: Remove line for a duplicate key", async () => {
    const doc = await openDoc(
      "font-size = 14\nfont-size = 15\ncursor-style = bar\n",
    );
    const [diagnostic] = await waitForCodes(doc, ["duplicate-key"]);
    const text = await apply(
      doc,
      await quickFixes(doc, diagnostic),
      "Remove line",
    );
    assert.strictEqual(text, "font-size = 14\ncursor-style = bar\n");
  });

  test("quick fix: Replace with a valid enum value", async () => {
    const doc = await openDoc("cursor-style = nope\n");
    const [diagnostic] = await waitForCodes(doc, ["invalid-value"]);
    const text = await apply(
      doc,
      await quickFixes(doc, diagnostic),
      "Replace with 'bar'",
    );
    assert.strictEqual(text, "cursor-style = bar\n");
    await waitForCodes(doc, []);
  });
});
