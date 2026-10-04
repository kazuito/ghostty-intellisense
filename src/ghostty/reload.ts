import { ghosttyActions, loadGhosttyActionsAsync } from "./actions";
import { ghosttyDefaults, loadGhosttyDefaultsAsync } from "./defaults";
import { ghosttyFonts, loadGhosttyFontsAsync } from "./fonts";
import { isGhosttyAvailableAsync } from "./ghostty";

export function clearGhosttyData(): void {
  ghosttyDefaults.clear();
  ghosttyFonts.length = 0;
  ghosttyActions.length = 0;
}

/**
 * Refresh CLI-derived data without blocking. Resolves true when the Ghostty CLI
 * was reachable and data loaded; false when it was unavailable, in which case
 * any cached data is cleared so consumers don't serve stale defaults.
 */
export async function reloadGhosttyData(
  executablePath?: string,
): Promise<boolean> {
  if (!(await isGhosttyAvailableAsync(executablePath))) {
    clearGhosttyData();
    return false;
  }

  await Promise.all([
    loadGhosttyDefaultsAsync(executablePath),
    loadGhosttyFontsAsync(executablePath),
    loadGhosttyActionsAsync(executablePath),
  ]);
  return true;
}
