import { describe, expect, it } from "bun:test";
import { DEFAULT_FORMATTER_OPTIONS } from "@/features/formatter/formatter";
import manifest from "../../package.json";

const properties: Record<string, { default?: unknown }> =
  manifest.contributes.configuration.properties;

describe("package.json manifest", () => {
  it("restricts ghostty.executablePath in untrusted workspaces", () => {
    expect(
      manifest.capabilities.untrustedWorkspaces.restrictedConfigurations,
    ).toContain("ghostty.executablePath");
    expect(Object.keys(properties)).toContain("ghostty.executablePath");
  });

  it("declares exactly the formatter options with matching defaults", () => {
    const declared = Object.fromEntries(
      Object.entries(properties)
        .filter(([key]) => key.startsWith("ghostty.format."))
        .map(([key, schema]) => [
          key.slice("ghostty.format.".length),
          schema.default,
        ]),
    );
    expect(declared).toEqual({ ...DEFAULT_FORMATTER_OPTIONS });
  });
});
