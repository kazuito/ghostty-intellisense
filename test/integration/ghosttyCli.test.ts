import { afterAll, describe, expect, it } from "bun:test";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { configMetadata, deprecatedValues, renamedKeys } from "@/core/schema";
import {
  createValidationTempPath,
  parseGhosttyOutput,
  runGhosttyValidation,
} from "@/features/diagnostics";
import { parseActionsOutput } from "@/ghostty/actions";
import { GHOSTTY_CLI_FLAGS } from "@/ghostty/constants";
import { parseDefaultsOutput } from "@/ghostty/defaults";
import { parseFontsOutput } from "@/ghostty/fonts";
import { runGhosttyAsync } from "@/ghostty/ghostty";
import {
  GHOSTTY_PIN,
  ghosttyVersionOf,
  pinMismatchMessage,
  pinnedGhosttyBin,
} from "../ghostty";

const ghostty = pinnedGhosttyBin(path.resolve(import.meta.dirname, "../.."));
const version = ghosttyVersionOf(ghostty);
const available = version !== undefined;
if (!available && process.env.CI) {
  throw new Error("ghostty CLI not found; CI must install it for these tests");
}
if (available && version !== GHOSTTY_PIN.version) {
  throw new Error(pinMismatchMessage(ghostty, version));
}

const tmpPath = createValidationTempPath();

async function validate(text: string) {
  const { output, reportedErrors } = await runGhosttyValidation(
    text,
    ghostty,
    tmpPath,
  );
  return {
    reportedErrors,
    diagnostics: parseGhosttyOutput(output, text.split("\n"), tmpPath),
  };
}

afterAll(async () => {
  await unlink(tmpPath).catch(() => {});
});

describe.skipIf(!available)("real ghostty CLI", () => {
  it("accepts a valid config", async () => {
    const { reportedErrors, diagnostics } = await validate(
      "font-size = 14\ncursor-style = bar\nkeybind = cmd+t=new_tab\n",
    );
    expect(reportedErrors).toBe(false);
    expect(diagnostics).toEqual([]);
  });

  it("maps unknown keys and invalid values to their lines", async () => {
    const text =
      "font-size = 14\nbogus-key = 1\ncursor-style = nope\nfont-size = abc\n";
    const { reportedErrors, diagnostics } = await validate(text);
    expect(reportedErrors).toBe(true);
    expect(
      diagnostics.map((d) => [
        d.code,
        d.range.start.line,
        d.range.start.character,
        d.range.end.character,
      ]),
    ).toEqual([
      ["unknown-key", 1, 0, 9],
      ["invalid-value", 2, 15, 19],
      ["invalid-value", 3, 12, 15],
    ]);
  });

  it("produces output the data loaders can parse", async () => {
    const [defaults, fonts, actions] = await Promise.all([
      runGhosttyAsync(
        [GHOSTTY_CLI_FLAGS.SHOW_CONFIG, GHOSTTY_CLI_FLAGS.DEFAULT],
        ghostty,
      ),
      runGhosttyAsync([GHOSTTY_CLI_FLAGS.LIST_FONTS], ghostty),
      runGhosttyAsync(
        [GHOSTTY_CLI_FLAGS.LIST_ACTIONS, GHOSTTY_CLI_FLAGS.DOCS],
        ghostty,
      ),
    ]);
    expect(parseDefaultsOutput(defaults).has("font-size")).toBe(true);
    expect(parseFontsOutput(fonts).length).toBeGreaterThan(0);
    expect(parseActionsOutput(actions).map((a) => a.name)).toContain("new_tab");
  });

  // Overlay values the installed Ghostty rejects, pending confirmation that
  // they exist upstream (keep) or are stale (remove from configMetadata).
  // Revisit this list when bumping test/ghostty-pin.json.
  const newerThanInstalled = new Set<string>();

  it("accepts every enum value in the hand-curated overlay", async () => {
    const lines = Object.entries(configMetadata)
      .flatMap(([key, meta]) =>
        (meta?.enum ?? []).map((value) => `${key} = ${value}`),
      )
      .filter((line) => !newerThanInstalled.has(line));
    const { diagnostics } = await validate(lines.join("\n"));
    const rejected = diagnostics
      .filter((d) => d.code === "invalid-value")
      .map((d) => lines[d.range.start.line]);
    expect(rejected).toEqual([]);
  });

  // A valid value for each old key, so the line exercises the rename itself.
  const renamedKeySamples: Record<string, string> = {
    "background-blur-radius": "20",
    "adw-toolbar-style": "flat",
    "scrollback-limit": "1000",
  };

  it("still accepts every renamed key and deprecated value", async () => {
    expect(Object.keys(renamedKeySamples).sort()).toEqual(
      [...renamedKeys.keys()].sort(),
    );
    const lines = [
      ...Object.entries(renamedKeySamples).map(([k, v]) => `${k} = ${v}`),
      ...Object.entries(deprecatedValues).flatMap(([key, values]) =>
        Object.keys(values ?? {}).map((value) => `${key} = ${value}`),
      ),
    ];
    const { reportedErrors, diagnostics } = await validate(lines.join("\n"));
    expect(diagnostics.map((d) => lines[d.range.start.line])).toEqual([]);
    expect(reportedErrors).toBe(false);
  });
});
