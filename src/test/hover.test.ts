import { describe, expect, it } from "bun:test";
import type {
  Hover,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { registerHoverProvider } from "@/features/hover/provider";
import {
  createDocument,
  createMockConnection,
  createMockDocuments,
} from "./helpers";

function setupHover(content: string) {
  const doc = createDocument(content);
  const connection = createMockConnection();
  const documents = createMockDocuments(doc);

  registerHoverProvider(connection as never, documents as never);

  const handler = connection.onHover.mock.calls[0][0] as (
    params: TextDocumentPositionParams,
  ) => Hover | null;

  return (line: number, character: number) =>
    handler({
      textDocument: { uri: "file:///test.ghostty" },
      position: { line, character },
    });
}

describe("hover provider", () => {
  it("returns null for empty line", () => {
    const hover = setupHover("");
    expect(hover(0, 0)).toBeNull();
  });

  it("returns null for comment line", () => {
    const hover = setupHover("# this is a comment");
    expect(hover(0, 0)).toBeNull();
  });

  it("returns null for indented comment line", () => {
    const hover = setupHover("  # indented comment");
    expect(hover(0, 0)).toBeNull();
  });

  it("returns null for whitespace-only line", () => {
    const hover = setupHover("   ");
    expect(hover(0, 0)).toBeNull();
  });

  it("returns null for unknown key", () => {
    const hover = setupHover("not-a-real-key = value");
    expect(hover(0, 0)).toBeNull();
  });

  it("returns hover for known key without value", () => {
    const hover = setupHover("font-size");
    expect(hover(0, 0)).not.toBeNull();
  });

  it("returns hover for known key with value", () => {
    const hover = setupHover("font-size = 14");
    expect(hover(0, 0)).not.toBeNull();
  });

  it("hover content includes the key name", () => {
    const hover = setupHover("font-thicken = true");
    const result = hover(0, 0);
    const contents = result?.contents as { value: string };
    expect(contents.value).toContain("font-thicken");
  });

  it("hover content includes documentation link", () => {
    const hover = setupHover("font-thicken = true");
    const result = hover(0, 0);
    const contents = result?.contents as { value: string };
    expect(contents.value).toContain(
      "https://ghostty.org/docs/config/reference#font-thicken",
    );
  });

  it("hover content uses markdown kind", () => {
    const hover = setupHover("alpha-blending = native");
    const result = hover(0, 0);
    const contents = result?.contents as { kind: string };
    expect(contents.kind).toBe("markdown");
  });

  it("returns hover for correct line in multiline document", () => {
    const hover = setupHover("# comment\nfont-size = 14\nfont-thicken = true");
    const result = hover(1, 0);
    expect(result).not.toBeNull();
    const contents = result?.contents as { value: string };
    expect(contents.value).toContain("font-size");
  });

  it("returns null when hovering a different line (comment)", () => {
    const hover = setupHover("# comment\nfont-size = 14");
    expect(hover(0, 0)).toBeNull();
  });
});
