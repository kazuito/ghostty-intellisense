# Ghostty VSCode Extension

A VS Code extension providing language support for Ghostty terminal
configuration files: formatting, quick fixes, and outline support.
Activates for `**/ghostty/config`, `**/com.mitchellh.ghostty/config`, and
files ending in `.ghostty`.

## Current Project State

- Ships syntax highlighting plus six language-server features: hover,
  completion, diagnostics, formatting, code actions, document symbols.
- The language server is organized as vertical feature slices.
  `src/server.ts` only wires providers together; each feature owns its
  LSP adapter and logic under `src/features/<feature>/`. Shared
  config-domain primitives live in `src/core/`, Ghostty CLI integration in
  `src/ghostty/`, generated config keys in `src/generated/`.
- Builds are bundled with Rolldown into `out/extension.js` and
  `out/server.js`; there is no standalone `compile` script.
- The server shells out to the Ghostty CLI (`ghostty.executablePath`) at
  startup and during validation to load defaults, installed fonts, and CLI
  diagnostics.
- Config **key list and descriptions** are generated from Ghostty's
  upstream docs into `src/generated/config-keys.ts` by
  `scripts/gen-config.ts` (run `bun run gen:config`). Committed; the build
  never touches the network.
- `src/core/schema.ts` merges the generated list with a hand-curated
  overlay (`configMetadata`) for metadata the docs don't expose
  machine-readably: per-key value enums, color/font asset hints,
  comma-separated semantics, the `additiveKeys` set, and description
  overrides.
- Keep `README.md`, `CHANGELOG.md`, and `package.json` aligned with the
  actual shipped feature set.

## Architecture

Each feature folder pairs `provider.ts` (LSP adapter) with its logic.
Single-file features keep one logic file named after the feature;
multi-file features (diagnostics) keep split modules plus an
`index.ts` barrel.

```text
src/
├── extension.ts    # VSCode entry point; starts the language server
├── server.ts       # LSP bootstrap; registers feature providers
├── features/       # hover, completion, codeActions, documentSymbols,
│                   # diagnostics, formatter — each provider.ts + logic
├── core/           # document.ts, schema.ts, constants.ts
├── ghostty/        # CLI integration: defaults, fonts, colors, actions, reload
└── generated/
    └── config-keys.ts   # Generated config keys + descriptions (do not edit)

test/
├── unit/           # bun test suite, one file per feature/module, plus
│                   # fast-check properties in properties.test.ts
├── integration/    # bun tests against the real Ghostty CLI (skipped locally if absent)
├── e2e/            # VS Code E2E (mocha tdd) against a fake Ghostty CLI
└── grammar/        # vscode-tmgrammar-test scope assertions
```

Dependency direction is one-way: `generated → core → features → ghostty`,
with `server.ts` wiring the feature providers together. Generated output is
written to `out/`; never hand-edit files there.

### Feature notes

- **Hover** — looks up the key from the hovered line in
  `ghosttyConfigOptions`; returns description, default value, and a link to
  `https://ghostty.org/docs/config/reference#<key>`.
- **Completion** — before `=`, suggests keys (deduped unless in
  `additiveKeys`); after `=`, suggests each key's `enum` values plus named
  colors/installed fonts for `assets`-tagged keys; for comma-separated
  values, only replaces the segment after the last comma.
- **Diagnostics** — in-process validation only flags duplicate
  non-additive keys; unknown keys and invalid values come from
  `ghostty +validate-config`, run async. That CLI emits two output formats
  (`file:line:field: msg` vs. unlocated `field: msg` once a theme/secondary
  config loads); `parseGhosttyOutput` handles both. A fallback diagnostic
  surfaces raw output if nothing could be parsed, so CLI format drift can't
  fail silently.
- **Formatter** — pure helpers (`parseLine`, `formatValue`,
  `formatDocument`) with no LSP dependency; normalizes `=` spacing,
  blank-line runs, hex color casing/`#` prefix, boolean casing, comma
  spacing, leading/trailing whitespace. Leaves quoted strings and named
  colors untouched. Reads `ghostty.format.*` settings.
- **Code Actions** — quick fixes derived from diagnostics: unknown keys get
  `Remove line` plus up to three Levenshtein-based `Did you mean ...?`
  suggestions; duplicate non-additive keys get `Remove line`; invalid
  enum/literal/boolean values get up to five `Replace with ...` suggestions.
- **Document Symbols** — one `Property` symbol per non-comment, non-blank
  line, keyed on the config key; powers Outline/breadcrumbs.
- **Shared Schema** (`src/core/schema.ts`) — builds
  `ghosttyConfigOptions: ConfigEntry[]` by merging generated keys with the
  `configMetadata` overlay; exports `additiveKeys` and `optionByKey`
  (key lookup; use `.has()` for validity and `.get(key)?.comma`).

## Syntax Highlighting

`package.json` contributes language ID `ghostty-config`, the grammar
`syntaxes/ghostty-config.tmLanguage.json`, `language-configuration.json`
(line comments, bracket pairs, auto-closing), and `ghostty.format.*`
settings.

The key alternation and enum-value alternation in the grammar are
**generated** by `scripts/gen-config.ts` — run `bun run gen:config` after key
or enum changes rather than hand-editing those regexes. Other token
patterns (strings, numbers, colors, paths) are hand-maintained.
Scope assertions for those live in `test/grammar/grammar.test.ghostty`
(`vscode-tmgrammar-test` syntax); extend it when touching token patterns. A
drift check (`test/unit/generated.test.ts`) asserts the grammar key set
matches the generated key set.

## Build And Verification

```bash
bun run gen:config # Regenerate config keys/descriptions + grammar from upstream MDX
bun run bundle     # Rolldown bundle to out/
bun run watch      # Rolldown watch build
bun run typecheck  # Type-check without emitting
bun run lint       # Biome lint
bun run format     # Biome format --write
bun run check      # Biome check --write --unsafe + typecheck
bun run test       # unit, then CLI integration, then test:grammar
bun run test:grammar # Grammar scope assertions in test/grammar/*.test.ghostty
bun run test:e2e   # Dev bundle + VS Code E2E via @vscode/test-cli
```

`prepare` runs `lefthook install` (hooks live in `lefthook.yml`);
`rolldown.config.ts` controls the client/server bundles emitted into `out/`.
`examples/` holds sample configs for manual verification in VSCode.

### Test layers

- **Unit + property** (`test/unit/`): `properties.test.ts` uses fast-check
  for invariants (formatter idempotency, ranges in-bounds, no throws).
  Paste a reported counterexample into an example test when fixing it.
- **CLI integration** (`test/integration/`): runs the real
  `ghostty +validate-config` and data commands to catch output-format and
  `configMetadata` drift. Kept out of `test/unit/` because bun's
  `mock.module` is process-global and the unit tests mock
  `node:child_process`; `bunfig.toml` sets the bare `bun test` root to
  `test/unit`, so run these via `bun test ./test/integration` (the `./`
  bypasses that root). Skipped when Ghostty is absent, except under `CI`,
  where they fail instead; `ci.yml` installs a pinned Ghostty `.deb` on
  `ubuntu-24.04`, and `publish.yml` gates releases on that workflow.
  Overlay values the installed Ghostty rejects go in its
  `newerThanInstalled` skip list only when they are confirmed upstream.
  A parity test runs the E2E fake and the real CLI on the same config and
  expects identical diagnostics.
- **E2E** (`test/e2e/`, config in `.vscode-test.mjs`): launches VS Code and
  drives the extension through `vscode.execute*Provider` commands. Each
  suite calls `useFakeGhostty()`, which points `ghostty.executablePath` at
  `test/e2e/fixtures/bin/ghostty` and waits for its impossible `font-size`
  default (`42`) so tests can never pass against a real install. Extend the
  fake when E2E needs new CLI behavior; keep its output in Ghostty's real
  formats (the integration parity test checks `+validate-config`). Runs against both VS Code `stable` and the `engines.vscode`
  minimum (`1.91.0`); CI runs it under `xvfb-run`. `@vscode/test-electron`
  always disables Workspace Trust, so `test/unit/manifest.test.ts` guards
  the `restrictedConfigurations` declaration and `ghostty.format.*` /
  `DEFAULT_FORMATTER_OPTIONS` parity instead.

## Working Rules For Future Changes

- To pick up upstream key/description changes, run `bun run gen:config` and
  commit the regenerated `src/generated/config-keys.ts` and grammar. Don't
  hand-edit the generated file or the grammar's key/enum alternations.
- For value/validation metadata (enums, color/font assets, comma
  semantics), edit `configMetadata` in `src/core/schema.ts`;
  `bun run gen:config` reads it to regenerate the grammar's enum alternation.
- If a key is valid multiple times in one file, add it to `additiveKeys`.
- If schema changes affect completion, diagnostics, formatter, or code
  actions, update the relevant test coverage in `test/unit/`.
- New LSP features get their own `src/features/<feature>/` (provider.ts +
  logic), registered in `src/server.ts`. Shared logic goes in `src/core/`.
- If you add or rename formatter settings, update `package.json` and
  `README.md`.
- When cutting a release: bump `package.json`, add a dated `CHANGELOG.md`
  entry, keep `README.md` aligned with user-visible behavior.
- Rebundle `out/` before testing in VS Code or publishing.
