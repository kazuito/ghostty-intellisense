import {
  type Command,
  CompletionItemKind,
  type CompletionList,
  type Connection,
  MarkupKind,
  type TextDocumentPositionParams,
  type TextDocuments,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import {
  type CompletionSuggestion,
  getCompletionSuggestions,
} from "./completion";

const ITEM_KINDS: Record<CompletionSuggestion["kind"], CompletionItemKind> = {
  property: CompletionItemKind.Property,
  value: CompletionItemKind.Value,
  keyword: CompletionItemKind.Keyword,
};

const RETRIGGER_SUGGEST: Command = {
  title: "Suggest",
  command: "editor.action.triggerSuggest",
};

export function registerCompletionProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionList | null => {
      const doc = documents.get(params.textDocument.uri);
      if (!doc) return null;

      const lineUpToCursor = doc.getText({
        start: { line: params.position.line, character: 0 },
        end: {
          line: params.position.line,
          character: params.position.character,
        },
      });

      const suggestions = getCompletionSuggestions(
        doc.getText(),
        lineUpToCursor,
        params.position.character,
      );
      if (!suggestions) return null;

      return {
        isIncomplete: false,
        items: suggestions.map((suggestion) => ({
          label: suggestion.label,
          kind: ITEM_KINDS[suggestion.kind],
          detail: suggestion.detail,
          documentation: suggestion.documentation && {
            kind: MarkupKind.Markdown,
            value: suggestion.documentation,
          },
          command: suggestion.retrigger ? RETRIGGER_SUGGEST : undefined,
          textEdit: {
            range: {
              start: {
                line: params.position.line,
                character: suggestion.replacementStart,
              },
              end: {
                line: params.position.line,
                character: suggestion.replacementEnd,
              },
            },
            newText: suggestion.insertText,
          },
        })),
      };
    },
  );
}
