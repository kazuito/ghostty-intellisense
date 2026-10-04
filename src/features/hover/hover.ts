import { GHOSTTY_CONFIG_REFERENCE_URL } from "@/core/constants";
import { parseLine } from "@/core/document";
import { optionByKey } from "@/core/schema";
import { ghosttyDefaults } from "@/ghostty/defaults";

export interface HoverContent {
  kind: "markdown";
  value: string;
}

export function getHoverContent(line: string): HoverContent | null {
  const parsed = parseLine(line);
  if (!("key" in parsed)) return null;

  const option = optionByKey.get(parsed.key);
  if (!option) return null;

  const defaultVal = ghosttyDefaults.get(option.key);
  const defaultLine =
    defaultVal !== undefined
      ? `\n\n**Default:** ${defaultVal === "" ? "*(empty)*" : `\`${defaultVal}\``}`
      : "";

  return {
    kind: "markdown",
    value: `**${option.key}**\n\n${option.desc}${defaultLine}\n\n[Documentation](${GHOSTTY_CONFIG_REFERENCE_URL}${option.key})`,
  };
}
