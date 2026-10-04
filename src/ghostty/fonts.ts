import { GHOSTTY_CLI_FLAGS } from "./constants";
import { runGhosttyAsync } from "./ghostty";

export const ghosttyFonts: string[] = [];

export function parseFontsOutput(output: string): string[] {
  const fonts: string[] = [];
  for (const line of output.split("\n")) {
    if (line && !line.startsWith(" ")) {
      fonts.push(line.trim());
    }
  }
  return fonts;
}

export async function loadGhosttyFontsAsync(
  executablePath?: string,
): Promise<void> {
  const output = await runGhosttyAsync(
    [GHOSTTY_CLI_FLAGS.LIST_FONTS],
    executablePath,
  );
  ghosttyFonts.length = 0;
  ghosttyFonts.push(...parseFontsOutput(output));
}
