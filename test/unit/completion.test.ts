import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type {
  CompletionList,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { registerCompletionProvider } from "@/features/completion/provider";
import { ghosttyActions } from "@/ghostty/actions";
import {
  createDocument,
  createMockConnection,
  createMockDocuments,
} from "./helpers";

function setupCompletion(content: string) {
  const doc = createDocument(content);
  const connection = createMockConnection();
  const documents = createMockDocuments(doc);

  registerCompletionProvider(connection as never, documents as never);

  const handler = connection.onCompletion.mock.calls[0][0] as (
    params: TextDocumentPositionParams,
  ) => CompletionList | null;

  return (line: number, character: number) =>
    handler({
      textDocument: { uri: "file:///test.ghostty" },
      position: { line, character },
    });
}

describe("completion provider - key completions", () => {
  it("returns null for comment line", () => {
    const complete = setupCompletion("# comment");
    expect(complete(0, 5)).toBeNull();
  });

  it("returns completions for empty document", () => {
    const complete = setupCompletion("");
    const result = complete(0, 0);
    expect(result).not.toBeNull();
    expect(result?.items.length).toBeGreaterThan(0);
  });

  it("returns all keys when no prefix is typed", () => {
    const complete = setupCompletion("");
    const result = complete(0, 0);
    // schema defines ~202 keys
    expect(result?.items.length).toBeGreaterThan(100);
  });

  it("filters keys by typed prefix", () => {
    const complete = setupCompletion("font-s");
    const result = complete(0, 6);
    expect(result).not.toBeNull();
    expect(result?.items.every((item) => item.label.startsWith("font-s"))).toBe(
      true,
    );
  });

  it("excludes already-used non-additive keys", () => {
    const complete = setupCompletion("font-size = 12\nfont-");
    const result = complete(1, 5);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("font-size");
  });

  it("includes additive keys even when already used", () => {
    const complete = setupCompletion("keybind = ctrl+a\nkeyb");
    const result = complete(1, 4);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("keybind");
  });

  it("key completion inserts key followed by equals sign", () => {
    const complete = setupCompletion("font-size");
    const result = complete(0, 9);
    const item = result?.items.find((i) => i.label === "font-size");
    expect(item).toBeDefined();
    const edit = item?.textEdit as { newText: string };
    expect(edit.newText).toBe("font-size = ");
  });

  it("key completion uses Property kind", () => {
    const complete = setupCompletion("font-");
    const result = complete(0, 5);
    // CompletionItemKind.Property = 10
    expect(result?.items.every((i) => i.kind === 10)).toBe(true);
  });

  it("replacement range starts after leading whitespace", () => {
    const complete = setupCompletion("  font-");
    const result = complete(0, 7);
    const item = result?.items.find((i) => i.label === "font-family");
    expect(item).toBeDefined();
    const edit = item?.textEdit as {
      range: { start: { character: number }; end: { character: number } };
    };
    expect(edit.range.start.character).toBe(2);
    expect(edit.range.end.character).toBe(7);
  });

  it("offers no key completions when the cursor follows trailing whitespace", () => {
    const complete = setupCompletion(" font ");
    const result = complete(0, 6);
    expect(result?.items ?? []).toHaveLength(0);
  });
});

describe("completion provider - value completions", () => {
  it("returns true/false for a boolean key", () => {
    const complete = setupCompletion("font-thicken = ");
    const result = complete(0, 15);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("true");
    expect(labels).toContain("false");
  });

  it("returns enum values for an enum key", () => {
    const complete = setupCompletion("alpha-blending = ");
    const result = complete(0, 17);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("native");
    expect(labels).toContain("linear");
    expect(labels).toContain("linear-corrected");
  });

  it("suggests all values immediately after a comma in a comma-separated value", () => {
    const complete = setupCompletion("font-shaping-break = cursor,");
    const result = complete(0, 28);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("cursor");
    expect(labels).toContain("no-cursor");
  });

  it("filters value completions by typed prefix", () => {
    const complete = setupCompletion("alpha-blending = lin");
    const result = complete(0, 20);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("linear");
    expect(labels).toContain("linear-corrected");
    expect(labels).not.toContain("native");
  });

  it("returns null for unknown key after equals", () => {
    const complete = setupCompletion("unknown-key = ");
    expect(complete(0, 14)).toBeNull();
  });

  it("returns null for number key (no enum completions)", () => {
    const complete = setupCompletion("font-size = ");
    expect(complete(0, 12)).toBeNull();
  });

  it("value completion textEdit replaces the value prefix", () => {
    const complete = setupCompletion("alpha-blending = nat");
    const result = complete(0, 20);
    const item = result?.items.find((i) => i.label === "native");
    expect(item).toBeDefined();
    const edit = item?.textEdit as { newText: string };
    expect(edit.newText).toBe("native");
  });

  // Regression test for the schema/formatter color-key drift: cursor-color
  // must be tagged `assets: ["color"]` in schema.ts for completion to offer
  // named-color suggestions here, the same tag the formatter now relies on.
  it("returns named color suggestions for cursor-color", () => {
    const complete = setupCompletion("cursor-color = re");
    const result = complete(0, 17);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("red");
  });

  it("surfaces the corrected Ghostty value sets for affected keys", () => {
    const cases = [
      {
        input: "scrollbar = ",
        cursor: 12,
        expected: ["system", "never"],
        unexpected: ["always"],
      },
      {
        input: "window-subtitle = ",
        cursor: 18,
        expected: ["false", "working-directory"],
        unexpected: ["true"],
      },
      {
        input: "app-notifications = ",
        cursor: 20,
        expected: [
          "true",
          "false",
          "clipboard-copy",
          "config-reload",
          "no-clipboard-copy",
          "no-config-reload",
        ],
        unexpected: ["clipboard-paste", "no-clipboard-paste"],
      },
      {
        input: "macos-hidden = ",
        cursor: 15,
        expected: ["never", "always"],
        unexpected: ["true", "false"],
      },
      {
        input: "macos-applescript = ",
        cursor: 20,
        expected: ["true", "false"],
        unexpected: ["allow", "deny"],
      },
      {
        input: "gtk-tabs-location = ",
        cursor: 20,
        expected: ["top", "bottom"],
        unexpected: ["left", "right", "hidden"],
      },
    ] as const;

    for (const testCase of cases) {
      const complete = setupCompletion(testCase.input);
      const result = complete(0, testCase.cursor);
      const labels = result?.items.map((i) => i.label) ?? [];

      for (const value of testCase.expected) {
        expect(labels).toContain(value);
      }
      for (const value of testCase.unexpected) {
        expect(labels).not.toContain(value);
      }
    }
  });
});

describe("completion provider - keybind action completions", () => {
  beforeEach(() => {
    ghosttyActions.push(
      {
        name: "copy_to_clipboard",
        doc: "Copy the selected text to the clipboard.",
      },
      {
        name: "paste_from_clipboard",
        doc: "Paste the contents of the default clipboard.",
      },
      { name: "new_window", doc: "Open a new window." },
      { name: "reload_config", doc: "Reload the configuration." },
    );
  });

  afterEach(() => {
    ghosttyActions.length = 0;
  });

  it("suggests all actions after key_combo=", () => {
    const complete = setupCompletion("keybind = cmd+p=");
    const result = complete(0, 16);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("copy_to_clipboard");
    expect(labels).toContain("paste_from_clipboard");
    expect(labels).toContain("new_window");
  });

  it("filters actions by typed prefix", () => {
    const complete = setupCompletion("keybind = cmd+p=copy");
    const result = complete(0, 20);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("copy_to_clipboard");
    expect(labels).not.toContain("paste_from_clipboard");
    expect(labels).not.toContain("new_window");
  });

  it("uses first doc line as detail", () => {
    const complete = setupCompletion("keybind = cmd+p=new");
    const result = complete(0, 19);
    const item = result?.items.find((i) => i.label === "new_window");
    expect(item?.detail).toBe("Open a new window.");
  });

  it("does not suggest actions before the second =", () => {
    const complete = setupCompletion("keybind = cmd+p");
    const result = complete(0, 15);
    // cursor is before second =, so no action completions
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("copy_to_clipboard");
  });

  it("does not suggest actions for non-keybind keys", () => {
    const complete = setupCompletion("font-family = copy");
    const result = complete(0, 18);
    const labels = result?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("copy_to_clipboard");
  });
});
