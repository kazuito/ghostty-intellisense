import {
  type Connection,
  type TextDocuments,
  TextEdit,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { colorPresentation, getDocumentColors } from "./colors";

export function registerColorProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onDocumentColor((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    return getDocumentColors(doc.getText()).map(({ range, color }) => ({
      range,
      color: {
        red: color.red / 255,
        green: color.green / 255,
        blue: color.blue / 255,
        alpha: 1,
      },
    }));
  });

  connection.onColorPresentation((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const label = colorPresentation(params.color, doc.getText(params.range));
    return [{ label, textEdit: TextEdit.replace(params.range, label) }];
  });
}
