import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  additiveKeys,
  configMetadata,
  optionByKey,
  renamedKeys,
} from "@/core/schema";
import { configKeys } from "@/generated/config-keys";

const grammar = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../syntaxes/ghostty-config.tmLanguage.json", import.meta.url),
    ),
    "utf8",
  ),
);

function grammarKeys(): string[] {
  const begin = grammar.repository.assignment.patterns[0].begin as string;
  const match = begin.match(/\(([a-z0-9-]+(?:\|[a-z0-9-]+)+)\)/i);
  if (!match) throw new Error("Could not extract key group from grammar");
  return match[1].split("|");
}

describe("generated config keys vs grammar", () => {
  it("grammar key alternation matches the generated and renamed keys", () => {
    expect(new Set(grammarKeys())).toEqual(
      new Set([...configKeys.map((k) => k.key), ...renamedKeys.keys()]),
    );
  });
});

describe("hand-curated overlay stays in sync with generated keys", () => {
  it("every overlay key exists in the generated key set", () => {
    const keys = new Set<string>(configKeys.map((k) => k.key));
    for (const key of Object.keys(configMetadata)) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it("every additive key exists in the config", () => {
    for (const key of additiveKeys) {
      expect(optionByKey.has(key)).toBe(true);
    }
  });

  it("renamed keys point at current keys and are no longer generated", () => {
    for (const [oldKey, newKey] of renamedKeys) {
      expect(optionByKey.has(newKey)).toBe(true);
      expect(optionByKey.has(oldKey)).toBe(false);
    }
  });
});
