import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import { parseGlossaryCsv } from "./lib/glossary-csv";
import type { Fact, Manifest } from "../src/shared/types";
import { expansion } from "./expansion";
import { originalVisual } from "./visuals";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "content");
mkdirSync(path.join(out, "media"), { recursive: true });
const snapshot = JSON.parse(
  readFileSync(
    path.join(
      root,
      "data/workbook/snapshot.json",
    ),
    "utf8",
  ),
);
const topicNames = new Map<string, string>(
  snapshot.topics.map((t: { id: string; name: string }) => [t.id, t.name]),
);
const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const strip = (s: string) => s.replace(/^\[[^\]]+\]\s*/, "").trim();
const identity = (question: string, answers: string[]) =>
  normalize(strip(question)) +
  "|" +
  [...new Set(answers.map(normalize))].sort().join("|");
const uuid = (s: string) =>
  "fact-" + createHash("sha256").update(s).digest("hex").slice(0, 24);
const sourceTitle = (url: string) =>
  url.includes("slb.com")
    ? "SLB Energy Glossary"
    : url.includes("eia.gov")
      ? "U.S. Energy Information Administration"
      : "U.S. Department of Energy";
const sourceAliases: Record<string, string> = {
  "https://glossary.slb.com/en/terms/z/zero_phase":
    "https://glossary.slb.com/en/terms/z/zero-phase",
  "https://glossary.slb.com/en/terms/n/neural_networks":
    "https://glossary.slb.com/en/terms/n/neural_network",
};
const canonicalURL = (url: string) => sourceAliases[url] ?? url;
const sourceList = (url: string) =>
  url ? [{ url: canonicalURL(url), title: sourceTitle(url) }] : [];
const grouped = new Map<string, Fact>();
for (const r of snapshot.records) {
  const answers = [
    ...new Set<string>([r.answer, ...(r.accepted_answers ?? [])]),
  ];
  const prompt = strip(r.question);
  const key = identity(prompt, answers);
  let fact = grouped.get(key);
  if (!fact) {
    fact = {
      id: r.id,
      answer: r.answer,
      acceptedAnswers: answers,
      topics: [],
      learn: prompt,
      quiz: `Name the term described here: ${prompt}`,
      explanation: prompt.replace(/\[TERM\]/g, r.answer),
      sources: sourceList(r.metadata?.url || ""),
      originalIds: [],
      image: null,
      caption: "",
      alt: "",
      editorial: {
        status: "pending",
        notes: [
          "Learning and independent quiz wording require editorial review.",
        ],
      },
      collection: "base",
    };
    grouped.set(key, fact);
  }
  fact.originalIds.push(r.id);
  const topic = topicNames.get(r.topic_id);
  if (topic && !fact.topics.includes(topic)) fact.topics.push(topic);
  if (
    r.metadata?.url &&
    !fact.sources.some((s) => s.url === canonicalURL(r.metadata.url))
  )
    fact.sources.push(...sourceList(r.metadata.url));
}
const base = [...grouped.values()];
const byOriginal = new Map<string, Fact>();
base.forEach((f) => f.originalIds.forEach((id) => byOriginal.set(id, f)));
const rows = await readSheet(
  path.join(
    root,
    "data/workbook/petrobowl_rephrased_batch_1.xlsx",
  ),
  "Questions",
);
const workbookRows = rows.slice(1).filter((r) => r[3] && r[4]);
const reviewNotes: { factId: string; answer: string; note: string }[] = [];
for (const row of workbookRows) {
  const ids = String(row[7] ?? "").match(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi) ?? [];
  const fact = ids.map((id) => byOriginal.get(id)).find(Boolean);
  if (!fact)
    throw new Error(`Workbook question ${row[0]} has no snapshot match`);
  fact.learn = String(row[3]);
  fact.answer = String(row[4]);
  if (row[5])
    fact.acceptedAnswers = [
      ...new Set([
        fact.answer,
        ...String(row[5])
          .split(";")
          .map((a) => a.trim())
          .filter(Boolean),
      ]),
    ];
  if (row[1])
    for (const topic of String(row[1])
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)) {
      if (!fact.topics.includes(topic)) fact.topics.push(topic);
    }
  if (row[6])
    for (const url of String(row[6])
      .split(/;|\n|,\s*(?=https?:)/)
      .map((u) => u.trim())
      .filter(Boolean)) {
      if (!fact.sources.some((s) => s.url === canonicalURL(url)))
        fact.sources.push(...sourceList(url));
    }
  fact.quiz = `Identify the term from these clues: ${strip(String(row[2]))}`;
  if (row[8]) {
    fact.editorial.notes.push(String(row[8]));
    reviewNotes.push({
      factId: fact.id,
      answer: fact.answer,
      note: String(row[8]),
    });
  }
}
// Supplement the saved bank with local CSV records, preserving distinct senses.
const known = new Map(
  base.map((f) => [identity(f.explanation, f.acceptedAnswers), f]),
);
const registryPath = path.join(out, "source-id-registry.json");
const registry: Record<
  string,
  { primary: string; senses: Record<string, string> }
> = existsSync(registryPath)
  ? JSON.parse(readFileSync(registryPath, "utf8"))
  : {};
const usedCSVIds = new Set<string>();
function definitionSignature(text: string, answers: string[]) {
  let s = normalize(strip(text)).replace(/\[term\]/g, "#");
  for (const answer of [...answers].sort((a, b) => b.length - a.length)) {
    if (answer.length < 2) continue;
    const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "#");
  }
  return s;
}
let csvAdded = 0;
for (const folder of ["slb_glossary", "energy_glossaries"])
  for (const file of readdirSync(path.join(root, "data", folder)).filter((f) =>
    f.endsWith(".csv"),
  )) {
    const slug = file.replace(".csv", "");
    const candidateTopic = slug
      .split("_")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" ");
    const topic =
      [...topicNames.values()].find(
        (t) => normalize(t) === normalize(candidateTopic),
      ) ?? candidateTopic;
    const parsed = parseGlossaryCsv(
      slug,
      topic,
      readFileSync(path.join(root, "data", folder, file), "utf8"),
    );
    for (const q of parsed.questions) {
      const key = identity(
        q.question.replace(/\[TERM\]/g, q.answer),
        q.acceptedAnswers,
      );
      const equivalent =
        known.get(key) ??
        base.find(
          (f) =>
            f.acceptedAnswers.some(
              (a) => normalize(a) === normalize(q.answer),
            ) &&
            f.sources.some(
              (s) => s.url === canonicalURL(q.metadata.url ?? ""),
            ) &&
            definitionSignature(f.explanation, [
              ...f.acceptedAnswers,
              ...q.acceptedAnswers,
            ]) ===
              definitionSignature(q.question, [
                ...f.acceptedAnswers,
                ...q.acceptedAnswers,
              ]),
        );
      if (equivalent) {
        if (!equivalent.topics.includes(topic)) equivalent.topics.push(topic);
        continue;
      }
      // Same label/URL with a different definition is a separate candidate sense.
      // The tracked registry keeps IDs stable across wording-only source updates.
      const sourceKey = `${canonicalURL(q.metadata.url ?? "")}|${q.termKey}`;
      const entry = registry[sourceKey] ?? {
        primary: uuid(sourceKey),
        senses: {},
      };
      const signature = definitionSignature(q.question, q.acceptedAnswers);
      let id = entry.senses[signature];
      if (!id) {
        const prior = [...new Set(Object.values(entry.senses))];
        id =
          prior.length === 0 ||
          (prior.length === 1 && !usedCSVIds.has(prior[0]))
            ? entry.primary
            : uuid(`${sourceKey}|sense|${signature}`);
        entry.senses[signature] = id;
      }
      if (usedCSVIds.has(id))
        throw new Error(`Source sense IDs need reconciliation: ${sourceKey}`);
      usedCSVIds.add(id);
      registry[sourceKey] = entry;
      const f: Fact = {
        id,
        answer: q.answer,
        acceptedAnswers: q.acceptedAnswers,
        topics: [topic],
        learn: q.question,
        quiz: `Identify the term from these clues: ${q.question}`,
        explanation: q.question.replace(/\[TERM\]/g, q.answer),
        sources: sourceList(q.metadata.url ?? ""),
        originalIds: [],
        image: null,
        caption: "",
        alt: "",
        editorial: {
          status: "pending",
          notes: [
            "CSV supplement: reconcile source sense and author both prompt variants.",
          ],
        },
        collection: "base",
      };
      base.push(f);
      known.set(key, f);
      csvAdded++;
    }
  }
writeFileSync(registryPath, JSON.stringify(registry, null, 2));
const overridesPath = path.join(out, "editorial-overrides.json");
const overrides = {
  ...(existsSync(overridesPath)
    ? JSON.parse(readFileSync(overridesPath, "utf8"))
    : {}),
  ...JSON.parse(readFileSync(path.join(out, "foundations.json"), "utf8")),
};
const facts: Fact[] = [...base, ...expansion()];
for (const f of facts) {
  if (overrides[f.id]) Object.assign(f, overrides[f.id]);
  for (const source of f.sources) {
    const key = createHash("sha256")
      .update(source.url.split("#")[0])
      .digest("hex")
      .slice(0, 24);
    const file = path.join(out, "source-audit", `${key}.json`);
    if (existsSync(file)) {
      const audit = JSON.parse(readFileSync(file, "utf8"));
      if (audit.status === 200 && audit.title)
        source.accessed = audit.checkedAt;
    }
  }
  const visual = originalVisual(f);
  if (visual) {
    const name = `${f.id}-${createHash("sha256").update(visual.svg).digest("hex").slice(0, 12)}.svg`;
    writeFileSync(path.join(out, "media", name), visual.svg);
    f.image = name;
    f.caption = visual.caption;
    f.alt = visual.alt;
  }
  f.topics.sort();
}
const foundationOrder = [
  "7cdbe8bb-8efa-4541-9835-170efd083c70",
  "3f2273ab-851f-49cd-a34e-6ca68e8ef6c2",
  "bffc9261-334b-41e2-bd3e-a2effaa981f6",
  "8bc240e2-c01b-4e7e-83cc-df48faf4c628",
  "887ccb50-f30a-40a3-a2d7-e18d1c5b8826",
];
const foundationRank = new Map(foundationOrder.map((id, i) => [id, i]));
facts.sort(
  (a, b) =>
    (foundationRank.get(a.id) ?? 100000) - (foundationRank.get(b.id) ?? 100000),
);
const blockers: string[] = [];
const pending = facts.filter((f) => f.editorial.status !== "reviewed").length;
const missingImages = facts.filter((f) => !f.image).length;
if (pending)
  blockers.push(
    `${pending} facts need independent prompt/source editorial verification.`,
  );
if (missingImages)
  blockers.push(
    `${missingImages} facts need an explanatory, technically reviewed visual.`,
  );
const expansionCounts = Object.fromEntries(
  ["history", "defining", "energy"].map((k) => [
    k,
    facts.filter((f) => f.collection === k).length,
  ]),
);
for (const [key, count] of Object.entries(expansionCounts))
  if (count !== 200)
    blockers.push(`${key}: ${count}/200 authored expansion facts.`);
const refreshFile = path.join(out, "source-refresh.json");
if (!existsSync(refreshFile))
  blockers.push("Full official-source refresh has not been completed.");
else {
  const refresh = JSON.parse(readFileSync(refreshFile, "utf8"));
  if (!refresh.complete || refresh.failed?.length)
    blockers.push("Official-source refresh has unresolved or unchecked pages.");
}
const json = JSON.stringify(facts);
writeFileSync(path.join(out, "bank.json"), json);
const manifest: Manifest = {
  version: "2026.10.19.1",
  builtAt: new Date().toISOString(),
  factCount: facts.length,
  workbookCount: workbookRows.length,
  expansion: expansionCounts,
  releaseReady: blockers.length === 0,
  blockers,
  bankSha256: createHash("sha256").update(json).digest("hex"),
};
writeFileSync(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
writeFileSync(
  path.join(out, "import-report.json"),
  JSON.stringify(
    {
      snapshotRecords: snapshot.records.length,
      snapshotDistinct: grouped.size,
      workbookImported: workbookRows.length,
      csvAdded,
      reviewNotes,
      sourceAliases,
      blockers,
      assets: {
        author: "PetroBowl Trainer",
        license: "Original diagrams authored for this application",
        sourceImagesCopied: 0,
      },
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(manifest, null, 2));
