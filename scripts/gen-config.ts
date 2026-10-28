import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pin from "../test/ghostty-pin.json";

// Generated from the pinned release's source rather than the website, whose
// reference.mdx is synced from Ghostty `main` by hand and can lag a release.
const CONFIG_SOURCE_URL = `https://raw.githubusercontent.com/ghostty-org/ghostty/v${pin.version}/src/config/Config.zig`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = path.join(root, "src/generated/config-keys.ts");
const grammarPath = path.join(root, "syntaxes/ghostty-config.tmLanguage.json");
const schemaPath = path.join(root, "src/core/schema.ts");

type Entry = { key: string; desc: string };

async function fetchConfigSource(): Promise<string> {
  const res = await fetch(CONFIG_SOURCE_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Config.zig: ${res.status} ${res.statusText}`,
    );
  }
  return res.text();
}

const FIELD_RE = /^(?:@"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*)):/;

/**
 * The `///` lines documenting the field declared on `lines[index]`, as
 * Ghostty's helpgen extracts them: blank and `//` lines are not tokens, so
 * they don't detach a doc comment, and the common leading indent is removed.
 */
function fieldDocLines(lines: string[], index: number): string[] {
  const docs: string[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trimStart();
    if (line.startsWith("///") && !line.startsWith("////")) {
      docs.unshift(line.slice(3));
    } else if (line !== "" && !(line.startsWith("//") && line[2] !== "!")) {
      break;
    }
  }
  const indent = Math.min(
    ...docs.filter((l) => l.trim()).map((l) => l.search(/\S/)),
  );
  return docs.map((l) => l.slice(Math.min(indent, l.length)));
}

/**
 * Renders the config reference MDX from `Config.zig` the way Ghostty's
 * `src/build/webgen/main_config.zig` does for the website: one `## \`key\``
 * heading per top-level field, undocumented fields grouped under the
 * preceding documented one, indented blocks fenced, and `Note:`/`Warning:`
 * paragraphs turned into callouts.
 */
export function configSourceToMdx(source: string): string {
  const lines = source.split("\n");
  const fields = lines.flatMap((line, i) => {
    const match = FIELD_RE.exec(line);
    return match
      ? [{ name: match[1] ?? match[2], docs: fieldDocLines(lines, i) }]
      : [];
  });

  let out = "";
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.name.startsWith("_") || field.docs.length === 0) continue;

    out += `## \`${field.name}\`\n`;
    for (const next of fields.slice(i + 1)) {
      if (next.name.startsWith("_") || next.docs.length > 0) break;
      out += `## \`${next.name}\`\n`;
    }
    out += "\n";

    type Block = "text" | "code" | "note" | "warning";
    let block: Block | null = null;
    const endBlock = () => {
      if (block === "code") out += "```\n";
      else if (block === "note") out += "</Note>\n";
      else if (block === "warning") out += "</Warning>\n";
    };
    for (const s of field.docs) {
      if (s === "") {
        endBlock();
        block = null;
        out += "\n";
        continue;
      }
      const first = block === null;
      if (block === null) {
        if (s.startsWith("    ")) {
          block = "code";
          out += "```\n";
        } else if (s.toLowerCase().startsWith("note:")) {
          block = "note";
          out += "<Note>\n";
        } else if (s.toLowerCase().startsWith("warning:")) {
          block = "warning";
          out += "<Warning>\n";
        } else {
          block = "text";
        }
      }
      if (block === "code") out += s.startsWith("    ") ? s.slice(4) : s;
      else if (block === "note" && first) out += s.slice("note:".length);
      else if (block === "warning" && first) out += s.slice("warning:".length);
      else out += s;
      out += "\n";
    }
    endBlock();
    out += "\n";
  }
  return out;
}

function stripInlineJsx(text: string): string {
  return text
    .replace(/<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractDesc(body: string): string {
  for (const raw of body.split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith("```")) continue;
    if (block.startsWith("import ")) continue;
    if (/^<[A-Z]/.test(block)) continue;
    return stripInlineJsx(block.replace(/\s*\n\s*/g, " "))
      .replace(/\s*(?:for example|for instance|e\.g\.)\s*:\s*$/i, "")
      .trim();
  }
  return "";
}

export function parseEntries(mdx: string): Entry[] {
  const headingRe = /^## `([^`]+)`\s*$/gm;
  const matches = [...mdx.matchAll(headingRe)];
  const entries: Entry[] = [];

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? mdx.length)
        : mdx.length;

    let body = mdx.slice(start, end);
    const nextHeading = body.search(/\n#{1,2} /);
    if (nextHeading !== -1) body = body.slice(0, nextHeading);

    entries.push({ key, desc: extractDesc(body) });
  }

  // Grouped headings stack consecutively and share one description placed under
  // the last heading in the group, leaving the earlier keys with empty bodies.
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].desc === "" && i + 1 < entries.length) {
      entries[i].desc = entries[i + 1].desc;
    }
  }

  return entries;
}

function writeConfigKeys(entries: Entry[]): void {
  const header = [
    "// AUTO-GENERATED by `bun run gen:config`. Do not edit by hand.",
    `// Source: ${CONFIG_SOURCE_URL}`,
    "",
    "export type GeneratedConfigKey = { key: string; desc: string };",
    "",
    "export const configKeys = [",
  ].join("\n");

  const body = entries
    .map(
      (e) =>
        `  { key: ${JSON.stringify(e.key)}, desc: ${JSON.stringify(e.desc)} },`,
    )
    .join("\n");

  mkdirSync(path.dirname(generatedPath), { recursive: true });
  writeFileSync(
    generatedPath,
    `${header}\n${body}\n] as const satisfies readonly GeneratedConfigKey[];\n`,
  );
}

async function collectFromSchema(): Promise<{
  enumValues: string[];
  renamedKeys: string[];
}> {
  const { ghosttyConfigOptions, renamedKeys } = (await import(
    pathToFileURL(schemaPath).href
  )) as typeof import("../src/core/schema");

  return {
    enumValues: [
      ...new Set(
        ghosttyConfigOptions.flatMap((o) => (o.enum ?? []).map(String)),
      ),
    ].sort((a, b) =>
      a.length === b.length ? a.localeCompare(b) : b.length - a.length,
    ),
    renamedKeys: [...renamedKeys.keys()],
  };
}

function updateGrammar(keys: string[], enumValues: string[]): void {
  const grammar = JSON.parse(readFileSync(grammarPath, "utf8"));
  grammar.repository.assignment.patterns[0].begin = `^(\\s*)(${keys.join("|")})(\\s*)(=)(\\s*)`;
  const enumGroup = `(?:${enumValues.join("|")})`;
  const enumTail = `(?=\\s*(?:,|$))`;
  grammar.repository.enum.patterns[0].match = `\\G${enumGroup}${enumTail}`;
  grammar.repository.enum.patterns[1].match = `(,)(\\s*)(${enumGroup})${enumTail}`;
  writeFileSync(grammarPath, `${JSON.stringify(grammar, null, 2)}\n`);
}

async function main(): Promise<void> {
  const entries = parseEntries(configSourceToMdx(await fetchConfigSource()));
  if (entries.length === 0) {
    throw new Error("No config keys parsed from Config.zig");
  }

  writeConfigKeys(entries);
  const { enumValues, renamedKeys } = await collectFromSchema();
  // Renamed keys still work in Ghostty, so they stay highlighted as keys.
  updateGrammar([...entries.map((e) => e.key), ...renamedKeys], enumValues);

  console.log(
    `Generated ${entries.length} keys → config-keys.ts and grammar (${enumValues.length} enum values).`,
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
