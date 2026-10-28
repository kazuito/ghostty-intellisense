import { afterEach, describe, expect, it, mock } from "bun:test";
import * as childProcess from "node:child_process";

const cliOutput = new Map<string, string>();
function fakeExecFile(
  _bin: string,
  args: string[],
  _opts: unknown,
  callback: (err: Error | null, stdout: string) => void,
) {
  const output = cliOutput.get(args.join(" "));
  callback(output === undefined ? new Error("not found") : null, output ?? "");
}
const execFile = mock(fakeExecFile);
mock.module("node:child_process", () => ({ ...childProcess, execFile }));

import { fetchGhosttyActionsAsync, ghosttyActions } from "@/ghostty/actions";
import { fetchGhosttyDefaultsAsync, ghosttyDefaults } from "@/ghostty/defaults";
import { fetchGhosttyFontsAsync, ghosttyFonts } from "@/ghostty/fonts";
import { clearGhosttyData, reloadGhosttyData } from "@/ghostty/reload";
import { fetchGhosttyThemesAsync, ghosttyThemes } from "@/ghostty/themes";

afterEach(() => {
  clearGhosttyData();
  cliOutput.clear();
  execFile.mockClear();
  execFile.mockImplementation(fakeExecFile);
});

describe("async fetchers", () => {
  it("parses defaults from CLI output", async () => {
    cliOutput.set(
      "+show-config --default",
      "font-size = 13\nbackground = 1a1b26\n",
    );
    const defaults = await fetchGhosttyDefaultsAsync();
    expect(defaults.get("font-size")).toBe("13");
    expect(defaults.get("background")).toBe("1a1b26");
  });

  it("parses fonts, skipping indented lines", async () => {
    cliOutput.set("+list-fonts", "JetBrains Mono\n  italic\nFira Code\n");
    expect(await fetchGhosttyFontsAsync()).toEqual([
      "JetBrains Mono",
      "Fira Code",
    ]);
  });

  it("parses actions from --docs output", async () => {
    cliOutput.set(
      "+list-actions --docs",
      "copy_to_clipboard:\n  Copy the selection.\n\nnew_tab:\n  Open a new tab.\n",
    );
    expect(await fetchGhosttyActionsAsync()).toEqual([
      { name: "copy_to_clipboard", doc: "Copy the selection." },
      { name: "new_tab", doc: "Open a new tab." },
    ]);
  });

  it("parses themes, dropping the location and duplicates", async () => {
    cliOutput.set(
      "+list-themes --plain",
      "Dracula (user)\nDracula (resources)\nGitHub Dark (resources)\n",
    );
    expect(await fetchGhosttyThemesAsync()).toEqual(["Dracula", "GitHub Dark"]);
  });
});

describe("reloadGhosttyData", () => {
  it("loads every source when available", async () => {
    cliOutput.set("--version", "Ghostty 1.2.0\n");
    cliOutput.set("+show-config --default", "font-size = 13\n");
    cliOutput.set("+list-fonts", "Fira Code\n");
    cliOutput.set("+list-actions --docs", "new_tab:\n  Open a new tab.\n");
    cliOutput.set("+list-themes --plain", "Dracula (resources)\n");

    const available = await reloadGhosttyData("/bin/ghostty");

    expect(available).toBe(true);
    for (const call of execFile.mock.calls) {
      expect(call[0]).toBe("/bin/ghostty");
    }
    expect(ghosttyDefaults.get("font-size")).toBe("13");
    expect(ghosttyFonts).toEqual(["Fira Code"]);
    expect(ghosttyActions.map((action) => action.name)).toEqual(["new_tab"]);
    expect(ghosttyThemes).toEqual(["Dracula"]);
  });

  it("clears cached data and skips loading when unavailable", async () => {
    ghosttyDefaults.set("stale", "value");
    ghosttyFonts.push("Stale Font");
    ghosttyActions.push({ name: "stale", doc: "" });
    ghosttyThemes.push("Stale Theme");

    const available = await reloadGhosttyData();

    expect(available).toBe(false);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(ghosttyDefaults.size).toBe(0);
    expect(ghosttyFonts).toEqual([]);
    expect(ghosttyActions).toEqual([]);
    expect(ghosttyThemes).toEqual([]);
  });

  it("keeps the latest reload's data when an older one finishes later", async () => {
    const delays: Record<string, number> = { "/slow/ghostty": 30 };
    execFile.mockImplementation((bin, args, _opts, callback) => {
      const output = args[0] === "+list-fonts" ? `${bin} Font\n` : "x = 1\n";
      setTimeout(() => callback(null, output), delays[bin] ?? 0);
    });

    const slow = reloadGhosttyData("/slow/ghostty");
    const fast = reloadGhosttyData("/fast/ghostty");
    expect(await Promise.all([slow, fast])).toEqual([true, true]);

    expect(ghosttyFonts).toEqual(["/fast/ghostty Font"]);
  });

  it("does not clear newer data when a superseded reload finds no CLI", async () => {
    execFile.mockImplementation((bin, args, _opts, callback) => {
      if (bin === "/missing/ghostty") {
        setTimeout(() => callback(new Error("not found"), ""), 30);
      } else {
        callback(null, args[0] === "+list-fonts" ? "Fira Code\n" : "x = 1\n");
      }
    });

    const missing = reloadGhosttyData("/missing/ghostty");
    await reloadGhosttyData("/bin/ghostty");
    expect(await missing).toBe(false);

    expect(ghosttyFonts).toEqual(["Fira Code"]);
  });
});
