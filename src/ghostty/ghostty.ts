import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter } from "node:path";
import { GHOSTTY_CLI_TIMEOUT_MS, GHOSTTY_EXTRA_PATH_DIRS } from "./constants";

function expandHome(dir: string, home: string): string {
  return dir.startsWith("~/") ? home + dir.slice(1) : dir;
}

/**
 * Builds PATH augmented with per-platform fallback directories so `ghostty`
 * is found even when the extension host doesn't inherit the user's shell
 * PATH (common for GUI-launched app bundles and desktop sessions).
 */
export function buildGhosttyPathEnv(
  basePath: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  const extras = (GHOSTTY_EXTRA_PATH_DIRS[platform] ?? []).map((dir) =>
    expandHome(dir, home),
  );
  return [basePath, ...extras].filter(Boolean).join(delimiter);
}

export const ghosttyPathEnv = buildGhosttyPathEnv();

export function ghosttyBin(executablePath?: string): string {
  return executablePath || "ghostty";
}

export function ghosttyEnv(executablePath?: string): NodeJS.ProcessEnv {
  return executablePath
    ? { ...process.env }
    : { ...process.env, PATH: ghosttyPathEnv };
}

/**
 * Run a ghostty command asynchronously and return stdout.
 * Returns an empty string if ghostty is not found or the command fails.
 */
export function runGhosttyAsync(
  args: string[],
  executablePath?: string,
): Promise<string> {
  return new Promise<string>((resolve) => {
    execFile(
      ghosttyBin(executablePath),
      args,
      {
        encoding: "utf8",
        timeout: GHOSTTY_CLI_TIMEOUT_MS,
        env: ghosttyEnv(executablePath),
      },
      (err, stdout) => {
        resolve(err ? "" : stdout);
      },
    );
  });
}

/**
 * Returns true if the ghostty binary is reachable and exits successfully.
 */
export async function isGhosttyAvailableAsync(
  executablePath?: string,
): Promise<boolean> {
  return (await runGhosttyAsync(["--version"], executablePath)) !== "";
}
