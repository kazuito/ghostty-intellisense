import {
  CONFIG_COMMENT_PREFIX,
  CONFIG_KEY_VALUE_SEPARATOR,
  GHOSTTY_CONFIG_REFERENCE_URL,
} from "@/core/constants";
import { parseDocument } from "@/core/document";
import {
  canonicalModifier,
  findKeybindSeparator,
  KEYBIND_FLAGS,
  KEYBIND_MODIFIERS,
  splitKeybindFlags,
} from "@/core/keybind";
import {
  additiveKeys,
  type ConfigEntry,
  canonicalKey,
  ghosttyConfigOptions,
  optionByKey,
} from "@/core/schema";
import { ghosttyColors } from "@/generated/colors";
import { ghosttyActions } from "@/ghostty/actions";
import { ghosttyDefaults } from "@/ghostty/defaults";
import { ghosttyFonts } from "@/ghostty/fonts";
import { ghosttyThemes } from "@/ghostty/themes";

export interface CompletionSuggestion {
  label: string;
  kind: "property" | "value" | "keyword";
  detail?: string;
  /** Markdown shown in the details pane. */
  documentation?: string;
  replacementStart: number;
  replacementEnd: number;
  insertText: string;
  /** Reopen suggestions after inserting, e.g. values after `key = `. */
  retrigger?: boolean;
}

const THEME_MODE_PREFIXES = ["light:", "dark:"] as const;

export function getCompletionSuggestions(
  documentText: string,
  lineUpToCursor: string,
  cursorCharacter: number,
): CompletionSuggestion[] | null {
  if (lineUpToCursor.trimStart().startsWith(CONFIG_COMMENT_PREFIX)) return null;

  const eqIndex = lineUpToCursor.indexOf(CONFIG_KEY_VALUE_SEPARATOR);

  if (eqIndex >= 0) {
    const key = canonicalKey(lineUpToCursor.slice(0, eqIndex).trim());
    const option = optionByKey.get(key);
    if (!option) return null;

    const afterEq = lineUpToCursor.slice(eqIndex + 1);
    if (key === "keybind") {
      return keybindSuggestions(afterEq.trimStart(), cursorCharacter);
    }
    return valueSuggestions(option, afterEq, cursorCharacter);
  }

  return keySuggestions(documentText, lineUpToCursor, cursorCharacter);
}

function keySuggestions(
  documentText: string,
  lineUpToCursor: string,
  cursorCharacter: number,
): CompletionSuggestion[] {
  const usedKeys = new Set(
    parseDocument(documentText).flatMap((line) =>
      "key" in line ? [canonicalKey(line.key)] : [],
    ),
  );

  const prefix = lineUpToCursor.trimStart();
  const replacementStart = lineUpToCursor.length - prefix.length;

  return ghosttyConfigOptions
    .filter(
      (option) =>
        additiveKeys.has(option.key) ||
        !usedKeys.has(option.key) ||
        option.key === prefix,
    )
    .filter((option) => option.key.startsWith(prefix))
    .map((option) => {
      const defaultVal = ghosttyDefaults.get(option.key);
      return {
        label: option.key,
        kind: "property" as const,
        detail:
          defaultVal !== undefined && defaultVal !== ""
            ? `default: ${defaultVal}`
            : undefined,
        documentation: `${option.desc}\n\n[Documentation](${GHOSTTY_CONFIG_REFERENCE_URL}${option.key})`,
        replacementStart,
        replacementEnd: cursorCharacter,
        insertText: `${option.key} = `,
        retrigger: hasValueSuggestions(option),
      };
    });
}

function hasValueSuggestions(option: ConfigEntry): boolean {
  return (
    option.key === "keybind" ||
    (option.enum?.length ?? 0) > 0 ||
    (option.assets?.length ?? 0) > 0
  );
}

function valueSuggestions(
  option: ConfigEntry,
  afterEq: string,
  cursorCharacter: number,
): CompletionSuggestion[] | null {
  const valuePrefix = option.comma
    ? afterEq.slice(afterEq.lastIndexOf(",") + 1).trimStart()
    : afterEq.trimStart();
  const replacementStart = cursorCharacter - valuePrefix.length;
  const suggestion = (
    label: string,
    extra: Partial<CompletionSuggestion> = {},
  ): CompletionSuggestion => ({
    label,
    kind: "value",
    replacementStart,
    replacementEnd: cursorCharacter,
    insertText: label,
    ...extra,
  });

  if (option.assets?.includes("color")) {
    const suggestions = [
      ...(option.enum ?? [])
        .map(String)
        .filter((value) => value.startsWith(valuePrefix))
        .map((value) => suggestion(value)),
      ...ghosttyColors
        .filter((color) => color.name.startsWith(valuePrefix))
        .map((color) => suggestion(color.name, { detail: color.hex })),
    ];
    return suggestions.length > 0 ? suggestions : null;
  }

  if (option.assets?.includes("theme")) {
    return themeSuggestions(valuePrefix, cursorCharacter);
  }

  const values = option.assets?.includes("font")
    ? ghosttyFonts
    : (option.enum?.map(String) ?? []);
  if (values.length === 0) return null;

  const defaultVal = ghosttyDefaults.get(option.key);
  return values
    .filter((value) => value.startsWith(valuePrefix))
    .map((value) =>
      suggestion(value, {
        detail:
          defaultVal !== undefined && value === defaultVal
            ? "default"
            : undefined,
      }),
    );
}

function themeSuggestions(
  segment: string,
  cursorCharacter: number,
): CompletionSuggestion[] | null {
  if (ghosttyThemes.length === 0) return null;

  const mode = THEME_MODE_PREFIXES.find((prefix) => segment.startsWith(prefix));
  const namePrefix = mode ? segment.slice(mode.length) : segment;
  const replacementStart = cursorCharacter - namePrefix.length;

  const needle = namePrefix.toLowerCase();
  const themes = ghosttyThemes
    .filter((theme) => theme.toLowerCase().startsWith(needle))
    .map(
      (theme): CompletionSuggestion => ({
        label: theme,
        kind: "value",
        replacementStart,
        replacementEnd: cursorCharacter,
        insertText: theme,
      }),
    );
  if (mode) return themes;

  const modes = THEME_MODE_PREFIXES.filter((prefix) =>
    prefix.startsWith(segment),
  ).map(
    (prefix): CompletionSuggestion => ({
      label: prefix,
      kind: "keyword",
      detail: `Theme for ${prefix.slice(0, -1)} mode`,
      replacementStart,
      replacementEnd: cursorCharacter,
      insertText: prefix,
      retrigger: true,
    }),
  );
  return [...modes, ...themes];
}

function keybindSuggestions(
  value: string,
  cursorCharacter: number,
): CompletionSuggestion[] | null {
  const separator = findKeybindSeparator(value);
  if (separator >= 0) {
    if (ghosttyActions.length === 0) return null;
    const actionPrefix = value.slice(separator + 1).trimStart();
    const replacementStart = cursorCharacter - actionPrefix.length;
    return ghosttyActions
      .filter((action) => action.name.startsWith(actionPrefix))
      .map((action) => ({
        label: action.name,
        kind: "value" as const,
        detail: action.doc.split("\n")[0] || undefined,
        documentation: action.doc || undefined,
        replacementStart,
        replacementEnd: cursorCharacter,
        insertText: action.name,
      }));
  }

  const { flags, rest } = splitKeybindFlags(value);
  const step = rest.slice(rest.lastIndexOf(">") + 1);
  const token = step.slice(step.lastIndexOf("+") + 1);
  if (token.includes(":")) return null;

  const replacementStart = cursorCharacter - token.length;
  const keyword = (label: string, detail: string): CompletionSuggestion => ({
    label,
    kind: "keyword",
    detail,
    replacementStart,
    replacementEnd: cursorCharacter,
    insertText: label,
    retrigger: true,
  });

  const usedModifiers = new Set(
    step.split("+").slice(0, -1).map(canonicalModifier),
  );
  const modifiers = KEYBIND_MODIFIERS.filter(
    (modifier) => !usedModifiers.has(modifier),
  ).map((modifier) => keyword(`${modifier}+`, "Modifier"));

  const atStart = rest === token;
  const prefixes = atStart
    ? KEYBIND_FLAGS.filter((flag) => !flags.includes(flag)).map((flag) =>
        keyword(`${flag}:`, "Keybind prefix"),
      )
    : [];

  return [...prefixes, ...modifiers].filter((item) =>
    item.label.startsWith(token),
  );
}
