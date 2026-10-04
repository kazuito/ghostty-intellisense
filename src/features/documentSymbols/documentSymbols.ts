import { parseDocument, type Range } from "@/core/document";

export interface SymbolDescriptor {
  name: string;
  kind: "property";
  range: Range;
  selectionRange: Range;
}

export function getDocumentSymbols(text: string): SymbolDescriptor[] {
  return parseDocument(text).flatMap((line) =>
    "key" in line
      ? [
          {
            name: line.key,
            kind: "property" as const,
            range: line.lineRange,
            selectionRange: line.keyRange,
          },
        ]
      : [],
  );
}
