import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@vscode/test-cli";

// VS Code puts its IPC socket in the user-data dir, and macOS caps socket
// paths at 103 chars, which a deep checkout (e.g. a CI runner's) exceeds.
const checkoutId = createHash("sha256")
  .update(process.cwd())
  .digest("hex")
  .slice(0, 8);

function freshUserDataDir(label) {
  const dir = join(tmpdir(), `ghostty-e2e-${checkoutId}`, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return `--user-data-dir=${dir}`;
}

// @vscode/test-electron always passes --disable-workspace-trust, so trust
// behavior can't be exercised here; test/unit/manifest.test.ts guards the
// restrictedConfigurations declaration instead.
const config = (label, version) => ({
  label,
  version,
  files: "out/e2e/*.test.js",
  workspaceFolder: "test/e2e/fixtures/workspace",
  launchArgs: ["--disable-extensions", freshUserDataDir(label)],
  mocha: { ui: "tdd", timeout: 30_000 },
});

export default defineConfig([
  config("stable", "stable"),
  // Oldest release allowed by package.json `engines.vscode`.
  config("minimum", "1.91.0"),
]);
