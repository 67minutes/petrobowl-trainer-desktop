import type { Fact } from "../src/shared/types";
import { energyFacts } from "./energy-facts";
import { definingFacts } from "./defining-facts";
import { historyFacts } from "./history-facts";
// Row positions are permanent identifiers: edit wording in place; append new facts.
// Removing a fact requires an explicit retired-ID entry, never renumbering the file.
export function expansion(): Fact[] {
  const all: Fact[] = [];
  for (const [collection, text] of [
    ["history", historyFacts],
    ["defining", definingFacts],
    ["energy", energyFacts],
  ] as const) {
    let topic = "",
      url = "",
      nodes: string[] = [],
      caption = "",
      number = 0;
    for (const raw of text.trim().split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("@")) {
        const fields = line.slice(1).split("|");
        topic = fields[0];
        url = fields[1];
        nodes = fields.slice(2, -1);
        caption = fields.at(-1)!;
        continue;
      }
      const parts = line.split("|");
      if (parts.length !== 4 || !url)
        throw new Error(`Invalid ${collection} record: ${line}`);
      const [answer, learn, quiz, explanation] = parts;
      number++;
      all.push({
        id: `exp-${collection}-${String(number).padStart(3, "0")}`,
        answer,
        acceptedAnswers: [answer],
        topics: [
          collection === "history"
            ? "Oil and Gas History"
            : collection === "defining"
              ? "Defining Series"
              : "Energy Fundamentals",
          topic,
        ],
        learn,
        quiz,
        explanation,
        sources: [
          {
            url,
            title:
              collection === "defining"
                ? "SLB Defining Series"
                : new URL(url).hostname.replace(/^www\./, ""),
            accessed: undefined,
          },
        ],
        originalIds: [],
        image: null,
        caption: "",
        alt: "",
        collection,
        diagram: {
          kind: collection === "history" ? "timeline" : "flow",
          nodes,
          caption,
        },
        editorial: {
          status: "pending",
          notes: [
            "Original authored draft: verify against the cited source, check overlap with the base bank, and review the diagram before release.",
          ],
        },
      });
    }
    if (number !== 200)
      throw new Error(
        `${collection} must have exactly 200 records; found ${number}`,
      );
  }
  return all;
}
