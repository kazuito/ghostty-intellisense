import {
  type Connection,
  Range,
  type TextDocuments,
  TextEdit,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { GHOSTTY_FORMAT_CONFIG_SECTION } from "@/core/constants";
import {
  DEFAULT_FORMATTER_OPTIONS,
  type FormatterOptions,
  formatDocument,
} from "./formatter";

export function registerFormatterProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onDocumentFormatting(async (params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const raw = await connection.workspace.getConfiguration({
      scopeUri: params.textDocument.uri,
      section: GHOSTTY_FORMAT_CONFIG_SECTION,
    });
    const opts: FormatterOptions = {
      ...DEFAULT_FORMATTER_OPTIONS,
      ...(raw ?? {}),
    };

    const original = doc.getText();
    const formatted = formatDocument(original, opts);
    if (formatted === original) return [];

    return [
      TextEdit.replace(
        Range.create(doc.positionAt(0), doc.positionAt(original.length)),
        formatted,
      ),
    ];
  });
}
