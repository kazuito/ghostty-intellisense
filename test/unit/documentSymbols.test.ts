import { describe, expect, it, vi } from "bun:test";
import { type DocumentSymbol, SymbolKind } from "vscode-languageserver/node";
import { registerDocumentSymbolProvider } from "@/features/documentSymbols/provider";
import { createDocument, createMockConnection } from "./helpers";

function setupSymbols(content: string) {
  const doc = createDocument(content);
  const connection = createMockConnection();

  let handler: ((params: unknown) => DocumentSymbol[]) | undefined;
  connection.onDocumentSymbol.mockImplementation(
    (cb: (params: unknown) => DocumentSymbol[]) => {
      handler = cb;
    },
  );

  const mockDocuments = { get: vi.fn(() => doc) };
  registerDocumentSymbolProvider(connection as never, mockDocuments as never);

  const getSymbols = (): DocumentSymbol[] => {
    if (!handler) return [];
    return handler({
      textDocument: { uri: "file:///test.ghostty" },
    }) as DocumentSymbol[];
  };

  return { getSymbols };
}

function getFirstSymbol(symbols: DocumentSymbol[]) {
  const symbol = symbols[0];
  expect(symbol).toBeDefined();
  return symbol;
}

describe("document symbols", () => {
  it("returns empty array for empty document", () => {
    const { getSymbols } = setupSymbols("");
    expect(getSymbols()).toHaveLength(0);
  });

  it("skips comment lines", () => {
    const { getSymbols } = setupSymbols("# just a comment");
    expect(getSymbols()).toHaveLength(0);
  });

  it("skips blank lines", () => {
    const { getSymbols } = setupSymbols("\n\n");
    expect(getSymbols()).toHaveLength(0);
  });

  it("returns one symbol per key-value line", () => {
    const { getSymbols } = setupSymbols("font-size = 14\nfont-thicken = true");
    expect(getSymbols()).toHaveLength(2);
  });

  it("symbol name is the config key", () => {
    const { getSymbols } = setupSymbols("font-size = 14");
    expect(getSymbols()[0]?.name).toBe("font-size");
  });

  it("symbol kind is Property", () => {
    const { getSymbols } = setupSymbols("font-size = 14");
    expect(getSymbols()[0]?.kind).toBe(SymbolKind.Property);
  });

  it("selectionRange covers only the key", () => {
    const { getSymbols } = setupSymbols("font-size = 14");
    const sym = getFirstSymbol(getSymbols());
    expect(sym.selectionRange.start.character).toBe(0);
    expect(sym.selectionRange.end.character).toBe("font-size".length);
  });

  it("range covers the full line", () => {
    const line = "font-size = 14";
    const { getSymbols } = setupSymbols(line);
    const sym = getFirstSymbol(getSymbols());
    expect(sym.range.start.character).toBe(0);
    expect(sym.range.end.character).toBe(line.length);
  });

  it("symbol line number matches source line", () => {
    const { getSymbols } = setupSymbols("# comment\nfont-size = 14");
    expect(getSymbols()[0]?.range.start.line).toBe(1);
  });

  it("handles keys without a value (no '=')", () => {
    const { getSymbols } = setupSymbols("font-size");
    expect(getSymbols()[0]?.name).toBe("font-size");
  });

  it("mixed document with comments, blanks, and keys", () => {
    const content = [
      "# header",
      "",
      "font-size = 14",
      "# inline comment",
      "font-thicken = true",
    ].join("\n");
    const { getSymbols } = setupSymbols(content);
    expect(getSymbols()).toHaveLength(2);
    expect(getSymbols()[0]?.name).toBe("font-size");
    expect(getSymbols()[1]?.name).toBe("font-thicken");
  });

  it("returns null-safe result when document is missing", () => {
    const connection = createMockConnection();
    let handler: ((params: unknown) => DocumentSymbol[]) | undefined;
    connection.onDocumentSymbol.mockImplementation(
      (cb: (params: unknown) => DocumentSymbol[]) => {
        handler = cb;
      },
    );
    const mockDocuments = { get: vi.fn(() => undefined) };
    registerDocumentSymbolProvider(connection as never, mockDocuments as never);
    const result = handler?.({
      textDocument: { uri: "file:///missing.ghostty" },
    });
    expect(result).toEqual([]);
  });
});
