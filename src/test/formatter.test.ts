import { describe, expect, it } from "bun:test";
import type {
  DocumentFormattingParams,
  TextEdit,
} from "vscode-languageserver/node";
import { parseLine } from "@/core/document";
import {
  DEFAULT_FORMATTER_OPTIONS,
  type FormatterOptions,
  formatBoolean,
  formatColor,
  formatCommaSeparated,
  formatDocument,
  formatLine,
  formatPaletteValue,
  isHexColor,
} from "@/features/formatter/formatter";
import { registerFormatterProvider } from "@/features/formatter/provider";
import {
  createDocument,
  createMockConnection,
  createMockDocuments,
} from "./helpers";

// Shorthand: merge overrides onto defaults
function opts(overrides: Partial<FormatterOptions> = {}): FormatterOptions {
  return { ...DEFAULT_FORMATTER_OPTIONS, ...overrides };
}

function setupFormatter(content: string) {
  const doc = createDocument(content);
  const connection = createMockConnection();
  const documents = createMockDocuments(doc);

  registerFormatterProvider(connection as never, documents as never);

  const handler = connection.onDocumentFormatting.mock.calls[0][0] as (
    params: DocumentFormattingParams,
  ) => Promise<TextEdit[] | null>;

  return {
    connection,
    documents,
    format: (uri = "file:///test.ghostty") =>
      handler({
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      }),
  };
}

// ── isHexColor ────────────────────────────────────────────────────────────────

describe("isHexColor", () => {
  it("accepts 6-digit lowercase hex", () =>
    expect(isHexColor("aabbcc")).toBe(true));
  it("accepts 6-digit uppercase hex", () =>
    expect(isHexColor("AABBCC")).toBe(true));
  it("accepts mixed case hex", () => expect(isHexColor("aAbBcC")).toBe(true));
  it("accepts prefixed hex", () => expect(isHexColor("#1a2b3c")).toBe(true));
  it("rejects 3-digit shorthand", () => expect(isHexColor("abc")).toBe(false));
  it("rejects 8-digit hex (alpha)", () =>
    expect(isHexColor("aabbccdd")).toBe(false));
  it("rejects named color", () => expect(isHexColor("red")).toBe(false));
  it("rejects empty string", () => expect(isHexColor("")).toBe(false));
  it("rejects non-hex characters", () =>
    expect(isHexColor("gggggg")).toBe(false));
  it("rejects keyword 'background'", () =>
    expect(isHexColor("background")).toBe(false));
});

// ── formatColor ───────────────────────────────────────────────────────────────

describe("formatColor", () => {
  it("uppercases hex digits", () =>
    expect(
      formatColor(
        "aabbcc",
        opts({ colorCase: "uppercase", colorAddPrefix: false }),
      ),
    ).toBe("AABBCC"));

  it("lowercases hex digits", () =>
    expect(
      formatColor(
        "AABBCC",
        opts({ colorCase: "lowercase", colorAddPrefix: false }),
      ),
    ).toBe("aabbcc"));

  it("preserves case when asked", () =>
    expect(
      formatColor(
        "aAbBcC",
        opts({ colorCase: "preserve", colorAddPrefix: false }),
      ),
    ).toBe("aAbBcC"));

  it("adds '#' prefix when colorAddPrefix is true", () =>
    expect(
      formatColor(
        "aabbcc",
        opts({ colorCase: "lowercase", colorAddPrefix: true }),
      ),
    ).toBe("#aabbcc"));

  it("removes '#' prefix when colorAddPrefix is false", () =>
    expect(
      formatColor(
        "#aabbcc",
        opts({ colorCase: "lowercase", colorAddPrefix: false }),
      ),
    ).toBe("aabbcc"));

  it("passes non-hex value through unchanged", () =>
    expect(formatColor("cell-foreground", opts())).toBe("cell-foreground"));

  it("passes named color 'background' through unchanged", () =>
    expect(formatColor("background", opts())).toBe("background"));
});

// ── formatBoolean ─────────────────────────────────────────────────────────────

describe("formatBoolean", () => {
  it("lowercases TRUE", () =>
    expect(formatBoolean("TRUE", opts({ booleanCase: "lowercase" }))).toBe(
      "true",
    ));

  it("lowercases FALSE", () =>
    expect(formatBoolean("FALSE", opts({ booleanCase: "lowercase" }))).toBe(
      "false",
    ));

  it("lowercases mixed-case True", () =>
    expect(formatBoolean("True", opts({ booleanCase: "lowercase" }))).toBe(
      "true",
    ));

  it("preserves TRUE when booleanCase is preserve", () =>
    expect(formatBoolean("TRUE", opts({ booleanCase: "preserve" }))).toBe(
      "TRUE",
    ));

  it("passes non-boolean value through unchanged", () =>
    expect(formatBoolean("linear", opts({ booleanCase: "lowercase" }))).toBe(
      "linear",
    ));
});

// ── formatCommaSeparated ──────────────────────────────────────────────────────

describe("formatCommaSeparated", () => {
  const identity = (t: string) => t;

  it("joins with ', ' in space mode", () =>
    expect(
      formatCommaSeparated("a,b,c", opts({ commaSpacing: "space" }), identity),
    ).toBe("a, b, c"));

  it("joins with ',' in no-space mode", () =>
    expect(
      formatCommaSeparated(
        "a, b, c",
        opts({ commaSpacing: "no-space" }),
        identity,
      ),
    ).toBe("a,b,c"));

  it("preserves existing spacing in preserve mode", () =>
    expect(
      formatCommaSeparated(
        "a,  b ,c",
        opts({ commaSpacing: "preserve" }),
        identity,
      ),
    ).toBe("a,  b ,c"));

  it("applies token formatter in space mode", () =>
    expect(
      formatCommaSeparated("aa,bb", opts({ commaSpacing: "space" }), (t) =>
        t.toUpperCase(),
      ),
    ).toBe("AA, BB"));

  it("applies token formatter in preserve mode", () =>
    expect(
      formatCommaSeparated(
        " aa , bb ",
        opts({ commaSpacing: "preserve" }),
        (t) => t.toUpperCase(),
      ),
    ).toBe(" AA , BB "));
});

// ── formatPaletteValue ────────────────────────────────────────────────────────

describe("formatPaletteValue", () => {
  it("formats the color portion after the inner '='", () =>
    expect(
      formatPaletteValue(
        "0=aabbcc",
        opts({ colorCase: "uppercase", colorAddPrefix: true }),
      ),
    ).toBe("0=#AABBCC"));

  it("preserves the palette index", () =>
    expect(
      formatPaletteValue(
        "15=ffeeaa",
        opts({ colorCase: "lowercase", colorAddPrefix: false }),
      ),
    ).toBe("15=ffeeaa"));

  it("returns malformed value unchanged (no inner '=')", () =>
    expect(formatPaletteValue("bad-value", opts())).toBe("bad-value"));
});

// ── parseLine ─────────────────────────────────────────────────────────────────

describe("parseLine", () => {
  it("parses blank line", () =>
    expect(parseLine("")).toEqual({ type: "blank" }));
  it("parses whitespace-only line as blank", () =>
    expect(parseLine("   ")).toEqual({ type: "blank" }));

  it("parses comment line", () =>
    expect(parseLine("# a comment")).toEqual({
      type: "comment",
      raw: "# a comment",
    }));

  it("parses indented comment line", () =>
    expect(parseLine("  # comment")).toEqual({
      type: "comment",
      raw: "  # comment",
    }));

  it("parses normal key=value entry", () => {
    const result = parseLine("font-size = 14");
    expect(result.type).toBe("entry");
    if (result.type !== "entry") return;
    expect(result.key).toBe("font-size");
    expect(result.rawValue).toBe(" 14");
    expect(result.eqIndex).toBe(10);
  });

  it("parses entry with no spaces around '='", () => {
    const result = parseLine("font-size=14");
    expect(result.type).toBe("entry");
    if (result.type !== "entry") return;
    expect(result.key).toBe("font-size");
    expect(result.rawValue).toBe("14");
  });

  it("parses entry with empty value", () => {
    const result = parseLine("font-family =");
    expect(result.type).toBe("entry");
    if (result.type !== "entry") return;
    expect(result.key).toBe("font-family");
    expect(result.rawValue).toBe("");
  });

  it("returns unknown for line without '='", () =>
    expect(parseLine("no-equals-here")).toEqual({
      type: "unknown",
      raw: "no-equals-here",
    }));
});

// ── formatLine ────────────────────────────────────────────────────────────────

describe("formatLine", () => {
  it("blank line → empty string", () =>
    expect(formatLine({ type: "blank" }, opts())).toBe(""));

  it("comment line → raw unchanged", () =>
    expect(formatLine({ type: "comment", raw: "# my comment" }, opts())).toBe(
      "# my comment",
    ));

  it("unknown line → trimmed when trimWhitespace is true", () =>
    expect(
      formatLine(
        { type: "unknown", raw: "  bad line  " },
        opts({ trimWhitespace: true }),
      ),
    ).toBe("bad line"));

  it("unknown line → preserved when trimWhitespace is false", () =>
    expect(
      formatLine(
        { type: "unknown", raw: "  bad line  " },
        opts({ trimWhitespace: false }),
      ),
    ).toBe("  bad line  "));

  it("entry: space equalSpacing produces 'key = value'", () => {
    const parsed = parseLine("font-size=14");
    expect(formatLine(parsed, opts({ equalSpacing: "space" }))).toBe(
      "font-size = 14",
    );
  });

  it("entry: no-space equalSpacing produces 'key=value'", () => {
    const parsed = parseLine("font-size = 14");
    expect(formatLine(parsed, opts({ equalSpacing: "no-space" }))).toBe(
      "font-size=14",
    );
  });

  it("entry: preserve equalSpacing keeps original spacing", () => {
    const parsed = parseLine("font-size  =  14");
    expect(formatLine(parsed, opts({ equalSpacing: "preserve" }))).toBe(
      "font-size  =  14",
    );
  });

  it("entry with empty value does not produce trailing space", () => {
    const parsed = parseLine("font-family =");
    expect(formatLine(parsed, opts({ equalSpacing: "space" }))).toBe(
      "font-family =",
    );
  });

  it("entry: trimWhitespace trims leading indent in preserve mode", () => {
    const parsed = parseLine("  font-size  =  14");
    expect(
      formatLine(
        parsed,
        opts({ equalSpacing: "preserve", trimWhitespace: true }),
      ),
    ).toBe("font-size  =  14");
  });
});

// ── formatDocument ────────────────────────────────────────────────────────────

describe("formatDocument", () => {
  it("simple document round-trip with defaults", () => {
    const input = "font-size = 14\nfont-thicken = true\n";
    expect(formatDocument(input, opts())).toBe(
      "font-size = 14\nfont-thicken = true\n",
    );
  });

  it("normalizes boolean values", () => {
    const input = "font-thicken = TRUE\n";
    expect(formatDocument(input, opts({ booleanCase: "lowercase" }))).toBe(
      "font-thicken = true\n",
    );
  });

  it("normalizes color values", () => {
    const input = "background = aabbcc\n";
    expect(
      formatDocument(
        input,
        opts({ colorCase: "uppercase", colorAddPrefix: true }),
      ),
    ).toBe("background = #AABBCC\n");
  });

  it("collapses consecutive blank lines", () => {
    const input = "a = 1\n\n\n\nb = 2\n";
    expect(formatDocument(input, opts({ blankLines: "collapse" }))).toBe(
      "a = 1\n\nb = 2\n",
    );
  });

  it("preserves consecutive blank lines when asked", () => {
    const input = "a = 1\n\n\nb = 2\n";
    expect(formatDocument(input, opts({ blankLines: "preserve" }))).toBe(
      "a = 1\n\n\nb = 2\n",
    );
  });

  it("normalizes equal spacing to no-space", () => {
    const input = "font-size = 14\n";
    expect(formatDocument(input, opts({ equalSpacing: "no-space" }))).toBe(
      "font-size=14\n",
    );
  });

  it("preserves trailing newline", () => {
    const input = "font-size = 14\n";
    expect(formatDocument(input, opts()).endsWith("\n")).toBe(true);
  });

  it("does not add trailing newline when not present", () => {
    const input = "font-size = 14";
    expect(formatDocument(input, opts()).endsWith("\n")).toBe(false);
  });

  it("handles palette entries", () => {
    const input = "palette = 0=aabbcc\n";
    expect(
      formatDocument(
        input,
        opts({ colorCase: "uppercase", colorAddPrefix: true }),
      ),
    ).toBe("palette = 0=#AABBCC\n");
  });

  it.each([
    "cursor-color",
    "selection-foreground",
    "selection-background",
    "window-padding-color",
  ])("normalizes hex color values for %s (schema-driven assets)", (key) => {
    const input = `${key} = aabbcc\n`;
    expect(
      formatDocument(
        input,
        opts({ colorCase: "uppercase", colorAddPrefix: true }),
      ),
    ).toBe(`${key} = #AABBCC\n`);
  });

  it("handles comma-separated color key (macos-icon-screen-color)", () => {
    const input = "macos-icon-screen-color = aabbcc,112233\n";
    expect(
      formatDocument(
        input,
        opts({
          colorCase: "uppercase",
          colorAddPrefix: true,
          commaSpacing: "space",
        }),
      ),
    ).toBe("macos-icon-screen-color = #AABBCC, #112233\n");
  });

  it("leaves comment lines unchanged", () => {
    const input = "# This is a comment\nfont-size = 14\n";
    expect(formatDocument(input, opts())).toBe(
      "# This is a comment\nfont-size = 14\n",
    );
  });

  it("trims leading whitespace from entry lines", () => {
    const input = "  font-size = 14\n";
    expect(formatDocument(input, opts({ trimWhitespace: true }))).toBe(
      "font-size = 14\n",
    );
  });

  it("returns unchanged string when no formatting is needed", () => {
    const input = "font-size = 14\n";
    const result = formatDocument(input, opts());
    expect(result).toBe(input);
  });

  it("handles empty document", () => {
    expect(formatDocument("", opts())).toBe("");
  });

  it("handles document with only blank lines", () => {
    expect(formatDocument("\n\n\n", opts({ blankLines: "collapse" }))).toBe(
      "\n",
    );
  });

  it("preserves CRLF line endings across entry, comment, and blank lines", () => {
    const input = "font-size = 14\r\n# comment\r\nfont-thicken=TRUE\r\n";
    const result = formatDocument(input, opts());
    expect(result).toBe(
      "font-size = 14\r\n# comment\r\nfont-thicken = true\r\n",
    );
    expect(result).not.toMatch(/[^\r]\n/);
  });

  it("normalizes mixed LF/CRLF input to whichever ending appears first", () => {
    const input = "a = 1\nb = 2\r\nc = 3\n";
    expect(formatDocument(input, opts())).toBe("a = 1\nb = 2\nc = 3\n");
  });

  it("keeps CRLF with no trailing newline", () => {
    const input = "font-size = 14\r\nfont-thicken=TRUE";
    expect(formatDocument(input, opts())).toBe(
      "font-size = 14\r\nfont-thicken = true",
    );
  });

  it("is idempotent when re-formatting its own CRLF output", () => {
    const input = "font-size = 14\r\n# comment\r\nfont-thicken=TRUE\r\n";
    const once = formatDocument(input, opts());
    expect(formatDocument(once, opts())).toBe(once);
  });
});

// ── registerFormatterProvider ────────────────────────────────────────────────

describe("registerFormatterProvider", () => {
  it("returns a single TextEdit covering the whole document when it changes", async () => {
    const { format } = setupFormatter("font-thicken=TRUE\n");
    const edits = await format();
    expect(edits).toEqual([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        newText: "font-thicken = true\n",
      },
    ]);
  });

  it("returns an empty array when the document is already formatted", async () => {
    const { format } = setupFormatter("font-thicken = true\n");
    expect(await format()).toEqual([]);
  });

  it("returns null for an unknown document URI", async () => {
    const { documents, format } = setupFormatter("font-thicken = true\n");
    documents.get.mockReturnValueOnce(undefined);
    expect(await format("file:///missing.ghostty")).toBeNull();
  });
});
