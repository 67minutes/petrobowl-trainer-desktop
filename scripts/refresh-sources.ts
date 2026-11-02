import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Fact } from "../src/shared/types";
const dir = path.resolve(import.meta.dirname, "../content");
mkdirSync(path.join(dir, "source-audit"), { recursive: true });
const facts: Fact[] = JSON.parse(
  readFileSync(path.join(dir, "bank.json"), "utf8"),
);
const urls = [
  ...new Set(facts.flatMap((f) => f.sources.map((s) => s.url.split("#")[0]))),
];
const results: {
  url: string;
  status: number;
  checkedAt: string;
  title: string;
  description: string;
  sha256: string;
  error?: string;
}[] = [];
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
let index = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
      const file = path.join(dir, "source-audit", key + ".json");
      if (existsSync(file) && !process.argv.includes("--force")) {
        const cached = JSON.parse(readFileSync(file, "utf8"));
        if (
          !process.argv.includes("--retry-failed") ||
          (cached.status === 200 && cached.title)
        ) {
          results.push(cached);
          continue;
        }
      }
      let result;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: { "User-Agent": "PetroBowlTrainer-source-verification/1.0" },
        });
        const bytes = await response.arrayBuffer();
        const text = new TextDecoder().decode(bytes);
        const pdf = text.startsWith("%PDF-");
        const title = pdf
          ? `PDF document: ${new URL(url).pathname.split("/").at(-1)}`
          : decode(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
        const description = pdf
          ? ""
          : decode(
              text.match(
                /<meta\s+name="description"\s+content="([^"]*)"/i,
              )?.[1] ?? "",
            );
        result = {
          url,
          status: response.status,
          checkedAt: new Date().toISOString(),
          title,
          description,
          sha256: createHash("sha256")
            .update(new Uint8Array(bytes))
            .digest("hex"),
        };
      } catch (e) {
        result = {
          url,
          status: 0,
          checkedAt: new Date().toISOString(),
          title: "",
          description: "",
          sha256: "",
          error: String(e),
        };
      }
      results.push(result);
      writeFileSync(file, JSON.stringify(result, null, 2));
      if (results.length % 100 === 0)
        console.log(`${results.length}/${urls.length} source URLs checked`);
    }
  }),
);
const failed = results.filter((r) => r.status !== 200 || !r.title);
const report = {
  checkedAt: new Date().toISOString(),
  total: urls.length,
  checked: results.length,
  succeeded: results.length - failed.length,
  failed,
  complete: false,
  method:
    "HTTP, title and description verification of existing source URLs. This does not certify a complete glossary crawl or editorial reconciliation.",
  pending: [
    "Discover additions to each source collection.",
    "Reconcile changed definitions and retired entries.",
    "Technically review generated prompts and images.",
  ],
};
writeFileSync(
  path.join(dir, "source-refresh.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    checked: report.checked,
    succeeded: report.succeeded,
    failed: failed.length,
    complete: report.complete,
  }),
);
