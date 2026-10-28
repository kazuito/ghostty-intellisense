import { homedir } from "node:os";
import path from "node:path";

export interface GhosttyConfigFileEnv {
  platform: NodeJS.Platform;
  home: string;
  xdgConfigHome?: string;
}

const currentEnv = (): GhosttyConfigFileEnv => ({
  platform: process.platform,
  home: homedir(),
  xdgConfigHome: process.env.XDG_CONFIG_HOME,
});

/**
 * Config files Ghostty loads at startup, in load order (later files win),
 * mirroring `loadDefaultFiles` in upstream `Config.zig`.
 */
export function ghosttyConfigFiles(env = currentEnv()): string[] {
  const xdgDir = path.join(
    env.xdgConfigHome || path.join(env.home, ".config"),
    "ghostty",
  );
  const files = [
    path.join(xdgDir, "config"),
    path.join(xdgDir, "config.ghostty"),
  ];
  if (env.platform === "darwin") {
    const appSupportDir = path.join(
      env.home,
      "Library",
      "Application Support",
      "com.mitchellh.ghostty",
    );
    files.push(
      path.join(appSupportDir, "config"),
      path.join(appSupportDir, "config.ghostty"),
    );
  }
  return files;
}

/** Where Ghostty itself creates a config when none exists. */
export function preferredGhosttyConfigFile(env = currentEnv()): string {
  return ghosttyConfigFiles(env).at(-1) as string;
}
