import { describe, expect, it } from "bun:test";
import {
  colorPresentation,
  getDocumentColors,
  parseColor,
} from "@/features/colors/colors";

const summarize = (text: string) =>
  getDocumentColors(text).map(({ range, color }) => [
    range.start.line,
    range.start.character,
    range.end.character,
    color,
  ]);

describe("parseColor", () => {
  it.each([
    ["#ff8000", { red: 255, green: 128, blue: 0 }],
    ["FF8000", { red: 255, green: 128, blue: 0 }],
    ["#f80", { red: 255, green: 136, blue: 0 }],
    ["f80", { red: 255, green: 136, blue: 0 }],
    ["DodgerBlue", { red: 30, green: 144, blue: 255 }],
    ["dodger blue", { red: 30, green: 144, blue: 255 }],
    ["DODGERBLUE", { red: 30, green: 144, blue: 255 }],
  ])("%s", (token, expected) => {
    expect(parseColor(token)).toEqual(expected);
  });

  it.each(["", "#ff80", "bright", "extend", "cell-foreground", "#gggggg"])(
    "rejects %p",
    (token) => {
      expect(parseColor(token)).toBeUndefined();
    },
  );
});

describe("getDocumentColors", () => {
  it("finds colors on color keys only", () => {
    expect(
      summarize("background = #000000\nfont-size = 123\nforeground=red\n"),
    ).toEqual([
      [0, 13, 20, { red: 0, green: 0, blue: 0 }],
      [2, 11, 14, { red: 255, green: 0, blue: 0 }],
    ]);
  });

  it("finds the color after a palette index", () => {
    expect(summarize("palette = 1 = #ff0000")).toEqual([
      [0, 14, 21, { red: 255, green: 0, blue: 0 }],
    ]);
  });

  it("finds each segment of a comma-separated color key", () => {
    expect(summarize("macos-icon-screen-color = red, #00ff00")).toEqual([
      [0, 26, 29, { red: 255, green: 0, blue: 0 }],
      [0, 31, 38, { red: 0, green: 255, blue: 0 }],
    ]);
  });

  it("skips literals that are not colors", () => {
    expect(
      summarize("bold-color = bright\ncursor-color = cell-foreground"),
    ).toEqual([]);
  });

  it("ignores comments", () => {
    expect(summarize("# background = #000000")).toEqual([]);
  });
});

describe("colorPresentation", () => {
  const orange = { red: 1, green: 0.5, blue: 0 };

  it("keeps the replaced value's style", () => {
    expect(colorPresentation(orange, "#abcdef")).toBe("#ff8000");
    expect(colorPresentation(orange, "#ABCDEF")).toBe("#FF8000");
    expect(colorPresentation(orange, "abcdef")).toBe("ff8000");
    expect(colorPresentation(orange, "123")).toBe("ff8000");
  });

  it("writes named colors as prefixed hex", () => {
    expect(colorPresentation(orange, "Red")).toBe("#ff8000");
  });
});
