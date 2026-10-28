import path from "node:path";

export const GHOSTTY_CONFIG_LANGUAGE_ID = "ghostty-config" as const;

export const GHOSTTY_LSP_ID = "ghosttyLsp" as const;
export const GHOSTTY_LSP_NAME = "Ghostty Language Server" as const;

export const OUT_DIR = "out" as const;
export const SERVER_MODULE_PATH = path.join(OUT_DIR, "server.js");

/** Marks the start of a comment line in a Ghostty config file. */
export const CONFIG_COMMENT_PREFIX = "#" as const;

/** Separates a config key from its value, e.g. `key = value`. */
export const CONFIG_KEY_VALUE_SEPARATOR = "=" as const;

/** `connection.workspace.getConfiguration` section for `ghostty.*` settings. */
export const GHOSTTY_CONFIG_SECTION = "ghostty" as const;
/** `connection.workspace.getConfiguration` section for `ghostty.format.*` settings. */
export const GHOSTTY_FORMAT_CONFIG_SECTION =
  `${GHOSTTY_CONFIG_SECTION}.format` as const;

export const GHOSTTY_DOCS_URL = "https://ghostty.org" as const;
export const GHOSTTY_CONFIG_REFERENCE_URL =
  `${GHOSTTY_DOCS_URL}/docs/config/reference#` as const;
export const GHOSTTY_KEYBIND_REFERENCE_URL =
  `${GHOSTTY_DOCS_URL}/docs/config/keybind/reference#` as const;
