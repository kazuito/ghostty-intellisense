import {
  CodeAction,
  CodeActionKind,
  type CodeActionParams,
  type Connection,
  DiagnosticSeverity,
  type TextDocuments,
  TextEdit,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { type DiagnosticLike, getCodeActionSuggestions } from "./codeActions";

function toLibSeverity(
  severity: DiagnosticSeverity | undefined,
): DiagnosticLike["severity"] | null {
  switch (severity) {
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "information";
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Hint:
      return "hint";
    default:
      return null;
  }
}

export function registerCodeActionProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
): void {
  connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const diagnostics = params.context.diagnostics.flatMap((diagnostic) => {
      const severity = toLibSeverity(diagnostic.severity);
      return severity
        ? [
            {
              range: diagnostic.range,
              message:
                typeof diagnostic.message === "string"
                  ? diagnostic.message
                  : diagnostic.message.value,
              severity,
              code:
                typeof diagnostic.code === "string"
                  ? diagnostic.code
                  : undefined,
            },
          ]
        : [];
    });

    return getCodeActionSuggestions(doc.getText(), diagnostics).map(
      (suggestion) =>
        CodeAction.create(
          suggestion.title,
          {
            changes: {
              [params.textDocument.uri]: [
                suggestion.edit.newText === ""
                  ? TextEdit.del(suggestion.edit.range)
                  : TextEdit.replace(
                      suggestion.edit.range,
                      suggestion.edit.newText,
                    ),
              ],
            },
          },
          CodeActionKind.QuickFix,
        ),
    );
  });
}
