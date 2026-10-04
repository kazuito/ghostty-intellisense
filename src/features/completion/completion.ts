import {
  CONFIG_COMMENT_PREFIX,
  CONFIG_KEY_VALUE_SEPARATOR,
} from "@/core/constants";
import { parseDocument } from "@/core/document";
import { additiveKeys, ghosttyConfigOptions, optionByKey } from "@/core/schema";
import { ghosttyActions } from "@/ghostty/actions";
import { ghosttyColors } from "@/ghostty/colors";
import { ghosttyDefaults } from "@/ghostty/defaults";
import { ghosttyFonts } from "@/ghostty/fonts";

export interface CompletionSuggestion {
  label: string;
  kind: "property" | "value";
  detail?: string;
  replacementStart: number;
  replacementEnd: number;
  insertText: string;
}

export function getCompletionSuggestions(
  documentText: string,
  lineUpToCursor: string,
  cursorCharacter: number,
): CompletionSuggestion[] | null {
  if (lineUpToCursor.trimStart().startsWith(CONFIG_COMMENT_PREFIX)) return null;

  const eqIndex = lineUpToCursor.indexOf(CONFIG_KEY_VALUE_SEPARATOR);

  if (eqIndex >= 0) {
    const key = lineUpToCursor.slice(0, eqIndex).trim();
    const option = optionByKey.get(key);
    if (!option) return null;

    const isColorKey = option.assets?.includes("color") ?? false;
    const isFontKey = option.assets?.includes("font") ?? false;

    const afterEq = lineUpToCursor.slice(eqIndex + 1);

    // keybind: suggest action names after the second `=` (key_combo=action)
    if (key === "keybind" && ghosttyActions.length > 0) {
      const secondEqIndex = afterEq.indexOf(CONFIG_KEY_VALUE_SEPARATOR);
      if (secondEqIndex >= 0) {
        const actionPrefix = afterEq.slice(secondEqIndex + 1).trimStart();
        const replacementStart = cursorCharacter - actionPrefix.length;
        return ghosttyActions
          .filter((action) => action.name.startsWith(actionPrefix))
          .map((action) => ({
            label: action.name,
            kind: "value" as const,
            detail: action.doc.split("\n")[0] || undefined,
            replacementStart,
            replacementEnd: cursorCharacter,
            insertText: action.name,
          }));
      }
    }

    const valuePrefix = option.comma
      ? afterEq.slice(afterEq.lastIndexOf(",") + 1).trimStart()
      : afterEq.trimStart();
    const replacementStart = cursorCharacter - valuePrefix.length;

    if (isColorKey) {
      const suggestions: CompletionSuggestion[] = [];
      for (const color of ghosttyColors) {
        if (color.name.startsWith(valuePrefix)) {
          suggestions.push({
            label: color.name,
            kind: "value",
            detail: color.hex,
            replacementStart,
            replacementEnd: cursorCharacter,
            insertText: color.name,
          });
        }
      }
      return suggestions.length > 0 ? suggestions : null;
    }

    const values = isFontKey ? ghosttyFonts : (option.enum?.map(String) ?? []);
    if (values.length === 0) return null;

    const defaultVal = ghosttyDefaults.get(key);

    return values
      .filter((value) => value.startsWith(valuePrefix))
      .map((value) => ({
        label: value,
        kind: "value" as const,
        detail:
          defaultVal !== undefined && value === defaultVal
            ? "default"
            : undefined,
        replacementStart,
        replacementEnd: cursorCharacter,
        insertText: value,
      }));
  }

  const usedKeys = new Set(
    parseDocument(documentText).flatMap((line) =>
      "key" in line ? [line.key] : [],
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
      const detail =
        defaultVal !== undefined && defaultVal !== ""
          ? `${option.desc} (default: ${defaultVal})`
          : option.desc;
      return {
        label: option.key,
        kind: "property" as const,
        detail,
        replacementStart,
        replacementEnd: cursorCharacter,
        insertText: `${option.key} = `,
      };
    });
}
