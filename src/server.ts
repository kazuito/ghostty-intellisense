import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { GHOSTTY_CONFIG_SECTION, GHOSTTY_DOCS_URL } from "./core/constants";
import { registerCodeActionProvider } from "./features/codeActions/provider";
import { registerColorProvider } from "./features/colors/provider";
import { registerCompletionProvider } from "./features/completion/provider";
import { registerDiagnosticsProvider } from "./features/diagnostics/provider";
import { registerDocumentSymbolProvider } from "./features/documentSymbols/provider";
import { registerFormatterProvider } from "./features/formatter/provider";
import { registerHoverProvider } from "./features/hover/provider";
import { GHOSTTY_EXTRA_PATH_DIRS } from "./ghostty/constants";
import { reloadGhosttyData } from "./ghostty/reload";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    completionProvider: { triggerCharacters: ["=", ",", " "] },
    documentFormattingProvider: true,
    codeActionProvider: true,
    documentSymbolProvider: true,
    colorProvider: true,
  },
}));

registerHoverProvider(connection, documents);
registerCompletionProvider(connection, documents);
const { revalidateOpenDocuments } = registerDiagnosticsProvider(
  connection,
  documents,
);
registerFormatterProvider(connection, documents);
registerCodeActionProvider(connection, documents);
registerDocumentSymbolProvider(connection, documents);
registerColorProvider(connection, documents);

async function promptGhosttyNotFound(): Promise<void> {
  const extras =
    GHOSTTY_EXTRA_PATH_DIRS[process.platform as NodeJS.Platform] ?? [];
  const hint = extras.length ? ` Also checked: ${extras.join(", ")}.` : "";
  const action = await connection.window.showWarningMessage(
    `Ghostty CLI not found. Install Ghostty or set \`ghostty.executablePath\`.${hint}`,
    { title: "Install Ghostty" },
    { title: "Configure Path" },
  );
  if (action?.title === "Install Ghostty") {
    connection.window.showDocument({
      uri: `${GHOSTTY_DOCS_URL}/`,
      external: true,
    });
  } else if (action?.title === "Configure Path") {
    connection.sendNotification("ghostty/openSettings", {
      query: "ghostty.executablePath",
    });
  }
}

let reloadToken = 0;
let lastExecutablePath: string | undefined;

async function refreshGhosttyData(force = false): Promise<void> {
  const raw = await connection.workspace.getConfiguration(
    GHOSTTY_CONFIG_SECTION,
  );
  const executablePath: string =
    (raw as { executablePath?: string })?.executablePath ?? "";

  if (!force && executablePath === lastExecutablePath) return;
  lastExecutablePath = executablePath;

  const token = ++reloadToken;
  try {
    const available = await reloadGhosttyData(executablePath || undefined);
    if (token !== reloadToken) return;
    if (!force) revalidateOpenDocuments();
    if (!available) await promptGhosttyNotFound();
  } catch (error) {
    connection.console.error(
      `Ghostty data reload failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

connection.onInitialized(() => {
  connection.client
    .register(DidChangeConfigurationNotification.type, {
      section: GHOSTTY_CONFIG_SECTION,
    })
    .catch((error) => {
      connection.console.error(
        `Failed to register for configuration changes: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  void refreshGhosttyData(true);
});

connection.onDidChangeConfiguration(() => {
  void refreshGhosttyData();
});

documents.listen(connection);
connection.listen();
