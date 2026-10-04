import { afterEach, describe, expect, it, mock } from "bun:test";
import * as childProcess from "node:child_process";

const cliOutput = new Map<string, string>();
const execFile = mock(
  (
    _bin: string,
    args: string[],
    _opts: unknown,
    callback: (err: Error | null, stdout: string) => void,
  ) => {
    const output = cliOutput.get(args.join(" "));
    callback(
      output === undefined ? new Error("not found") : null,
      output ?? "",
    );
  },
);
mock.module("node:child_process", () => ({ ...childProcess, execFile }));

import { ghosttyActions, loadGhosttyActionsAsync } from "@/ghostty/actions";
import { ghosttyDefaults, loadGhosttyDefaultsAsync } from "@/ghostty/defaults";
import { ghosttyFonts, loadGhosttyFontsAsync } from "@/ghostty/fonts";
import { clearGhosttyData, reloadGhosttyData } from "@/ghostty/reload";

afterEach(() => {
  clearGhosttyData();
  cliOutput.clear();
  execFile.mockClear();
});

describe("async loaders", () => {
  it("populates defaults from CLI output", async () => {
    cliOutput.set(
      "+show-config --default",
      "font-size = 13\nbackground = 1a1b26\n",
    );
    await loadGhosttyDefaultsAsync();
    expect(ghosttyDefaults.get("font-size")).toBe("13");
    expect(ghosttyDefaults.get("background")).toBe("1a1b26");
  });

  it("populates fonts, skipping indented lines", async () => {
    cliOutput.set("+list-fonts", "JetBrains Mono\n  italic\nFira Code\n");
    await loadGhosttyFontsAsync();
    expect(ghosttyFonts).toEqual(["JetBrains Mono", "Fira Code"]);
  });

  it("populates actions from --docs output", async () => {
    cliOutput.set(
      "+list-actions --docs",
      "copy_to_clipboard:\n  Copy the selection.\n\nnew_tab:\n  Open a new tab.\n",
    );
    await loadGhosttyActionsAsync();
    expect(ghosttyActions).toEqual([
      { name: "copy_to_clipboard", doc: "Copy the selection." },
      { name: "new_tab", doc: "Open a new tab." },
    ]);
  });
});

describe("reloadGhosttyData", () => {
  it("loads all three sources when available", async () => {
    cliOutput.set("--version", "Ghostty 1.2.0\n");
    cliOutput.set("+show-config --default", "font-size = 13\n");
    cliOutput.set("+list-fonts", "Fira Code\n");
    cliOutput.set("+list-actions --docs", "new_tab:\n  Open a new tab.\n");

    const available = await reloadGhosttyData("/bin/ghostty");

    expect(available).toBe(true);
    for (const call of execFile.mock.calls) {
      expect(call[0]).toBe("/bin/ghostty");
    }
    expect(ghosttyDefaults.get("font-size")).toBe("13");
    expect(ghosttyFonts).toEqual(["Fira Code"]);
    expect(ghosttyActions.map((action) => action.name)).toEqual(["new_tab"]);
  });

  it("clears cached data and skips loading when unavailable", async () => {
    ghosttyDefaults.set("stale", "value");
    ghosttyFonts.push("Stale Font");
    ghosttyActions.push({ name: "stale", doc: "" });

    const available = await reloadGhosttyData();

    expect(available).toBe(false);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(ghosttyDefaults.size).toBe(0);
    expect(ghosttyFonts).toEqual([]);
    expect(ghosttyActions).toEqual([]);
  });
});
