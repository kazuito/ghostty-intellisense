import type {
  Connection,
  Hover,
  TextDocumentPositionParams,
  TextDocuments,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { getHoverContent } from "./hover";

export function registerHoverProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const line = doc.getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line, character: Number.MAX_SAFE_INTEGER },
    });

    const contents = getHoverContent(line, params.position.character);
    if (!contents) return null;

    return { contents };
  });
}
