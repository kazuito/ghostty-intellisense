import { describe, expect, it } from "bun:test";
import { configSourceToMdx, parseEntries } from "../../scripts/gen-config";

// Mirrors the shapes webgen handles in upstream Config.zig.
const source = `/// Config is the main config struct.

// Not a doc comment.
const Config = @This();

/// The font families to use.
///
///     font-family = ""
///
/// Note: this is a note.
/// It spans two lines.
@"font-family": RepeatableString = .{},
@"font-family-bold": RepeatableString = .{},

/// Documented after a plain comment.
// Plain comments don't detach the doc comment.

theme: ?Theme = null,

pub const Theme = struct {
    /// Nested fields are not config keys.
    light: []const u8,
};

/// Internal.
_arena: ?ArenaAllocator = null,
undocumented: bool = false,
`;

describe("configSourceToMdx", () => {
  it("renders the reference MDX the way upstream webgen does", () => {
    expect(configSourceToMdx(source)).toBe(
      [
        "## `font-family`",
        "## `font-family-bold`",
        "",
        "The font families to use.",
        "",
        "```",
        'font-family = ""',
        "```",
        "",
        "<Note>",
        " this is a note.",
        "It spans two lines.",
        "</Note>",
        "",
        "## `theme`",
        "",
        "Documented after a plain comment.",
        "",
        "",
      ].join("\n"),
    );
  });

  it("yields grouped keys sharing the group's description", () => {
    expect(parseEntries(configSourceToMdx(source))).toEqual([
      { key: "font-family", desc: "The font families to use." },
      { key: "font-family-bold", desc: "The font families to use." },
      { key: "theme", desc: "Documented after a plain comment." },
    ]);
  });
});
