import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { factSchema } from "../src/main/service";
import type { Fact, Manifest } from "../src/shared/types";
const dir = path.resolve(import.meta.dirname, "../content");
const raw = readFileSync(path.join(dir, "bank.json"), "utf8");
const facts: Fact[] = JSON.parse(raw);
const manifest: Manifest = JSON.parse(
  readFileSync(path.join(dir, "manifest.json"), "utf8"),
);
const errors: string[] = [];
if (new Set(facts.map((f) => f.id)).size !== facts.length)
  errors.push("Duplicate fact IDs");
if (
  manifest.factCount !== facts.length ||
  createHash("sha256").update(raw).digest("hex") !== manifest.bankSha256
)
  errors.push("Bank manifest mismatch");
for (const f of facts) {
  const parsed = factSchema.safeParse(f);
  if (!parsed.success)
    errors.push(`${f.id}: invalid fact: ${parsed.error.message}`);
  if (f.learn === f.quiz) errors.push(`${f.id}: identical prompt variants`);
  if (
    f.image &&
    (!/^[a-zA-Z0-9._-]+\.(svg|png|jpg|jpeg|webp)$/.test(f.image) ||
      !existsSync(path.join(dir, "media", f.image)))
  )
    errors.push(`${f.id}: missing or unsafe image path`);
  if (f.image && (!f.alt || !f.caption))
    errors.push(`${f.id}: image needs caption and alternative text`);
}
if (process.argv.includes("--release")) {
  errors.push(...manifest.blockers);
  if (!manifest.releaseReady)
    errors.push(
      "Release gate is closed. Use installer:preview for a development build.",
    );
}
console.log(
  `${facts.length} facts; ${facts.filter((f) => f.image).length} bundled visuals; ${facts.filter((f) => f.editorial.status === "reviewed").length} editorially reviewed.`,
);
if (errors.length) {
  console.error(errors.slice(0, 25).join("\n"));
  if (errors.length > 25)
    console.error(`...and ${errors.length - 25} further issues.`);
  process.exitCode = 1;
} else console.log("Structural content validation passed.");
