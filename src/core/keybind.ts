export const KEYBIND_FLAGS = [
  "global",
  "all",
  "unconsumed",
  "performable",
] as const;

export const KEYBIND_MODIFIERS = ["ctrl", "shift", "alt", "super"] as const;

const MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  cmd: "super",
  command: "super",
  opt: "alt",
  option: "alt",
  control: "ctrl",
};

export function canonicalModifier(name: string): string {
  return MODIFIER_ALIASES[name] ?? name;
}

/**
 * Index of the `=` that ends the trigger, mirroring Ghostty's `Parser.init`:
 * an `=` followed by `+` or `=` is a literal key, so `super+shift+==equalize_splits`
 * splits at its second `=`. Returns -1 when there is no separator yet.
 */
export function findKeybindSeparator(value: string): number {
  let offset = 0;
  for (;;) {
    const idx = value.indexOf("=", offset);
    if (idx < 0) return -1;
    const next = value[idx + 1];
    if (next === "+" || next === "=") {
      offset = idx + 1;
      continue;
    }
    return idx;
  }
}

/** Splits leading `global:`/`all:`/... flags off a keybind value. */
export function splitKeybindFlags(value: string): {
  flags: string[];
  rest: string;
} {
  const flags: string[] = [];
  let rest = value;
  for (;;) {
    const colon = rest.indexOf(":");
    const flag = rest.slice(0, colon);
    if (colon < 0 || !(KEYBIND_FLAGS as readonly string[]).includes(flag)) {
      return { flags, rest };
    }
    flags.push(flag);
    rest = rest.slice(colon + 1);
  }
}

/** The action name of a keybind value, without its `:parameter`. */
export function keybindActionName(value: string): string | undefined {
  const sep = findKeybindSeparator(value);
  if (sep < 0) return undefined;
  const action = value.slice(sep + 1);
  const colon = action.indexOf(":");
  return (colon < 0 ? action : action.slice(0, colon)).trim() || undefined;
}
