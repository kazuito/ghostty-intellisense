import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { parseDocument, parseLine, type Range } from "@/core/document";
import { ghosttyConfigOptions } from "@/core/schema";
import { getCodeActionSuggestions } from "@/features/codeActions/codeActions";
import { getCompletionSuggestions } from "@/features/completion/completion";
import {
  buildUnparsedErrorsDiagnostic,
  parseGhosttyOutput,
  validateInProcess,
} from "@/features/diagnostics";
import { getDocumentSymbols } from "@/features/documentSymbols/documentSymbols";
import {
  type FormatterOptions,
  formatDocument,
} from "@/features/formatter/formatter";
import { getHoverContent } from "@/features/hover/hover";

const keys = ghosttyConfigOptions.map((o) => o.key);
const enumValues = ghosttyConfigOptions.flatMap((o) => o.enum ?? []);

const junk = fc.string({
  unit: fc.constantFrom(..."ab#=, \t\"'-_:+.\r"),
  maxLength: 12,
});
const hex = fc
  .array(fc.constantFrom(..."0123456789abcdefABCDEF"), {
    minLength: 6,
    maxLength: 6,
  })
  .map((digits) => digits.join(""));
const value = fc.oneof(
  fc.constantFrom(...enumValues, "true", "FALSE", "True", "", "red"),
  hex,
  hex.map((h) => `#${h}`),
  fc.array(hex, { minLength: 1, maxLength: 3 }).map((hs) => hs.join(" ,")),
  junk.map((s) => `"${s}"`),
  fc.integer({ min: 0, max: 255 }).chain((i) => hex.map((h) => `${i}=${h}`)),
  junk,
);
const ws = fc.constantFrom("", " ", "  ", "\t");
const key = fc.oneof(fc.constantFrom(...keys, "palette"), junk);

const line = fc.oneof(
  fc
    .tuple(ws, key, ws, fc.constantFrom("=", "=="), ws, value, ws)
    .map((parts) => parts.join("")),
  fc.tuple(ws, junk).map(([w, s]) => `${w}# ${s}`),
  ws,
  junk,
);
const document = fc
  .tuple(
    fc.array(line, { maxLength: 15 }),
    fc.constantFrom("\n", "\r\n"),
    fc.boolean(),
  )
  .map(([lines, eol, trailing]) => lines.join(eol) + (trailing ? eol : ""));

const options: fc.Arbitrary<FormatterOptions> = fc.record({
  equalSpacing: fc.constantFrom("space", "no-space", "preserve"),
  blankLines: fc.constantFrom("collapse", "preserve"),
  colorCase: fc.constantFrom("uppercase", "lowercase", "preserve"),
  colorAddPrefix: fc.boolean(),
  booleanCase: fc.constantFrom("lowercase", "preserve"),
  commaSpacing: fc.constantFrom("space", "no-space", "preserve"),
  trimWhitespace: fc.boolean(),
});

function expectRangeInDocument(range: Range, lines: string[]) {
  expect(range.start.line).toBeGreaterThanOrEqual(0);
  expect(range.end.line).toBeLessThanOrEqual(lines.length);
  expect(range.start.character).toBeGreaterThanOrEqual(0);
  if (range.start.line === range.end.line) {
    expect(range.end.character).toBeGreaterThanOrEqual(range.start.character);
    expect(range.end.character).toBeLessThanOrEqual(
      lines[range.end.line]?.length ?? 0,
    );
  }
}

const nonBlankLines = (text: string) =>
  text.split(/\r*\n/).filter((l) => parseLine(l).type !== "blank");

describe("formatDocument properties", () => {
  it("is idempotent for every option combination", () => {
    fc.assert(
      fc.property(document, options, (text, opts) => {
        const once = formatDocument(text, opts);
        expect(formatDocument(once, opts)).toBe(once);
      }),
    );
  });

  it("keeps every non-blank line and leaves comments verbatim", () => {
    fc.assert(
      fc.property(document, options, (text, opts) => {
        const before = nonBlankLines(text);
        const after = nonBlankLines(formatDocument(text, opts));
        expect(after).toHaveLength(before.length);
        before.forEach((raw, i) => {
          if (parseLine(raw).type === "comment") expect(after[i]).toBe(raw);
        });
      }),
    );
  });

  it("normalizes every line ending to the style of the first one", () => {
    fc.assert(
      fc.property(document, options, (text, opts) => {
        const out = formatDocument(text, opts);
        const firstNewline = text.indexOf("\n");
        const crlf = firstNewline > 0 && text[firstNewline - 1] === "\r";
        const endings = out.match(/\r*\n/g) ?? [];
        for (const e of endings) expect(e).toBe(crlf ? "\r\n" : "\n");
      }),
    );
  });
});

describe("document parsing properties", () => {
  it("returns key/value ranges that slice back to the parsed text", () => {
    fc.assert(
      fc.property(document, (text) => {
        const lines = text.split("\n");
        for (const parsed of parseDocument(text)) {
          const raw = lines[parsed.line];
          expectRangeInDocument(parsed.lineRange, lines);
          if ("keyRange" in parsed) {
            const { start, end } = parsed.keyRange;
            expect(raw.slice(start.character, end.character)).toBe(parsed.key);
          }
          if ("valueRange" in parsed) {
            const { start, end } = parsed.valueRange;
            expect(raw.slice(start.character, end.character)).toBe(
              parsed.rawValue.trim(),
            );
          }
        }
      }),
    );
  });
});

describe("language feature properties", () => {
  it("hover and document symbols never throw and stay in range", () => {
    fc.assert(
      fc.property(document, (text) => {
        const lines = text.split("\n");
        for (const l of lines) getHoverContent(l);
        for (const symbol of getDocumentSymbols(text)) {
          expectRangeInDocument(symbol.range, lines);
          expectRangeInDocument(symbol.selectionRange, lines);
        }
      }),
    );
  });

  it("completion replacement ranges stay within the line up to the cursor", () => {
    fc.assert(
      fc.property(document, fc.nat(), fc.nat(), (text, lineSeed, charSeed) => {
        const lines = text.split("\n");
        const current = lines[lineSeed % lines.length];
        const cursor = charSeed % (current.length + 1);
        const suggestions = getCompletionSuggestions(
          text,
          current.slice(0, cursor),
          cursor,
        );
        for (const s of suggestions ?? []) {
          expect(s.replacementStart).toBeGreaterThanOrEqual(0);
          expect(s.replacementStart).toBeLessThanOrEqual(s.replacementEnd);
          expect(s.replacementEnd).toBeLessThanOrEqual(cursor);
        }
      }),
    );
  });

  it("in-process diagnostics and their quick fixes stay in range", () => {
    fc.assert(
      fc.property(document, (text) => {
        const lines = text.split("\n");
        const diagnostics = validateInProcess(text);
        for (const d of diagnostics) expectRangeInDocument(d.range, lines);
        for (const action of getCodeActionSuggestions(text, diagnostics)) {
          expectRangeInDocument(action.edit.range, lines);
        }
      }),
    );
  });
});

describe("ghostty output parsing properties", () => {
  const outputLine = fc.oneof(
    fc
      .tuple(fc.nat({ max: 20 }), fc.constantFrom(...keys, "bogus"), junk)
      .map(([n, k, msg]) => `/tmp/x:${n}:${k}: ${msg}`),
    fc
      .tuple(fc.constantFrom(...keys, "bogus"), junk)
      .map(([k, msg]) => `${k}: ${msg}`),
    fc.constant("/tmp/x:1:font-size: unknown field"),
    junk,
  );
  const output = fc
    .array(outputLine, { maxLength: 8 })
    .map((ls) => ls.join("\n"));

  it("maps arbitrary CLI output to diagnostics and fixes within the document", () => {
    fc.assert(
      fc.property(document, output, (text, out) => {
        const lines = text.split("\n");
        const diagnostics = parseGhosttyOutput(out, lines);
        const fallback = buildUnparsedErrorsDiagnostic(out, lines);
        if (fallback) diagnostics.push(fallback);
        for (const d of diagnostics) expectRangeInDocument(d.range, lines);
        for (const action of getCodeActionSuggestions(text, diagnostics)) {
          expectRangeInDocument(action.edit.range, lines);
        }
      }),
    );
  });
});
