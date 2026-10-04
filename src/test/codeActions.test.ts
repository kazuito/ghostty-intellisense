import { describe, expect, it, vi } from "bun:test";
import {
  type CodeAction,
  type Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver/node";
import { registerCodeActionProvider } from "@/features/codeActions/provider";
import { createDocument, createMockConnection } from "./helpers";

function setupCodeActions(content: string) {
  const doc = createDocument(content);
  const connection = createMockConnection();

  let handler: ((params: unknown) => CodeAction[]) | undefined;
  connection.onCodeAction.mockImplementation(
    (cb: (params: unknown) => CodeAction[]) => {
      handler = cb;
    },
  );

  const mockDocuments = {
    get: vi.fn(() => doc),
  };

  registerCodeActionProvider(connection as never, mockDocuments as never);

  const getActions = (
    line: number,
    diagnostics: Diagnostic[],
  ): CodeAction[] => {
    if (!handler) return [];
    return handler({
      textDocument: { uri: "file:///test.ghostty" },
      range: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
      context: { diagnostics, only: undefined },
    }) as CodeAction[];
  };

  return { getActions };
}

function makeWarning(line: number, message = "Unknown key"): Diagnostic {
  return {
    range: { start: { line, character: 0 }, end: { line, character: 5 } },
    message,
    severity: DiagnosticSeverity.Warning,
    code: "unknown-key",
  };
}

function makeUnknownFieldError(line: number, key: string): Diagnostic {
  return {
    range: {
      start: { line, character: 0 },
      end: { line, character: key.length },
    },
    message: "unknown field",
    severity: DiagnosticSeverity.Error,
    code: "unknown-key",
  };
}

function makeInfo(line: number, message = "Duplicate key"): Diagnostic {
  return {
    range: { start: { line, character: 0 }, end: { line, character: 5 } },
    message,
    severity: DiagnosticSeverity.Information,
    code: "duplicate-key",
  };
}

function makeError(
  line: number,
  charStart: number,
  charEnd: number,
  message = "Invalid value",
): Diagnostic {
  return {
    range: {
      start: { line, character: charStart },
      end: { line, character: charEnd },
    },
    message,
    severity: DiagnosticSeverity.Error,
  };
}

function getActionEdits(action: CodeAction | undefined) {
  expect(action).toBeDefined();
  const changes = action?.edit?.changes;
  expect(changes).toBeDefined();
  const edits = Object.values(changes ?? {})[0];
  expect(edits).toBeDefined();
  return edits ?? [];
}

describe("code actions - empty diagnostics", () => {
  it("returns empty array when no diagnostics", () => {
    const { getActions } = setupCodeActions("font-size = 14");
    expect(getActions(0, [])).toHaveLength(0);
  });
});

describe("code actions - unknown key", () => {
  it("offers 'Remove line' for current unknown field error diagnostics", () => {
    const { getActions } = setupCodeActions("not-a-real-key = value");
    const actions = getActions(0, [makeUnknownFieldError(0, "not-a-real-key")]);
    const titles = actions.map((a) => a.title);
    expect(titles).toContain("Remove line");
  });

  it("offers 'Did you mean?' for a close typo from an unknown field error", () => {
    const { getActions } = setupCodeActions("font-siz = 14");
    const actions = getActions(0, [makeUnknownFieldError(0, "font-siz")]);
    const suggestion = actions.find((a) => a.title.startsWith("Did you mean"));
    expect(suggestion).toBeDefined();
    expect(suggestion?.title).toContain("font-size");
  });

  it("offers 'Did you mean?' for a close typo (font-siz)", () => {
    const { getActions } = setupCodeActions("font-siz = 14");
    const actions = getActions(0, [makeWarning(0)]);
    const suggestion = actions.find((a) => a.title.startsWith("Did you mean"));
    expect(suggestion).toBeDefined();
    expect(suggestion?.title).toContain("font-size");
  });

  it("does not offer 'Did you mean?' when no close match", () => {
    const { getActions } = setupCodeActions("xyzzy-totally-bogus = value");
    const actions = getActions(0, [makeWarning(0)]);
    const suggestions = actions.filter((a) =>
      a.title.startsWith("Did you mean"),
    );
    expect(suggestions).toHaveLength(0);
  });

  it("offers up to 3 'Did you mean?' suggestions", () => {
    const { getActions } = setupCodeActions("font-siz = 14");
    const actions = getActions(0, [makeWarning(0)]);
    const suggestions = actions.filter((a) =>
      a.title.startsWith("Did you mean"),
    );
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("'Did you mean?' action replaces the key text", () => {
    const { getActions } = setupCodeActions("font-siz = 14");
    const actions = getActions(0, [makeWarning(0)]);
    const suggestion = actions.find((a) => a.title.includes("font-size"));
    const edits = getActionEdits(suggestion);
    expect(edits[0]?.newText).toBe("font-size");
  });
});

describe("code actions - duplicate key (information)", () => {
  it("offers 'Remove line' for duplicate key", () => {
    const content = "font-size = 12\nfont-size = 14";
    const { getActions } = setupCodeActions(content);
    const actions = getActions(1, [makeInfo(1)]);
    const titles = actions.map((a) => a.title);
    expect(titles).toContain("Remove line");
  });

  it("does not offer 'Did you mean?' for duplicate", () => {
    const content = "font-size = 12\nfont-size = 14";
    const { getActions } = setupCodeActions(content);
    const actions = getActions(1, [makeInfo(1)]);
    const suggestions = actions.filter((a) =>
      a.title.startsWith("Did you mean"),
    );
    expect(suggestions).toHaveLength(0);
  });
});

describe("code actions - invalid value (error)", () => {
  it("offers 'Replace with true' and 'Replace with false' for invalid boolean", () => {
    const content = "font-thicken = notabool";
    // value "notabool" starts at character 15
    const valueStart = content.indexOf("notabool");
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [
      makeError(0, valueStart, valueStart + "notabool".length),
    ]);
    const titles = actions.map((a) => a.title);
    expect(titles).toContain("Replace with 'true'");
    expect(titles).toContain("Replace with 'false'");
  });

  it("offers enum replacements for invalid enum value", () => {
    const content = "alpha-blending = bad-value";
    const valueStart = content.indexOf("bad-value");
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [
      makeError(0, valueStart, valueStart + "bad-value".length),
    ]);
    const titles = actions.map((a) => a.title);
    // alpha-blending has enum values like 'native', 'linear'
    expect(titles.some((t) => t.startsWith("Replace with"))).toBe(true);
  });

  it("caps replacement actions at 5", () => {
    const content = "alpha-blending = bad-value";
    const valueStart = content.indexOf("bad-value");
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [
      makeError(0, valueStart, valueStart + "bad-value".length),
    ]);
    const replacements = actions.filter((a) =>
      a.title.startsWith("Replace with"),
    );
    expect(replacements.length).toBeLessThanOrEqual(5);
  });

  it("does not offer replacement actions for number key errors", () => {
    const content = "font-size = abc";
    const valueStart = content.indexOf("abc");
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [
      makeError(0, valueStart, valueStart + "abc".length),
    ]);
    const replacements = actions.filter((a) =>
      a.title.startsWith("Replace with"),
    );
    expect(replacements).toHaveLength(0);
  });
});

describe("code actions - 'Remove line' edit", () => {
  it("deletes the full line including newline when not last line", () => {
    const content = "not-a-real-key = value\nfont-size = 14";
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [makeWarning(0)]);
    const removeAction = actions.find((a) => a.title === "Remove line");
    const edits = getActionEdits(removeAction);
    // Should delete from line 0 char 0 to line 1 char 0
    expect(edits[0]?.range.start.line).toBe(0);
    expect(edits[0]?.range.start.character).toBe(0);
    expect(edits[0]?.range.end.line).toBe(1);
    expect(edits[0]?.range.end.character).toBe(0);
  });

  it("deletes to end of line when it is the last line", () => {
    const content = "not-a-real-key = value";
    const { getActions } = setupCodeActions(content);
    const actions = getActions(0, [makeWarning(0)]);
    const removeAction = actions.find((a) => a.title === "Remove line");
    const edits = getActionEdits(removeAction);
    expect(edits[0]?.range.start.line).toBe(0);
    expect(edits[0]?.range.end.line).toBe(0);
    expect(edits[0]?.range.end.character).toBe(content.length);
  });
});
