import { build } from "esbuild";
import { build as viteBuild } from "vite";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
await build({
  entryPoints: [path.join(root, "src/main/main.ts")],
  outfile: path.join(root, "dist/main/main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron", "better-sqlite3"],
  sourcemap: true,
});
await build({
  entryPoints: [path.join(root, "src/main/preload.ts")],
  outfile: path.join(root, "dist/main/preload.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
});
await viteBuild({ configFile: path.join(root, "vite.config.ts") });
