import { describe, expect, it } from "bun:test";
import { parseDocument, parseDocumentLine, parseLine } from "@/core/document";

describe("document parser", () => {
  it("classifies blank, comment, unknown, and entry lines", () => {
    expect(parseLine("")).toEqual({ type: "blank" });
    expect(parseLine("# comment")).toEqual({
      type: "comment",
      raw: "# comment",
    });
    expect(parseLine("font-size")).toEqual({
      type: "unknown",
      key: "font-size",
      raw: "font-size",
    });
    expect(parseLine("font-size = 14")).toMatchObject({
      type: "entry",
      key: "font-size",
      rawValue: " 14",
      eqIndex: 10,
    });
  });

  it("adds ranges and line metadata for entry lines", () => {
    const line = parseDocumentLine("  font-size = 14", 3);
    expect(line.type).toBe("entry");
    if (line.type !== "entry") return;

    expect(line.line).toBe(3);
    expect(line.keyRange.start.character).toBe(2);
    expect(line.keyRange.end.character).toBe(11);
    expect(line.valueRange?.start.character).toBe(14);
    expect(line.valueRange?.end.character).toBe(16);
  });

  it("parses full documents line-by-line", () => {
    const lines = parseDocument("# comment\nfont-size = 14\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]?.type).toBe("comment");
    expect(lines[1]?.type).toBe("entry");
    expect(lines[2]?.type).toBe("blank");
  });
});
