![banner](https://raw.githubusercontent.com/kazuito/ghostty-intellisense/main/assets/banner.png)

# Ghostty IntelliSense

[![Install on VS Code](https://img.shields.io/badge/Install%20on%20VS%20Code-000000?style=flat)](https://marketplace.visualstudio.com/items?itemName=kazuito.ghostty)
[![GitHub Repo stars](https://img.shields.io/github/stars/kazuito/ghostty-intellisense?style=flat&logo=github&labelColor=000&color=000)](https://github.com/kazuito/ghostty-intellisense)


VS Code language support for [Ghostty](https://ghostty.org) configuration
files.

## Features

- **Syntax highlighting** for keys, values, colors, keybinds, and comments
- **Completions** — config keys as you type, and values after `=`: enum
  options, named colors, installed font families, themes, and keybind
  prefixes, modifiers, and actions
- **Diagnostics** — duplicate keys, unknown keys, invalid values, and
  deprecated keys or values
- **Quick fixes** — remove bad lines, fix typos, replace invalid values,
  migrate deprecated settings
- **Hover documentation** — description, default value, and a link to the
  official reference for the key under the cursor, or for the keybind
  action under it
- **Color swatches and picker** for hex and named colors, including
  `palette` entries
- **Formatter** — normalizes spacing, hex colors, booleans, and blank lines
- **Outline and breadcrumbs** for quick navigation in large configs
- **Ghostty: Open Config** command — opens the config file Ghostty loads,
  or offers to create one where Ghostty would look for it

## Install

Search **Ghostty** in the VS Code Extensions view, or install it from the CLI:

```sh
code --install-extension kazuito.ghostty
```

Requires VS Code `1.91.0` or newer. Everything works out of the box; having
the Ghostty CLI installed unlocks extra features — see
[Ghostty CLI integration](#ghostty-cli-integration).

## Supported files

The extension activates on:

- `**/ghostty/config`
- `**/com.mitchellh.ghostty/config`
- Any file with a `.ghostty` extension
- Any file whose first line is a Vim modeline such as `# vim: ft=ghostty`

## Diagnostics and quick fixes

Duplicate keys (for settings that may only appear once) are flagged as you
type, with no setup required. So are settings Ghostty still accepts but has
deprecated, such as the old `scrollback-limit` name (now
`scrollback-limit-bytes`) or `copy-on-select = true`; these show struck
through as hints rather than errors.

When the Ghostty CLI is available, the extension also runs
`ghostty +validate-config` on your file to report exactly what Ghostty
itself would reject:

- Unknown keys
- Invalid values (booleans, numbers, enums, colors, and more)

Diagnostics with an obvious fix get quick actions:

- `Remove line` for unknown or duplicate entries
- `Did you mean ...?` suggestions for mistyped keys
- `Replace with ...` suggestions for invalid boolean, enum, or literal values
- `Rename to ...` and `Replace with ...` to migrate deprecated keys and values

## Ghostty CLI integration

When the `ghostty` executable is available, the extension uses it to:

- run `ghostty +validate-config` for the full diagnostics described above
- load your build's default values, shown alongside hover and completion
  details
- suggest installed font family names when completing font settings
- suggest keybind actions (from `ghostty +list-actions`) when completing
  `keybind` values, and show their documentation on hover
- suggest bundled and your own themes (from `ghostty +list-themes`) when
  completing `theme`, including `light:` / `dark:` pairs

By default the extension searches the system `PATH` plus common per-platform
install locations: on macOS, `/Applications/Ghostty.app/Contents/MacOS` and
Nix paths; on Linux, `/usr/local/bin`, `/usr/bin`, Homebrew-on-Linux, Snap,
and Nix paths. This covers cases where a GUI-launched VS Code doesn't
inherit the user's shell PATH.

If Ghostty is installed elsewhere, set `ghostty.executablePath` in your
VS Code settings — the extension picks up changes to it immediately, no
reload needed. For security, this setting is ignored in
[untrusted workspaces](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust).

Flatpak installs aren't auto-detected: Flatpak exports a binstub named after
the app id (`com.mitchellh.ghostty`), not `ghostty`, so PATH search can't
find it, and the sandboxed CLI may not see the extension's temp validation
files. Workaround: point `ghostty.executablePath` at a small wrapper script
that runs `flatpak run com.mitchellh.ghostty "$@"`.

## Formatting

Use VS Code's **Format Document** command on Ghostty config files. Spacing,
casing, and blank-line handling are configurable under the `ghostty.format.*`
settings in VS Code.

The formatter intentionally leaves quoted strings untouched and preserves
non-hex color names.

## Contributing

Contributions are welcome! Feel free to open an
[issue](https://github.com/kazuito/ghostty-intellisense/issues) for bugs or feature
requests, or send a
[pull request](https://github.com/kazuito/ghostty-intellisense/pulls).

## License

MIT
