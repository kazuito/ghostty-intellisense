import { describe, expect, it } from "bun:test";
import {
  canonicalModifier,
  findKeybindSeparator,
  keybindActionName,
  splitKeybindFlags,
} from "@/core/keybind";

describe("findKeybindSeparator", () => {
  it.each([
    ["ctrl+a=new_tab", 6],
    ["super+shift+==equalize_splits", 13],
    ["==ignore", 1],
    ["ctrl+==text:=hello", 6],
    ["=+ctrl=ignore", 6],
    ["a>b=ignore", 3],
    ["ctrl+a", -1],
    ["", -1],
  ])("%s -> %d", (value, expected) => {
    expect(findKeybindSeparator(value)).toBe(expected);
  });
});

describe("splitKeybindFlags", () => {
  it("strips known flags in any order", () => {
    expect(splitKeybindFlags("global:unconsumed:ctrl+a=ignore")).toEqual({
      flags: ["global", "unconsumed"],
      rest: "ctrl+a=ignore",
    });
  });

  it("stops at an unknown prefix", () => {
    expect(splitKeybindFlags("physical:a=ignore")).toEqual({
      flags: [],
      rest: "physical:a=ignore",
    });
  });
});

describe("keybindActionName", () => {
  it.each([
    ["ctrl+a=new_split:right", "new_split"],
    ["super+shift+==equalize_splits", "equalize_splits"],
    ["==text:=", "text"],
    ["ctrl+a=", undefined],
    ["clear", undefined],
  ])("%s -> %s", (value, expected) => {
    expect(keybindActionName(value)).toBe(expected);
  });
});

describe("canonicalModifier", () => {
  it("resolves Ghostty's modifier aliases", () => {
    expect(
      ["cmd", "command", "opt", "option", "control", "shift"].map(
        canonicalModifier,
      ),
    ).toEqual(["super", "super", "alt", "alt", "ctrl", "shift"]);
  });
});
