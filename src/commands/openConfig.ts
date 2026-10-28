import * as vscode from "vscode";
import {
  ghosttyConfigFiles,
  preferredGhosttyConfigFile,
} from "@/ghostty/configFiles";

export const OPEN_CONFIG_COMMAND = "ghostty.openConfig" as const;

async function isFile(file: string): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(file));
    return (stat.type & vscode.FileType.File) !== 0;
  } catch {
    return false;
  }
}

async function pickConfigFile(): Promise<vscode.Uri | undefined> {
  const candidates = ghosttyConfigFiles();
  const existing: string[] = [];
  for (const file of candidates) {
    if (await isFile(file)) existing.push(file);
  }

  if (existing.length === 1) return vscode.Uri.file(existing[0]);

  if (existing.length > 1) {
    const picked = await vscode.window.showQuickPick(
      existing.map((file, index) => ({
        label: file,
        description: index === existing.length - 1 ? "loaded last" : undefined,
      })),
      { placeHolder: "Ghostty loads these config files in this order" },
    );
    return picked && vscode.Uri.file(picked.label);
  }

  const target = preferredGhosttyConfigFile();
  const create = "Create";
  const answer = await vscode.window.showInformationMessage(
    `No Ghostty config found. Create ${target}?`,
    create,
  );
  if (answer !== create) return undefined;

  const uri = vscode.Uri.file(target);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
  await vscode.workspace.fs.writeFile(uri, new Uint8Array());
  return uri;
}

export function registerOpenConfigCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(OPEN_CONFIG_COMMAND, async () => {
    const uri = await pickConfigFile();
    if (uri) await vscode.window.showTextDocument(uri);
  });
}
