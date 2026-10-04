import { describe, expect, it } from "bun:test";
import { additiveKeys, commaKeys, optionByKey, validKeys } from "@/core/schema";

describe("schema indexes", () => {
  it("exposes fast key lookups", () => {
    expect(validKeys.has("font-size")).toBe(true);
    expect(optionByKey.get("font-size")?.key).toBe("font-size");
  });

  it("preserves additive and comma-separated key metadata", () => {
    expect(additiveKeys.has("keybind")).toBe(true);
    expect(commaKeys.has("app-notifications")).toBe(true);
  });
});

describe("schema enum values", () => {
  it("exposes boolean enum for boolean keys", () => {
    const entry = optionByKey.get("font-thicken");
    expect(entry?.enum?.map(String)).toEqual(["true", "false"]);
  });

  it("exposes enum values for enum keys", () => {
    const entry = optionByKey.get("alpha-blending");
    expect(entry?.enum).toContain("native");
    expect(entry?.enum).toContain("linear");
  });

  it("exposes union literal values", () => {
    const entry = optionByKey.get("window-subtitle");
    expect(entry?.enum).toContain("false");
    expect(entry?.enum).toContain("working-directory");
  });

  it("has no enum for free-form keys", () => {
    expect(optionByKey.get("font-size")?.enum).toBeUndefined();
  });
});
