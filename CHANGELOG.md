# Change Log

All notable changes to the "ghostty" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Ghostty 1.4 support: completions, hover, and highlighting for the new
  `scrollback-limit-bytes`, `scrollback-limit-lines`, `scrollback-compression`,
  `link-osc8`, `drag-handle`, `clipboard-write-limit-bytes`,
  `middle-click-action`, `vt-window-resize-allowed`, `vt-xt-checksum-report`,
  `vt-xt-checksum-extension`, `gtk-tabs-inverted`, and
  `gtk-horizontal-tab-scroll` options, `unlimited` for the scrollback and
  clipboard limits, `equal` for `window-padding-balance`, and the reworked
  `copy-on-select` values (`none`, `primary`, `clipboard`, `both`)
- Deprecated settings are flagged as struck-through hints with a quick fix:
  renamed keys (`scrollback-limit`, `background-blur-radius`,
  `adw-toolbar-style`), `copy-on-select = true`/`false`,
  `gtk-single-instance = desktop`, and `macos-dock-drop-behavior = window`.
  Renamed keys keep their highlighting and show the new key's documentation
  on hover

### Fixed

- Completions now offer `center-center` for `background-image-position`,
  `osc8` for `link-previews`, the non-native modes for `fullscreen`,
  `padded-notch` for `macos-non-native-fullscreen`, the `microchip`, `glass`,
  `holographic`, `paper`, and `xray` app icons, and `navigation` for
  `split-preserve-zoom`
- `macos-window-buttons` no longer offers `macos-native`, and
  `progress-style` offers `true`/`false` instead of style flags; Ghostty
  accepts neither of the removed values

## [1.0.9] - 2026-10-27

### Fixed

- Errors reported for files pulled in with `config-file` no longer appear on
  unrelated lines of the file being edited
- Diagnostics, quick fixes, and outline ranges no longer include the `\r` of
  CRLF line endings
- Changing `ghostty.executablePath` quickly can no longer leave defaults,
  fonts, and actions from the previous executable in place when its CLI
  responds last
- Toggle Line Comment now works on VS Code 1.91

### Changed

- Updated the bundled language client/server libraries to v11

## [1.0.8] - 2026-10-05

### Fixed

- Syntax highlighting: an unclosed `"` no longer turns the rest of the file
  into a string; values may contain `#` (Ghostty has no inline comments);
  multi-word and path values after a nested `=` (e.g.
  `font-codepoint-map = U+E000-U+F8FF=Symbols Nerd Font`,
  `env = PATH=/usr/bin`) are highlighted correctly, and codepoint ranges get
  their own scope
- Formatting a line ending in `\r\r\n` now folds the stray carriage return
  into the line ending, so formatting is idempotent
- Diagnostics whose reported field doesn't appear on the referenced line now
  highlight that whole line instead of an out-of-bounds range
- `link` no longer offers `true`/`false` completions, which Ghostty always
  rejects since the option is not implemented yet

## [1.0.7] - 2026-07-14

### Changed

- Renamed the extension to "Ghostty IntelliSense"; the repository moved to
  `kazuito/ghostty-intellisense` (extension ID unchanged)

### Fixed

- Changing `ghostty.executablePath` now takes effect immediately: CLI data
  reloads and open documents are revalidated without a window reload
- Value completions now trigger automatically after `=`, `,`, and space;
  completions right after a comma in comma-separated values no longer come
  up empty
- Key completions no longer produce a corrupted replacement range when the
  cursor follows trailing whitespace

## [1.0.6] - 2026-07-08

### Added

- When `ghostty.executablePath` is unset, the extension now searches common
  per-platform install locations in addition to the system `PATH` (macOS app
  bundle and Nix paths; `/usr/local/bin`, `/usr/bin`, Homebrew-on-Linux, Snap,
  Nix, and `~/.local/bin` on Linux), so a GUI-launched VS Code finds the CLI
  without extra configuration
- The "Ghostty CLI not found" warning now lists the directories that were
  searched

### Changed

- Lowered the minimum supported VS Code version to 1.91.0
- `ghostty.executablePath` now requires a trusted workspace, since it controls
  which binary the extension executes; the validation temp file is created
  with owner-only permissions

### Fixed

- Formatting a file with CRLF line endings no longer produces mixed line
  endings — the formatter detects and preserves the document's EOL style
- Color keys such as `cursor-color` and `selection-foreground`/`-background`
  now get color completions consistently; the formatter and completion share
  one source of color-key metadata
- Formatter failures now surface as an error notification instead of being
  logged silently

## [1.0.5] - 2026-06-30

### Fixed

- Diagnostics now map Ghostty's unlocated `+validate-config` output (the
  `field: msg` form emitted once a theme or secondary config is loaded) back to
  the offending line

### Changed

- Reorganized the language server into vertical feature slices for easier
  maintenance
- Refreshed the README and packaging metadata

## [1.0.4] - 2026-06-30

### Changed

- Config keys and descriptions are now generated from Ghostty's upstream docs,
  keeping completions, hover, and diagnostics in sync with the latest options
- Ghostty CLI data (defaults, fonts, validation) now loads asynchronously and
  reloads when the `ghostty.executablePath` setting changes

### Fixed

- Syntax highlighting now scopes commas neutrally and matches enum values more
  precisely

## [1.0.3] - 2026-03-23

### Added

- Keybind action completions — value completions for the `keybind` key now
  include all available Ghostty actions loaded from the CLI

## [1.0.2] - 2026-03-15

### Added

- Ghostty CLI integration for validation, default value loading, and installed
  font discovery when the `ghostty` executable is available
- A new `ghostty.executablePath` setting for pointing the extension at a
  non-standard Ghostty binary
- Value completions for named colors and installed Ghostty font families

### Changed

- Diagnostics now combine in-process duplicate-key checks with
  `ghostty +validate-config` results for more accurate runtime validation
- Hover and completion details now use Ghostty default values loaded from the
  installed CLI when available
- Configuration descriptions and enum extraction were refreshed for existing
  Ghostty options

### Fixed

- Quick fixes now work with CLI-reported `unknown field` diagnostics, including
  typo suggestions and `Remove line`
- Validation results remain visible while a new CLI validation is pending, with
  improved cancellation and temp-file reuse during edits
- Syntax highlighting now recognizes both 3-digit and 6-digit hex colors more
  reliably

## [1.0.1] - 2026-03-14

### Added

- Document formatting for Ghostty config files with configurable spacing, color
  normalization, boolean normalization, comma spacing, blank-line handling, and
  whitespace trimming
- Quick fixes for unknown keys, duplicate non-additive keys, and invalid
  boolean/enum/literal values
- Outline and breadcrumb support via document symbols

### Changed

- Diagnostics now validate schema-backed value types in addition to unknown and
  duplicate keys
- README, maintainer notes, and marketplace metadata now describe the current
  feature set and formatter settings

## [1.0.0] - 2026-03-14

- Initial release
- Syntax highlighting for Ghostty configuration files
- Hover documentation with links to the official reference
- Key and value completions
- Diagnostics for unknown keys and duplicate entries
