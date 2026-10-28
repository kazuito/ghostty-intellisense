import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { registerOpenConfigCommand } from "./commands/openConfig";
import {
  GHOSTTY_CONFIG_LANGUAGE_ID,
  GHOSTTY_LSP_ID,
  GHOSTTY_LSP_NAME,
  SERVER_MODULE_PATH,
} from "./core/constants";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(SERVER_MODULE_PATH);

  const debugOptions = {
    execArgv: ["--nolazy", "--inspect=6009"],
  };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: GHOSTTY_CONFIG_LANGUAGE_ID }],
  };

  client = new LanguageClient(
    GHOSTTY_LSP_ID,
    GHOSTTY_LSP_NAME,
    serverOptions,
    clientOptions,
  );

  client.start();
  client.onNotification(
    "ghostty/openSettings",
    ({ query }: { query: string }) => {
      vscode.commands.executeCommand("workbench.action.openSettings", query);
    },
  );
  context.subscriptions.push(client, registerOpenConfigCommand());
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
