import { describe, expect, it } from "bun:test";
import {
  ghosttyConfigFiles,
  preferredGhosttyConfigFile,
} from "@/ghostty/configFiles";

const appSupport =
  "/Users/me/Library/Application Support/com.mitchellh.ghostty";

describe("ghosttyConfigFiles", () => {
  it("lists XDG then Application Support files on macOS", () => {
    const env = { platform: "darwin" as const, home: "/Users/me" };
    expect(ghosttyConfigFiles(env)).toEqual([
      "/Users/me/.config/ghostty/config",
      "/Users/me/.config/ghostty/config.ghostty",
      `${appSupport}/config`,
      `${appSupport}/config.ghostty`,
    ]);
    expect(preferredGhosttyConfigFile(env)).toBe(
      `${appSupport}/config.ghostty`,
    );
  });

  it("uses only XDG_CONFIG_HOME on Linux", () => {
    const env = {
      platform: "linux" as const,
      home: "/home/me",
      xdgConfigHome: "/xdg",
    };
    expect(ghosttyConfigFiles(env)).toEqual([
      "/xdg/ghostty/config",
      "/xdg/ghostty/config.ghostty",
    ]);
    expect(preferredGhosttyConfigFile(env)).toBe("/xdg/ghostty/config.ghostty");
  });

  it("ignores an empty XDG_CONFIG_HOME", () => {
    const env = {
      platform: "linux" as const,
      home: "/home/me",
      xdgConfigHome: "",
    };
    expect(ghosttyConfigFiles(env)[0]).toBe("/home/me/.config/ghostty/config");
  });
});
