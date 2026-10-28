/** Timeout for shelling out to the ghostty CLI. */
export const GHOSTTY_CLI_TIMEOUT_MS = 5000;

/** Subcommands and flags of the ghostty CLI contract. */
export const GHOSTTY_CLI_FLAGS = {
  VALIDATE_CONFIG: "+validate-config",
  SHOW_CONFIG: "+show-config",
  LIST_FONTS: "+list-fonts",
  LIST_ACTIONS: "+list-actions",
  LIST_THEMES: "+list-themes",
  DEFAULT: "--default",
  DOCS: "--docs",
  PLAIN: "--plain",
} as const;

export const GHOSTTY_CONFIG_FILE_FLAG_PREFIX = "--config-file=" as const;

/**
 * Extra directories to search for `ghostty`, per platform, appended to
 * PATH. Covers common install locations that a GUI-launched extension
 * host may not inherit from the user's shell PATH. Entries starting with
 * `~/` are expanded against the home directory.
 */
export const GHOSTTY_EXTRA_PATH_DIRS: Readonly<
  Partial<Record<NodeJS.Platform, readonly string[]>>
> = {
  darwin: [
    "/Applications/Ghostty.app/Contents/MacOS",
    "~/.nix-profile/bin",
    "/run/current-system/sw/bin",
  ],
  linux: [
    "/usr/local/bin",
    "/usr/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/snap/bin",
    "~/.nix-profile/bin",
    "/run/current-system/sw/bin",
    "~/.local/bin",
  ],
} as const;
