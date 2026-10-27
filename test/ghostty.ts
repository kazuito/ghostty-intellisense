import { execFileSync } from "node:child_process";
import path from "node:path";
import pin from "./ghostty-pin.json";

/** The Ghostty release every CLI-backed test runs against. */
export const GHOSTTY_PIN = pin;

export function ghosttyInstallDir(root: string): string {
  return path.join(root, ".vscode-test", "ghostty", pin.version);
}

export function ghosttyBinIn(installDir: string): string {
  return path.join(installDir, "Ghostty.app", "Contents", "MacOS", "ghostty");
}

/**
 * `GHOSTTY_BIN` wins. Otherwise macOS uses the copy
 * `scripts/setup-ghostty.ts` installs, and Linux the system package CI
 * installs from the pinned `.deb`.
 */
export function pinnedGhosttyBin(root: string): string {
  if (process.env.GHOSTTY_BIN) return process.env.GHOSTTY_BIN;
  return process.platform === "darwin"
    ? ghosttyBinIn(ghosttyInstallDir(root))
    : "ghostty";
}

/** The version `bin --version` reports, or `undefined` if it can't run. */
export function ghosttyVersionOf(bin: string): string | undefined {
  try {
    const output = execFileSync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /^Ghostty (\S+)/.exec(output)?.[1];
  } catch {
    return undefined;
  }
}

export function pinMismatchMessage(bin: string, version?: string): string {
  return `${bin} reports ${version ? `Ghostty ${version}` : "no version"}, expected Ghostty ${pin.version}; run \`bun run setup:ghostty\` or set GHOSTTY_BIN`;
}
