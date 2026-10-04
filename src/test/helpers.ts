import { type Mock, vi } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";

// biome-ignore lint/suspicious/noExplicitAny: LSP handler mocks are invoked with arbitrary params
type AnyMock = Mock<(...args: any[]) => any>;

export function createDocument(content: string): TextDocument {
  return TextDocument.create(
    "file:///test.ghostty",
    "ghostty-config",
    1,
    content,
  );
}

export function createMockConnection(): {
  onHover: AnyMock;
  onCompletion: AnyMock;
  onCodeAction: AnyMock;
  onDocumentSymbol: AnyMock;
  onDocumentFormatting: AnyMock;
  sendDiagnostics: AnyMock;
  workspace: { getConfiguration: AnyMock };
  console: { error: AnyMock; warn: AnyMock };
  window: { showErrorMessage: AnyMock };
} {
  return {
    onHover: vi.fn(),
    onCompletion: vi.fn(),
    onCodeAction: vi.fn(),
    onDocumentSymbol: vi.fn(),
    onDocumentFormatting: vi.fn(),
    sendDiagnostics: vi.fn(),
    workspace: {
      getConfiguration: vi.fn().mockResolvedValue(undefined),
    },
    console: {
      error: vi.fn(),
      warn: vi.fn(),
    },
    window: {
      showErrorMessage: vi.fn(),
    },
  };
}

export function createMockDocuments(doc: TextDocument): {
  get: Mock<(uri: string) => TextDocument | undefined>;
  onDidOpen: AnyMock;
  onDidChangeContent: AnyMock;
  onDidClose: AnyMock;
} {
  return {
    get: vi.fn((_uri: string): TextDocument | undefined => doc),
    onDidOpen: vi.fn(),
    onDidChangeContent: vi.fn(),
    onDidClose: vi.fn(),
  };
}
