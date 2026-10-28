import { GHOSTTY_CLI_FLAGS } from "./constants";
import { runGhosttyAsync } from "./ghostty";

export const ghosttyThemes: string[] = [];

/** Parses `ghostty +list-themes --plain`, whose lines read `Name (user)` or `Name (resources)`. */
export function parseThemesOutput(output: string): string[] {
  const themes = new Set<string>();
  for (const line of output.split("\n")) {
    const name = line.replace(/ \((?:user|resources)\)$/, "").trim();
    if (name) themes.add(name);
  }
  return [...themes];
}

const LIST_THEMES_ARGS = [
  GHOSTTY_CLI_FLAGS.LIST_THEMES,
  GHOSTTY_CLI_FLAGS.PLAIN,
];

export async function fetchGhosttyThemesAsync(
  executablePath?: string,
): Promise<string[]> {
  return parseThemesOutput(
    await runGhosttyAsync(LIST_THEMES_ARGS, executablePath),
  );
}
