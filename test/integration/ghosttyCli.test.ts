import { afterAll, describe, expect, it } from "bun:test";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { configMetadata } from "@/core/schema";
import {
  createValidationTempPath,
  parseGhosttyOutput,
  runGhosttyValidation,
} from "@/features/diagnostics";
import { parseActionsOutput } from "@/ghostty/actions";
import { GHOSTTY_CLI_FLAGS } from "@/ghostty/constants";
import { parseDefaultsOutput } from "@/ghostty/defaults";
import { parseFontsOutput } from "@/ghostty/fonts";
import { isGhosttyAvailableAsync, runGhosttyAsync } from "@/ghostty/ghostty";

const available = await isGhosttyAvailableAsync();
if (!available && process.env.CI) {
  throw new Error("ghostty CLI not found; CI must install it for these tests");
}

const tmpPath = createValidationTempPath();
const fakeGhostty = path.resolve(
  import.meta.dirname,
  "../e2e/fixtures/bin/ghostty",
);

async function validate(text: string, executablePath = "") {
  const { output, reportedErrors } = await runGhosttyValidation(
    text,
    executablePath,
    tmpPath,
  );
  return {
    reportedErrors,
    diagnostics: parseGhosttyOutput(output, text.split("\n")),
  };
}

afterAll(() => unlink(tmpPath).catch(() => {}));

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

  it("matches the E2E fake CLI's validate-config output", async () => {
    const text =
      "font-size = 14\nbogus-key = 1\ncursor-style = nope\nfont-sise = 12\ncursor-style = bar\n";
    const fake = await validate(text, fakeGhostty);
    const real = await validate(text);
    expect(fake).toEqual(real);
  });

  it("produces output the data loaders can parse", async () => {
    const [defaults, fonts, actions] = await Promise.all([
      runGhosttyAsync([
        GHOSTTY_CLI_FLAGS.SHOW_CONFIG,
        GHOSTTY_CLI_FLAGS.DEFAULT,
      ]),
      runGhosttyAsync([GHOSTTY_CLI_FLAGS.LIST_FONTS]),
      runGhosttyAsync([GHOSTTY_CLI_FLAGS.LIST_ACTIONS, GHOSTTY_CLI_FLAGS.DOCS]),
    ]);
    expect(parseDefaultsOutput(defaults).has("font-size")).toBe(true);
    expect(parseFontsOutput(fonts).length).toBeGreaterThan(0);
    expect(parseActionsOutput(actions).map((a) => a.name)).toContain("new_tab");
  });

  // Overlay values the installed Ghostty rejects, pending confirmation that
  // they exist upstream (keep) or are stale (remove from configMetadata).
  // CI pins its Ghostty version in .github/workflows/ci.yml; revisit this
  // list when bumping it.
  const newerThanInstalled = new Set([
    "macos-window-buttons = macos-native",
    ...["floating", "hidden", "dock"].flatMap((v) => [
      `progress-style = ${v}`,
      `progress-style = no-${v}`,
    ]),
  ]);

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
});
