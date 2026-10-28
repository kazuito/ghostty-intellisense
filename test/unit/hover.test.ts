import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type {
  Hover,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { registerHoverProvider } from "@/features/hover/provider";
import { ghosttyActions } from "@/ghostty/actions";
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

  it("documents a renamed key under its new name with a deprecation note", () => {
    const hover = setupHover("scrollback-limit = 1000");
    const contents = hover(0, 0)?.contents as { value: string };
    expect(contents.value).toStartWith(
      "**scrollback-limit-bytes**\n\n*Deprecated:* `scrollback-limit` was renamed to `scrollback-limit-bytes`.\n\nThe size of the scrollback buffer in bytes.",
    );
    expect(contents.value).toEndWith("reference#scrollback-limit-bytes)");
  });

  it("returns null when hovering a different line (comment)", () => {
    const hover = setupHover("# comment\nfont-size = 14");
    expect(hover(0, 0)).toBeNull();
  });
});

describe("hover provider - keybind actions", () => {
  beforeEach(() => {
    ghosttyActions.push({
      name: "equalize_splits",
      doc: "Equalize all splits.",
    });
  });

  afterEach(() => {
    ghosttyActions.length = 0;
  });

  const line = "keybind = super+shift+==equalize_splits";
  const textAt = (character: number) =>
    (setupHover(line)(0, character)?.contents as { value: string } | undefined)
      ?.value;

  it("documents the action under the cursor", () => {
    expect(textAt(line.length - 3)).toBe(
      "**equalize_splits**\n\nEqualize all splits.\n\n[Documentation](https://ghostty.org/docs/config/keybind/reference#equalize_splits)",
    );
  });

  it("documents the keybind key over the trigger", () => {
    expect(textAt(line.indexOf("=="))).toStartWith("**keybind**");
  });

  it("falls back to the key docs for unknown actions", () => {
    const hover = setupHover("keybind = ctrl+a=bogus");
    const contents = hover(0, 20)?.contents as { value: string };
    expect(contents.value).toStartWith("**keybind**");
  });
});
