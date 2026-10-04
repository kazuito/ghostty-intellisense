import { beforeEach, describe, expect, it, mock, vi } from "bun:test";
import * as childProcess from "node:child_process";
import * as fsPromises from "node:fs/promises";
import {
  type Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver/node";

const execFile = mock<(...args: unknown[]) => unknown>();
const writeFile = mock<(...args: unknown[]) => Promise<void>>();
const unlink = mock<(...args: unknown[]) => Promise<void>>();
mock.module("node:child_process", () => ({ ...childProcess, execFile }));
mock.module("node:fs/promises", () => ({ ...fsPromises, writeFile, unlink }));

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildUnparsedErrorsDiagnostic,
  parseGhosttyOutput,
} from "@/features/diagnostics";
import { registerDiagnosticsProvider } from "@/features/diagnostics/provider";
import {
  createDocument,
  createMockConnection,
  createMockDocuments,
} from "./helpers";

// ponytail: fixed microtask drain; raise the count if the validation chain grows deeper.
async function flushTimers(ms?: number) {
  if (ms === undefined) vi.runAllTimers();
  else vi.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  writeFile.mockResolvedValue(undefined);
  unlink.mockResolvedValue(undefined);
});

async function setupDiagnostics(content: string, ghosttyOutput = "") {
  vi.useFakeTimers();

  execFile.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
      const cb = callback as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      if (ghosttyOutput.trim()) {
        cb(Object.assign(new Error("exit 1"), { code: 1 }), ghosttyOutput, "");
      } else {
        cb(null, "", "");
      }
      return {};
    },
  );

  const doc = createDocument(content);
  const connection = createMockConnection();

  const handlers: {
    onDidOpen?: (e: { document: unknown }) => void;
    onDidChangeContent?: (e: { document: unknown }) => void;
    onDidClose?: (e: { document: unknown }) => void;
  } = {};

  const mockDocuments = {
    onDidOpen: vi.fn((cb: (e: { document: unknown }) => void) => {
      handlers.onDidOpen = cb;
    }),
    onDidChangeContent: vi.fn((cb: (e: { document: unknown }) => void) => {
      handlers.onDidChangeContent = cb;
    }),
    onDidClose: vi.fn((cb: (e: { document: unknown }) => void) => {
      handlers.onDidClose = cb;
    }),
  };

  registerDiagnosticsProvider(connection as never, mockDocuments as never);

  const getDiagnostics = async (): Promise<Diagnostic[]> => {
    handlers.onDidOpen?.({ document: doc });
    await flushTimers();
    const calls = connection.sendDiagnostics.mock.calls;
    return (calls[calls.length - 1]?.[0]?.diagnostics as Diagnostic[]) ?? [];
  };

  const getCloseDiagnostics = (): Diagnostic[] => {
    handlers.onDidClose?.({ document: doc });
    const calls = connection.sendDiagnostics.mock.calls;
    return (calls[calls.length - 1]?.[0]?.diagnostics as Diagnostic[]) ?? [];
  };

  return { getDiagnostics, getCloseDiagnostics };
}

// ─── parseGhosttyOutput unit tests ──────────────────────────────────────────

describe("parseGhosttyOutput", () => {
  it("parses a single error line into a diagnostic", () => {
    const output =
      '/tmp/ghostty-test:1:font-thicken: invalid value "notabool", valid values are: true, false';
    const lines = ["font-thicken = notabool"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.severity).toBe("error");
    expect(diags[0]?.code).toBe("invalid-value");
    expect(diags[0]?.message).toContain("notabool");
    expect(diags[0]?.range.start.line).toBe(0);
  });

  it("maps 1-based line numbers to 0-based", () => {
    const output = "/tmp/ghostty-test:3:font-size: invalid value";
    const lines = ["", "", "font-size = bad"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.range.start.line).toBe(2);
  });

  it("passes through unknown field messages from CLI", () => {
    const output = "/tmp/ghostty-test:1:badkey: unknown field";
    const diags = parseGhosttyOutput(output, ["badkey = foo"]);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain("unknown field");
    expect(diags[0]?.code).toBe("unknown-key");
  });

  it("handles macOS /private/tmp path prefix", () => {
    const output =
      '/private/tmp/ghostty-abc:1:cursor-style: invalid value "xxx", valid values are: bar, block, underline, block_hollow';
    const lines = ["cursor-style = xxx"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain("xxx");
  });

  it("points the range at the value, not the key", () => {
    const output = '/tmp/ghostty-test:1:font-size: invalid value "bad"';
    const lines = ["font-size = bad"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags[0]?.range.start.character).toBe("font-size = ".length);
    expect(diags[0]?.range.end.character).toBe("font-size = bad".length);
  });

  it("skips lines with out-of-range line numbers", () => {
    const output = "/tmp/ghostty-test:99:font-size: invalid value";
    const diags = parseGhosttyOutput(output, ["font-size = bad"]);
    expect(diags).toHaveLength(0);
  });

  it("parses multiple error lines", () => {
    const output = [
      '/tmp/ghostty-test:1:font-size: invalid value "bad"',
      '/tmp/ghostty-test:2:cursor-style: invalid value "xxx"',
    ].join("\n");
    const lines = ["font-size = bad", "cursor-style = xxx"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(2);
  });

  it("returns empty array for empty output", () => {
    expect(parseGhosttyOutput("", ["font-size = 14"])).toHaveLength(0);
  });

  it("parses the unlocated format emitted when a theme is loaded", () => {
    const output = 'font-size: invalid value "abc"';
    const lines = ["theme = Dracula", "font-size = abc"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.range.start.line).toBe(1);
    expect(diags[0]?.range.start.character).toBe("font-size = ".length);
    expect(diags[0]?.message).toContain("abc");
  });

  it("parses an unlocated unknown field message", () => {
    const output = "nonsense-key: unknown field";
    const lines = ["theme = Dracula", "nonsense-key = 1"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.range.start.line).toBe(1);
    expect(diags[0]?.message).toContain("unknown field");
  });

  it("parses multiple unlocated error lines", () => {
    const output = [
      'font-size: invalid value "abc"',
      "nonsense-key: unknown field",
    ].join("\n");
    const lines = ["theme = Dracula", "font-size = abc", "nonsense-key = 1"];
    const diags = parseGhosttyOutput(output, lines);
    expect(diags).toHaveLength(2);
  });

  it("skips unlocated lines whose field is not in the document", () => {
    const output = "theme not found, tried path foo";
    const diags = parseGhosttyOutput(output, ["theme = Dracula"]);
    expect(diags).toHaveLength(0);
  });
});

// ─── buildUnparsedErrorsDiagnostic (silent-failure safety net) ────────────────

describe("buildUnparsedErrorsDiagnostic", () => {
  it("surfaces raw output anchored at the first line", () => {
    const diag = buildUnparsedErrorsDiagnostic(
      "some unrecognized ghostty error\n",
      ["font-size = 14"],
    );
    expect(diag?.severity).toBe("error");
    expect(diag?.code).toBe("unparsed");
    expect(diag?.message).toContain("some unrecognized ghostty error");
    expect(diag?.range.start.line).toBe(0);
    expect(diag?.range.end.character).toBe("font-size = 14".length);
  });

  it("returns null for blank output", () => {
    expect(buildUnparsedErrorsDiagnostic("\n  \n", ["font-size = 14"])).toBe(
      null,
    );
  });
});

// ─── Integration: no diagnostics ─────────────────────────────────────────────

describe("diagnostics provider - no diagnostics", () => {
  it("empty document produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics("");
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("comment-only document produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics("# this is a comment");
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("valid boolean value produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics("font-thicken = true");
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("valid boolean false produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics("font-thicken = false");
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("valid positive number produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics("font-size = 14");
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("valid enum value produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "alpha-blending = native",
    );
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("duplicate additive key produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "keybind = ctrl+a\nkeybind = ctrl+b",
    );
    expect(await getDiagnostics()).toHaveLength(0);
  });

  it("valid number within min/max range produces no diagnostics", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "font-thicken-strength = 128",
    );
    expect(await getDiagnostics()).toHaveLength(0);
  });
});

// ─── Integration: duplicate key ──────────────────────────────────────────────

describe("diagnostics provider - duplicate key", () => {
  it("produces an information diagnostic for duplicate non-additive key", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "font-size = 12\nfont-size = 14",
    );
    const diags = await getDiagnostics();
    const info = diags.find(
      (d) => d.severity === DiagnosticSeverity.Information,
    );
    expect(info).toBeDefined();
    expect(info?.code).toBe("duplicate-key");
  });

  it("duplicate message includes key name and first-seen line number", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "font-size = 12\nfont-size = 14",
    );
    const diags = await getDiagnostics();
    const info = diags.find(
      (d) => d.severity === DiagnosticSeverity.Information,
    );
    expect(info?.message).toContain("font-size");
    expect(info?.message).toContain("line 1");
  });

  it("duplicate diagnostic is on the second occurrence line", async () => {
    const { getDiagnostics } = await setupDiagnostics(
      "font-size = 12\nfont-size = 14",
    );
    const diags = await getDiagnostics();
    const info = diags.find(
      (d) => d.severity === DiagnosticSeverity.Information,
    );
    expect(info?.range.start.line).toBe(1);
  });
});

// ─── Integration: value validation (via mocked CLI) ──────────────────────────

describe("diagnostics provider - value validation", () => {
  it("invalid boolean value produces an error", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:font-thicken: invalid value "notabool", valid values are: true, false';
    const { getDiagnostics } = await setupDiagnostics(
      "font-thicken = notabool",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
  });

  it("boolean error message mentions true and false", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:font-thicken: invalid value "notabool", valid values are: true, false';
    const { getDiagnostics } = await setupDiagnostics(
      "font-thicken = notabool",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error?.message).toContain("true");
    expect(error?.message).toContain("false");
  });

  it("invalid enum value produces an error", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:alpha-blending: invalid value "bad-value", valid values are: native, linear-corrected';
    const { getDiagnostics } = await setupDiagnostics(
      "alpha-blending = bad-value",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
  });

  it("enum error message lists valid values", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:alpha-blending: invalid value "bad-value", valid values are: native, linear-corrected';
    const { getDiagnostics } = await setupDiagnostics(
      "alpha-blending = bad-value",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error?.message).toContain("native");
  });

  it("non-numeric value for number key produces an error", async () => {
    const ghosttyOutput = '/tmp/mock:1:font-size: invalid value "abc"';
    const { getDiagnostics } = await setupDiagnostics(
      "font-size = abc",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
  });

  it("number below minimum produces an error", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:font-thicken-strength: invalid value "-1"';
    const { getDiagnostics } = await setupDiagnostics(
      "font-thicken-strength = -1",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
  });

  it("number above maximum produces an error", async () => {
    const ghosttyOutput =
      '/tmp/mock:1:font-thicken-strength: invalid value "256"';
    const { getDiagnostics } = await setupDiagnostics(
      "font-thicken-strength = 256",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
  });

  it("surfaces a fallback error when ghostty flags errors the parser cannot map", async () => {
    const ghosttyOutput = "config failed in some unrecognized format";
    const { getDiagnostics } = await setupDiagnostics(
      "font-size = 14",
      ghosttyOutput,
    );
    const diags = await getDiagnostics();
    const error = diags.find((d) => d.severity === DiagnosticSeverity.Error);
    expect(error).toBeDefined();
    expect(error?.message).toContain("could not be mapped");
  });

  it("valid values produce no errors when CLI returns no output", async () => {
    const lines = [
      "scrollbar = never",
      "window-subtitle = working-directory",
      "quick-terminal-animation-duration = 0.18",
      "app-notifications = clipboard-copy, config-reload",
      "macos-hidden = never",
      "macos-applescript = true",
      "gtk-tabs-location = top",
    ];
    const { getDiagnostics } = await setupDiagnostics(lines.join("\n"));
    const errors = (await getDiagnostics()).filter(
      (d) => d.severity === DiagnosticSeverity.Error,
    );
    expect(errors).toHaveLength(0);
  });
});

// ─── Integration: document close ─────────────────────────────────────────────

describe("diagnostics provider - document close", () => {
  it("closing a document clears its diagnostics", async () => {
    const { getDiagnostics, getCloseDiagnostics } = await setupDiagnostics(
      "font-size = 12\nfont-size = 14",
    );
    expect((await getDiagnostics()).length).toBeGreaterThan(0);
    expect(getCloseDiagnostics()).toHaveLength(0);
  });
});

describe("diagnostics provider - validation lifecycle", () => {
  it("reuses one temp file per document until close", async () => {
    vi.useFakeTimers();
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (
          err: Error | null,
          stdout: string,
          stderr: string,
        ) => void;
        cb(null, "", "");
        return {};
      },
    );

    const connection = createMockConnection();
    const handlers: {
      onDidOpen?: (e: { document: TextDocument }) => void;
      onDidChangeContent?: (e: { document: TextDocument }) => void;
      onDidClose?: (e: { document: TextDocument }) => void;
    } = {};

    const mockDocuments = {
      onDidOpen: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidOpen = cb;
      }),
      onDidChangeContent: vi.fn(
        (cb: (e: { document: TextDocument }) => void) => {
          handlers.onDidChangeContent = cb;
        },
      ),
      onDidClose: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidClose = cb;
      }),
    };

    registerDiagnosticsProvider(connection as never, mockDocuments as never);

    const doc1 = createDocument("font-size = 12");
    const doc2 = TextDocument.create(
      doc1.uri,
      doc1.languageId,
      2,
      "font-size = 14",
    );

    handlers.onDidOpen?.({ document: doc1 });
    await flushTimers();

    handlers.onDidChangeContent?.({ document: doc2 });
    await flushTimers();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile.mock.calls[0]?.[0]).toBe(writeFile.mock.calls[1]?.[0]);
    expect(unlink).not.toHaveBeenCalled();

    handlers.onDidClose?.({ document: doc2 });

    expect(unlink).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith(writeFile.mock.calls[0]?.[0]);
  });

  it("revalidateOpenDocuments re-runs validation for all open documents", async () => {
    vi.useFakeTimers();
    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (
          err: Error | null,
          stdout: string,
          stderr: string,
        ) => void;
        cb(null, "", "");
        return {};
      },
    );

    const connection = createMockConnection();
    const doc = createDocument("font-size = 12");
    const mockDocuments = {
      ...createMockDocuments(doc),
      all: vi.fn(() => [doc]),
    };

    const { revalidateOpenDocuments } = registerDiagnosticsProvider(
      connection as never,
      mockDocuments as never,
    );

    expect(connection.sendDiagnostics).not.toHaveBeenCalled();

    revalidateOpenDocuments();
    await flushTimers();

    expect(execFile).toHaveBeenCalledTimes(1);
    expect(connection.sendDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ uri: doc.uri }),
    );
  });

  it("aborts an in-flight validation when a newer change arrives", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const callbacks: Array<
      (err: Error | null, stdout: string, stderr: string) => void
    > = [];

    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, opts: unknown, callback: unknown) => {
        const options = opts as { signal?: AbortSignal };
        if (options.signal) {
          signals.push(options.signal);
        }
        callbacks.push(
          callback as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void,
        );
        return {};
      },
    );

    const connection = createMockConnection();
    const handlers: {
      onDidOpen?: (e: { document: TextDocument }) => void;
      onDidChangeContent?: (e: { document: TextDocument }) => void;
      onDidClose?: (e: { document: TextDocument }) => void;
    } = {};

    const mockDocuments = {
      onDidOpen: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidOpen = cb;
      }),
      onDidChangeContent: vi.fn(
        (cb: (e: { document: TextDocument }) => void) => {
          handlers.onDidChangeContent = cb;
        },
      ),
      onDidClose: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidClose = cb;
      }),
    };

    registerDiagnosticsProvider(connection as never, mockDocuments as never);

    const doc1 = createDocument("font-size = bad");
    const doc2 = TextDocument.create(
      doc1.uri,
      doc1.languageId,
      2,
      "font-size = 12",
    );

    handlers.onDidOpen?.({ document: doc1 });
    await flushTimers(300);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    handlers.onDidChangeContent?.({ document: doc2 });

    expect(signals[0]?.aborted).toBe(true);

    callbacks[0]?.(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
      "",
      "",
    );
    await flushTimers(300);

    expect(signals).toHaveLength(2);

    callbacks[1]?.(null, "", "");
    await Promise.resolve();
  });

  it("keeps the last CLI diagnostics visible while a new validation is pending", async () => {
    vi.useFakeTimers();
    const callbacks: Array<
      (err: Error | null, stdout: string, stderr: string) => void
    > = [];

    execFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        callbacks.push(
          callback as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void,
        );
        return {};
      },
    );

    const connection = createMockConnection();
    const handlers: {
      onDidOpen?: (e: { document: TextDocument }) => void;
      onDidChangeContent?: (e: { document: TextDocument }) => void;
      onDidClose?: (e: { document: TextDocument }) => void;
    } = {};

    const mockDocuments = {
      onDidOpen: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidOpen = cb;
      }),
      onDidChangeContent: vi.fn(
        (cb: (e: { document: TextDocument }) => void) => {
          handlers.onDidChangeContent = cb;
        },
      ),
      onDidClose: vi.fn((cb: (e: { document: TextDocument }) => void) => {
        handlers.onDidClose = cb;
      }),
    };

    registerDiagnosticsProvider(connection as never, mockDocuments as never);

    const doc1 = createDocument("font-size = bad");
    const doc2 = TextDocument.create(
      doc1.uri,
      doc1.languageId,
      2,
      "font-size = still-bad",
    );

    handlers.onDidOpen?.({ document: doc1 });
    await flushTimers(300);

    callbacks[0]?.(null, '/tmp/mock:1:font-size: invalid value "bad"', "");
    await Promise.resolve();
    await Promise.resolve();

    const openCalls = connection.sendDiagnostics.mock.calls;
    const openDiags = (openCalls[openCalls.length - 1]?.[0]?.diagnostics ??
      []) as Diagnostic[];
    expect(
      openDiags.some(
        (d) =>
          typeof d.message === "string" &&
          d.message.includes('invalid value "bad"'),
      ),
    ).toBe(true);

    handlers.onDidChangeContent?.({ document: doc2 });

    const changeCalls = connection.sendDiagnostics.mock.calls;
    const changeDiags = (changeCalls[changeCalls.length - 1]?.[0]
      ?.diagnostics ?? []) as Diagnostic[];
    expect(
      changeDiags.some(
        (d) =>
          typeof d.message === "string" &&
          d.message.includes('invalid value "bad"'),
      ),
    ).toBe(true);
  });
});

// ─── Integration: mixed document ─────────────────────────────────────────────

describe("diagnostics provider - mixed document", () => {
  it("handles multiple issues in one document", async () => {
    const content = [
      "# valid comment",
      "font-size = 14", // valid
      "not-a-key = value", // unknown key → CLI error (line 3, 1-indexed)
      "font-thicken = bad", // invalid boolean → CLI error (line 4, 1-indexed)
      "font-size = 16", // duplicate → in-process info
    ].join("\n");

    // ghostty reports errors for both the unknown key and invalid boolean
    const ghosttyOutput = [
      "/tmp/mock:3:not-a-key: unknown field",
      '/tmp/mock:4:font-thicken: invalid value "bad", valid values are: true, false',
    ].join("\n");

    const { getDiagnostics } = await setupDiagnostics(content, ghosttyOutput);
    const diags = await getDiagnostics();

    const errors = diags.filter((d) => d.severity === DiagnosticSeverity.Error);
    const infos = diags.filter(
      (d) => d.severity === DiagnosticSeverity.Information,
    );

    expect(errors).toHaveLength(2);
    expect(infos).toHaveLength(1);
  });
});
