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

export async function fetchGhosttyFontsAsync(
  executablePath?: string,
): Promise<string[]> {
  return parseFontsOutput(
    await runGhosttyAsync([GHOSTTY_CLI_FLAGS.LIST_FONTS], executablePath),
  );
}
