import { fetchGhosttyActionsAsync, ghosttyActions } from "./actions";
import { fetchGhosttyDefaultsAsync, ghosttyDefaults } from "./defaults";
import { fetchGhosttyFontsAsync, ghosttyFonts } from "./fonts";
import { isGhosttyAvailableAsync } from "./ghostty";
import { fetchGhosttyThemesAsync, ghosttyThemes } from "./themes";

export function clearGhosttyData(): void {
  ghosttyDefaults.clear();
  ghosttyFonts.length = 0;
  ghosttyActions.length = 0;
  ghosttyThemes.length = 0;
}

let latestReload = 0;

/**
 * Refresh CLI-derived data without blocking. Resolves true when the Ghostty CLI
 * was reachable and data loaded; false when it was unavailable, in which case
 * any cached data is cleared so consumers don't serve stale defaults.
 *
 * Only the most recently started reload writes the shared data, so a slow CLI
 * from a superseded `executablePath` can't overwrite a newer one's results.
 */
export async function reloadGhosttyData(
  executablePath?: string,
): Promise<boolean> {
  const reload = ++latestReload;
  const isLatest = () => reload === latestReload;

  if (!(await isGhosttyAvailableAsync(executablePath))) {
    if (isLatest()) clearGhosttyData();
    return false;
  }

  const [defaults, fonts, actions, themes] = await Promise.all([
    fetchGhosttyDefaultsAsync(executablePath),
    fetchGhosttyFontsAsync(executablePath),
    fetchGhosttyActionsAsync(executablePath),
    fetchGhosttyThemesAsync(executablePath),
  ]);
  if (isLatest()) {
    clearGhosttyData();
    for (const [key, value] of defaults) ghosttyDefaults.set(key, value);
    ghosttyFonts.push(...fonts);
    ghosttyActions.push(...actions);
    ghosttyThemes.push(...themes);
  }
  return true;
}
