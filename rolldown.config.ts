import path from "node:path";
import { defineConfig, type RolldownOptions } from "rolldown";

const isProd = process.env.NODE_ENV === "production";

function bundle(
  input: string,
  file: string,
  overrides: Partial<RolldownOptions> = {},
): RolldownOptions {
  return {
    input,
    platform: "node",
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    ...overrides,
    output: {
      file,
      format: "cjs",
      sourcemap: !isProd,
      ...(isProd && { minify: true }),
    },
  };
}

export default defineConfig([
  bundle("src/extension.ts", "out/extension.js", {
    external: ["vscode"],
  }),
  bundle("src/server.ts", "out/server.js"),
]);
