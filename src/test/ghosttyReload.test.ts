import { afterEach, describe, expect, it, vi } from "bun:test";
import { ghosttyActions, loadGhosttyActionsAsync } from "@/ghostty/actions";
import { ghosttyDefaults, loadGhosttyDefaultsAsync } from "@/ghostty/defaults";
import { ghosttyFonts, loadGhosttyFontsAsync } from "@/ghostty/fonts";
import type { GhosttyRunner } from "@/ghostty/ghostty";
import { clearGhosttyData, reloadGhosttyData } from "@/ghostty/reload";

afterEach(() => {
  clearGhosttyData();
});

describe("async loaders with injected runner", () => {
  it("populates defaults from CLI output", async () => {
    const run: GhosttyRunner = async () =>
      "font-size = 13\nbackground = 1a1b26\n";
    await loadGhosttyDefaultsAsync(undefined, run);
    expect(ghosttyDefaults.get("font-size")).toBe("13");
    expect(ghosttyDefaults.get("background")).toBe("1a1b26");
  });

  it("populates fonts, skipping indented lines", async () => {
    const run: GhosttyRunner = async () =>
      "JetBrains Mono\n  italic\nFira Code\n";
    await loadGhosttyFontsAsync(undefined, run);
    expect(ghosttyFonts).toEqual(["JetBrains Mono", "Fira Code"]);
  });

  it("populates actions from --docs output", async () => {
    const run: GhosttyRunner = async () =>
      "copy_to_clipboard:\n  Copy the selection.\n\nnew_tab:\n  Open a new tab.\n";
    await loadGhosttyActionsAsync(undefined, run);
    expect(ghosttyActions).toEqual([
      { name: "copy_to_clipboard", doc: "Copy the selection." },
      { name: "new_tab", doc: "Open a new tab." },
    ]);
  });
});

describe("reloadGhosttyData", () => {
  it("loads all three sources in parallel when available", async () => {
    const loadDefaults = vi.fn(async () => {
      ghosttyDefaults.set("font-size", "13");
    });
    const loadFonts = vi.fn(async () => {
      ghosttyFonts.push("Fira Code");
    });
    const loadActions = vi.fn(async () => {
      ghosttyActions.push({ name: "new_tab", doc: "" });
    });

    const available = await reloadGhosttyData("/bin/ghostty", {
      isAvailable: async () => true,
      loadDefaults,
      loadFonts,
      loadActions,
    });

    expect(available).toBe(true);
    expect(loadDefaults).toHaveBeenCalledWith("/bin/ghostty");
    expect(loadFonts).toHaveBeenCalledWith("/bin/ghostty");
    expect(loadActions).toHaveBeenCalledWith("/bin/ghostty");
    expect(ghosttyDefaults.get("font-size")).toBe("13");
  });

  it("clears cached data and skips loading when unavailable", async () => {
    ghosttyDefaults.set("stale", "value");
    ghosttyFonts.push("Stale Font");
    ghosttyActions.push({ name: "stale", doc: "" });

    const loadDefaults = vi.fn(async () => {});
    const available = await reloadGhosttyData(undefined, {
      isAvailable: async () => false,
      loadDefaults,
      loadFonts: vi.fn(async () => {}),
      loadActions: vi.fn(async () => {}),
    });

    expect(available).toBe(false);
    expect(loadDefaults).not.toHaveBeenCalled();
    expect(ghosttyDefaults.size).toBe(0);
    expect(ghosttyFonts).toEqual([]);
    expect(ghosttyActions).toEqual([]);
  });
});
