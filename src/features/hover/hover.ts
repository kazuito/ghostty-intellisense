import {
  GHOSTTY_CONFIG_REFERENCE_URL,
  GHOSTTY_KEYBIND_REFERENCE_URL,
} from "@/core/constants";
import { parseLine } from "@/core/document";
import { findKeybindSeparator, keybindActionName } from "@/core/keybind";
import { canonicalKey, optionByKey } from "@/core/schema";
import { ghosttyActions } from "@/ghostty/actions";
import { ghosttyDefaults } from "@/ghostty/defaults";

export interface HoverContent {
  kind: "markdown";
  value: string;
}

export function getHoverContent(
  line: string,
  character = 0,
): HoverContent | null {
  const parsed = parseLine(line);
  if (!("key" in parsed)) return null;

  if (parsed.type === "entry" && parsed.key === "keybind") {
    const actionHover = keybindActionHover(parsed, character);
    if (actionHover) return actionHover;
  }

  const option = optionByKey.get(canonicalKey(parsed.key));
  if (!option) return null;

  const deprecationLine =
    option.key === parsed.key
      ? ""
      : `*Deprecated:* \`${parsed.key}\` was renamed to \`${option.key}\`.\n\n`;

  const defaultVal = ghosttyDefaults.get(option.key);
  const defaultLine =
    defaultVal !== undefined
      ? `\n\n**Default:** ${defaultVal === "" ? "*(empty)*" : `\`${defaultVal}\``}`
      : "";

  return {
    kind: "markdown",
    value: `**${option.key}**\n\n${deprecationLine}${option.desc}${defaultLine}\n\n[Documentation](${GHOSTTY_CONFIG_REFERENCE_URL}${option.key})`,
  };
}

function keybindActionHover(
  entry: { rawValue: string; eqIndex: number },
  character: number,
): HoverContent | null {
  const separator = findKeybindSeparator(entry.rawValue);
  if (separator < 0 || character <= entry.eqIndex + 1 + separator) return null;

  const name = keybindActionName(entry.rawValue);
  const action = ghosttyActions.find((candidate) => candidate.name === name);
  if (!action) return null;

  return {
    kind: "markdown",
    value: `**${action.name}**\n\n${action.doc}\n\n[Documentation](${GHOSTTY_KEYBIND_REFERENCE_URL}${action.name})`,
  };
}
