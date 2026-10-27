import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GHOSTTY_PIN,
  ghosttyBinIn,
  ghosttyInstallDir,
  ghosttyVersionOf,
  pinMismatchMessage,
} from "../test/ghostty";

// Installs the pinned Ghostty.app under .vscode-test/ghostty/<version>/ so
// tests never depend on whichever Ghostty the machine happens to have.
// Linux uses the system package instead: the .deb needs GTK libraries that
// only a real install pulls in.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installDir = ghosttyInstallDir(root);
const bin = ghosttyBinIn(installDir);

async function download(url: string, sha256: string, dest: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) {
    throw new Error(
      `Failed to download ${url}: ${res.status} ${res.statusText}`,
    );
  }
  const data = Buffer.from(await res.arrayBuffer());
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== sha256) {
    throw new Error(`${url} has sha256 ${actual}, expected ${sha256}`);
  }
  writeFileSync(dest, data);
}

/**
 * Piped stderr hides macOS 26+'s deprecation notice on success; a failure
 * still carries it in the thrown error. `diskutil image` is the successor
 * but doesn't exist on older macOS.
 */
function hdiutil(...args: string[]) {
  execFileSync("hdiutil", args, { stdio: "pipe" });
}

function detach(mountPoint: string) {
  try {
    hdiutil("detach", mountPoint, "-quiet");
  } catch {
    hdiutil("detach", mountPoint, "-force", "-quiet");
  }
}

/** Stages the app next to `installDir`, then swaps it in with a rename. */
function installApp(dmg: string, workDir: string) {
  const mountPoint = path.join(workDir, "mnt");
  const staging = `${installDir}.partial`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  hdiutil(
    "attach",
    dmg,
    "-nobrowse",
    "-readonly",
    "-noautoopen",
    "-mountpoint",
    mountPoint,
  );
  try {
    execFileSync("ditto", [
      path.join(mountPoint, "Ghostty.app"),
      path.join(staging, "Ghostty.app"),
    ]);
  } finally {
    detach(mountPoint);
  }

  rmSync(installDir, { recursive: true, force: true });
  renameSync(staging, installDir);
}

function pruneOtherVersions() {
  const parent = path.dirname(installDir);
  for (const entry of readdirSync(parent)) {
    if (entry !== GHOSTTY_PIN.version) {
      rmSync(path.join(parent, entry), { recursive: true, force: true });
    }
  }
}

async function main() {
  if (process.env.GHOSTTY_BIN || process.platform !== "darwin") return;
  if (ghosttyVersionOf(bin) === GHOSTTY_PIN.version) return;

  console.log(
    `Installing Ghostty ${GHOSTTY_PIN.version} into ${path.relative(root, installDir)}`,
  );
  const workDir = mkdtempSync(path.join(tmpdir(), "ghostty-setup-"));
  try {
    const dmg = path.join(workDir, "Ghostty.dmg");
    await download(GHOSTTY_PIN.macos.url, GHOSTTY_PIN.macos.sha256, dmg);
    installApp(dmg, workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const installed = ghosttyVersionOf(bin);
  if (installed !== GHOSTTY_PIN.version) {
    throw new Error(pinMismatchMessage(bin, installed));
  }
  pruneOtherVersions();
}

await main();
