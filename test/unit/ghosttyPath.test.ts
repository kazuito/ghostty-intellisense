import { describe, expect, it } from "bun:test";
import { delimiter } from "node:path";
import { buildGhosttyPathEnv } from "@/ghostty/ghostty";

describe("buildGhosttyPathEnv", () => {
  it("appends darwin fallback dirs after the base PATH", () => {
    const result = buildGhosttyPathEnv("/usr/bin:/bin", "darwin", "/Users/me");
    expect(result).toBe(
      [
        "/usr/bin:/bin",
        "/Applications/Ghostty.app/Contents/MacOS",
        "/Users/me/.nix-profile/bin",
        "/run/current-system/sw/bin",
      ].join(delimiter),
    );
  });

  it("appends linux fallback dirs, expanding ~/ against home", () => {
    const result = buildGhosttyPathEnv("/usr/bin", "linux", "/home/me");
    const segments = result.split(delimiter);
    expect(segments).toContain("/usr/bin");
    expect(segments).toContain("/usr/local/bin");
    expect(segments).toContain("/home/linuxbrew/.linuxbrew/bin");
    expect(segments).toContain("/snap/bin");
    expect(segments).toContain("/home/me/.local/bin");
    expect(segments).toContain("/home/me/.nix-profile/bin");
  });

  it("leaves PATH unchanged on platforms without a fallback list", () => {
    const result = buildGhosttyPathEnv("/usr/bin", "win32", "C:\\Users\\me");
    expect(result).toBe("/usr/bin");
  });

  it("joins without a leading empty segment when basePath is empty", () => {
    const result = buildGhosttyPathEnv("", "darwin", "/Users/me");
    expect(result.startsWith(delimiter)).toBe(false);
    expect(result).toBe(
      [
        "/Applications/Ghostty.app/Contents/MacOS",
        "/Users/me/.nix-profile/bin",
        "/run/current-system/sw/bin",
      ].join(delimiter),
    );
  });

  it("joins segments with path.delimiter, not a hardcoded colon", () => {
    const result = buildGhosttyPathEnv("/usr/bin", "linux", "/home/me");
    expect(result.split(delimiter).length).toBeGreaterThan(1);
  });
});
