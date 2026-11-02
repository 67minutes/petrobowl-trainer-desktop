import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TrainerService } from "./service";
import { studyDay } from "./scheduler";
import type { Fact, Queue, RatingName } from "../shared/types";
const opened: TrainerService[] = [];
afterEach(() => {
  for (const s of opened.splice(0)) {
    try {
      s.close();
    } catch {}
  }
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "petrobowl-test-"));
  const content = path.join(root, "content");
  mkdirSync(content);
  const facts: Fact[] = Array.from({ length: 6 }, (_, i) => ({
    id: `fact-${i}`,
    answer: `Answer ${i}`,
    acceptedAnswers: [`Answer ${i}`],
    topics:
      i === 0 ? ["Drilling", "Geology"] : [i % 2 ? "Drilling" : "Geology"],
    learn: `Question ${i}?`,
    quiz: `Different question ${i}?`,
    explanation: "A technical explanation.",
    sources: [{ url: "https://glossary.slb.com/", title: "Source" }],
    originalIds: [],
    image: null,
    caption: "",
    alt: "",
    editorial: { status: "pending", notes: [] },
    collection: "base",
  }));
  writeFileSync(path.join(content, "bank.json"), JSON.stringify(facts));
  writeFileSync(
    path.join(content, "manifest.json"),
    JSON.stringify({
      version: "test-1",
      factCount: facts.length,
      blockers: [],
      releaseReady: false,
    }),
  );
  let time = new Date(2026, 9, 19, 12);
  const clock = () => new Date(time);
  let s = new TrainerService(path.join(root, "user"), content, clock);
  opened.push(s);
  return {
    get s() {
      return s;
    },
    facts,
    content,
    advance: (ms: number) => {
      time = new Date(+time + ms);
    },
    now: clock,
    reopen: () => {
      s.close();
      s = new TrainerService(path.join(root, "user"), content, clock);
      opened.push(s);
      return s;
    },
  };
}
function rate(
  s: TrainerService,
  rating: RatingName = "good",
  queue: Queue = s.queue(),
  operationId = randomUUID(),
) {
  const c = queue.card!;
  return s.review({
    factId: c.id,
    rating,
    revision: c.revision,
    operationId,
    scheduledAt: c.scheduledAt,
  });
}
describe("persistent learning", () => {
  it.each(["again", "hard", "good", "easy"] as const)(
    "persists the previewed %s choice without changing its interval",
    (rating) => {
      const f = fixture();
      const q = f.s.queue();
      const expected = q.card!.previews[rating].due;
      rate(f.s, rating, q);
      expect(JSON.parse(f.s.exportData().cards[0].state).due).toBe(expected);
    },
  );
  it("graduates learning, persists a review lapse, and completes the ten-minute relearning step", () => {
    const f = fixture();
    f.s.settings({ newPerDay: 1 });
    rate(f.s, "again");
    f.advance(60_000);
    rate(f.s, "good");
    expect(f.s.queue().card).toBeNull();
    f.advance(600_000);
    rate(f.s, "good");
    let c = JSON.parse(f.s.exportData().cards[0].state);
    expect(c.state).toBe(2);
    f.advance(+new Date(c.due) - +f.now());
    f.s.settings({ newPerDay: 0 });
    expect(f.s.queue().card?.state).toBe("Review");
    rate(f.s, "again");
    c = JSON.parse(f.s.exportData().cards[0].state);
    expect(c.state).toBe(3);
    expect(+new Date(c.due) - +f.now()).toBe(600_000);
    f.reopen();
    expect(f.s.queue().card).toBeNull();
    f.advance(600_000);
    expect(f.s.queue().card?.state).toBe("Relearning");
    rate(f.s, "good");
    expect(JSON.parse(f.s.exportData().cards[0].state).state).toBe(2);
    expect(f.s.progress().points.at(-1)?.count).toBe(1);
    expect(f.s.progress().points.at(-1)?.accuracy).toBe(0);
  });
  it("persists minute steps and never presents a future step early", () => {
    const f = fixture();
    f.s.settings({ newPerDay: 1 });
    const c = f.s.queue().card!;
    expect(c.previews.again.label).toBe("1 min");
    rate(f.s, "again");
    expect(f.s.queue().card).toBeNull();
    expect(f.s.queue().nextLearning).not.toBeNull();
    f.reopen();
    expect(f.s.queue().card).toBeNull();
    f.advance(60_000);
    expect(f.s.queue().card?.id).toBe(c.id);
    expect(f.s.queue().card?.state).toBe("Learning");
  });
  it("saves the previewed interval exactly and prioritizes due learning", () => {
    const f = fixture();
    const q = f.s.queue();
    const due = q.card!.previews.again.due;
    rate(f.s, "again", q);
    const row = f.s.db
      .prepare("SELECT state FROM cards WHERE id=?")
      .get(q.card!.id) as { state: string };
    expect(JSON.parse(row.state).due).toBe(due);
    f.advance(60_000);
    expect(f.s.queue().card?.id).toBe(q.card!.id);
  });
  it("rejects an expired preview and accepts a refreshed card", () => {
    const f = fixture();
    const q = f.s.queue();
    f.advance(3600_001);
    expect(() => rate(f.s, "good", q)).toThrow("expired");
    expect(f.s.queue().reviewedToday).toBe(0);
    rate(f.s, "good");
    expect(f.s.queue().reviewedToday).toBe(1);
  });
  it("deduplicates submissions, rejects stale cards, and undoes transactionally", () => {
    const f = fixture();
    const q = f.s.queue();
    const op = randomUUID();
    rate(f.s, "good", q, op);
    rate(f.s, "good", q, op);
    expect(f.s.queue().reviewedToday).toBe(1);
    expect(() => rate(f.s, "good", q)).toThrow("changed");
    const restored = f.s.undo();
    expect(restored.reviewedToday).toBe(0);
    expect(restored.card?.id).toBe(q.card!.id);
    expect(restored.card?.revision).toBeGreaterThan(q.card!.revision);
    expect(() => rate(f.s, "easy", q)).toThrow("changed");
  });
  it("applies a global new-fact limit across topic filters", () => {
    const f = fixture();
    f.s.settings({ newPerDay: 1, selectedTopics: ["Drilling"] });
    rate(f.s, "easy");
    f.s.settings({ selectedTopics: ["Geology"] });
    expect(f.s.queue().newAvailable).toBe(0);
    f.advance(86400_000);
    expect(f.s.queue().newAvailable).toBe(1);
  });
  it("suspends unseen facts and preserves the schedule on resume", () => {
    const f = fixture();
    const q = f.s.queue();
    f.s.suspend({ factId: q.card!.id, suspended: true });
    expect(f.s.queue().card?.id).not.toBe(q.card!.id);
    f.s.suspend({ factId: q.card!.id, suspended: false });
    expect(f.s.queue().card?.id).toBe(q.card!.id);
    rate(f.s, "easy");
    const before = f.s.exportData().cards[0].state;
    f.s.suspend({ factId: q.card!.id, suspended: true });
    f.s.suspend({ factId: q.card!.id, suspended: false });
    expect(f.s.exportData().cards[0].state).toBe(before);
  });
  it("uses the local 04:00 study-day boundary", () => {
    expect(studyDay(new Date(2026, 9, 20, 3, 59))).toBe("2026-10-19");
    expect(studyDay(new Date(2026, 9, 20, 4))).toBe("2026-10-20");
  });
  it("validates settings and counts multi-topic facts only once overall", () => {
    const f = fixture();
    expect(() => f.s.settings({ retention: 0.5 })).toThrow();
    expect(() => f.s.settings({ selectedTopics: ["unknown"] })).toThrow();
    rate(f.s, "easy");
    const p = f.s.progress();
    expect(p.studied).toBe(1);
    expect(p.coverage.reduce((n, t) => n + t.studied, 0)).toBe(2);
  });
  it("excludes new learning from recall accuracy and uses only the first scheduled review per fact/day", () => {
    const f = fixture();
    rate(f.s, "easy");
    expect(f.s.progress().points.every((p) => p.accuracy === null)).toBe(true);
    const c = f.s.exportData().cards[0];
    const at = f.now().toISOString();
    const insert = f.s.db.prepare(
      "INSERT INTO reviews(operation_id,fact_id,at,day,kind,rating,before_state,after_state) VALUES (?,?,?,?,?,?,?,?)",
    );
    for (const rating of ["again", "good"])
      insert.run(
        randomUUID(),
        c.id,
        at,
        studyDay(f.now()),
        "review",
        rating,
        c.state,
        c.state,
      );
    insert.run(
      randomUUID(),
      c.id,
      at,
      studyDay(f.now()),
      "learning",
      "good",
      c.state,
      c.state,
    );
    const last = f.s.progress().points.at(-1)!;
    expect(last.count).toBe(1);
    expect(last.accuracy).toBe(0);
  });
});
describe("quiz isolation and correction", () => {
  it("preserves roster/question snapshots, allows rebounds, ties ranks, and leaves FSRS unchanged", () => {
    const f = fixture();
    const team = f.s.saveTeam({
      id: "",
      name: "Team A",
      members: ["Ada", "Ben"],
    });
    const before = JSON.stringify(f.s.exportData().cards);
    let q = f.s.createQuiz({
      name: "Practice",
      teamId: team.id,
      count: 2,
      topics: [],
      studiedOnly: false,
    });
    expect(new Set(q.questions.map((x) => x.fact.id)).size).toBe(2);
    f.s.saveTeam({ ...team, members: ["Changed"] });
    expect(f.s.quiz(q.id).team.members).toEqual(["Ada", "Ben"]);
    q = f.s.quizAction({
      id: q.id,
      revision: q.revision,
      action: "wrong",
      player: "Ada",
    });
    expect(() =>
      f.s.quizAction({
        id: q.id,
        revision: q.revision,
        action: "wrong",
        player: "Ada",
      }),
    ).toThrow("already");
    q = f.s.quizAction({
      id: q.id,
      revision: q.revision,
      action: "correct",
      player: "Ben",
    });
    expect(q.questions[0].attempts).toHaveLength(2);
    q = f.s.quizAction({ id: q.id, revision: q.revision, action: "next" });
    q = f.s.quizAction({
      id: q.id,
      revision: q.revision,
      action: "unanswered",
    });
    q = f.s.quizAction({ id: q.id, revision: q.revision, action: "next" });
    expect(q.completedAt).toBeTruthy();
    expect(f.s.quizzes()[0].correct).toBe(1);
    expect(JSON.stringify(f.s.exportData().cards)).toBe(before);
    q = f.s.quizAction({ id: q.id, revision: q.revision, action: "undo" });
    expect(q.completedAt).toBeNull();
    q = f.s.quizAction({ id: q.id, revision: q.revision, action: "undo" });
    expect(q.questions[1].closed).toBe(false);
  });
  it("rejects invalid pools and duplicate names without writing a session", () => {
    const f = fixture();
    expect(() =>
      f.s.saveTeam({ id: "", name: "T", members: ["Ada", "ada"] }),
    ).toThrow();
    const t = f.s.saveTeam({ id: "", name: "T", members: ["A"] });
    expect(() =>
      f.s.createQuiz({
        name: "Q",
        teamId: t.id,
        count: 30,
        topics: [],
        studiedOnly: false,
      }),
    ).toThrow("Only 6");
    expect(() =>
      f.s.createQuiz({
        name: "Q",
        teamId: t.id,
        count: 1,
        topics: [],
        studiedOnly: true,
      }),
    ).toThrow("Only 0");
    expect(f.s.quizzes()).toHaveLength(0);
  });
  it("resumes quiz state after restart and rejects stale scoring", () => {
    const f = fixture();
    const team = f.s.saveTeam({ id: "", name: "T", members: ["A", "B"] });
    const q = f.s.createQuiz({
      name: "Q",
      teamId: team.id,
      count: 2,
      topics: [],
      studiedOnly: false,
    });
    f.s.quizAction({ id: q.id, revision: 0, action: "wrong", player: "A" });
    f.reopen();
    expect(f.s.quiz(q.id).questions[0].attempts).toHaveLength(1);
    expect(() =>
      f.s.quizAction({ id: q.id, revision: 0, action: "correct", player: "B" }),
    ).toThrow("changed");
  });
});
describe("backups and bank upgrades", () => {
  it("validates before replacing and retains unknown fact histories", () => {
    const f = fixture();
    rate(f.s, "easy");
    const data = f.s.exportData();
    expect(() =>
      f.s.restoreData({ ...data, cards: [{ ...data.cards[0], state: "{}" }] }),
    ).toThrow();
    expect(f.s.exportData().cards).toHaveLength(1);
    f.s.restoreData(data);
    expect(f.s.exportData().cards).toHaveLength(1);
    writeFileSync(
      path.join(f.content, "bank.json"),
      JSON.stringify(f.facts.slice(1)),
    );
    f.reopen();
    expect(f.s.exportData().cards).toHaveLength(1);
    expect(f.s.progress().studied).toBe(0);
    writeFileSync(path.join(f.content, "bank.json"), JSON.stringify(f.facts));
    f.reopen();
    expect(f.s.progress().studied).toBe(1);
  });
  it("round-trips completed quiz snapshots and correction history; refuses malformed histories", () => {
    const f = fixture();
    const t = f.s.saveTeam({ id: "", name: "Original", members: ["A"] });
    let q = f.s.createQuiz({
      name: "Q",
      teamId: t.id,
      count: 1,
      topics: [],
      studiedOnly: false,
    });
    q = f.s.quizAction({
      id: q.id,
      revision: q.revision,
      action: "unanswered",
    });
    q = f.s.quizAction({ id: q.id, revision: q.revision, action: "next" });
    const data = f.s.exportData();
    f.s.restoreData(data);
    expect(f.s.quiz(q.id)).toEqual(q);
    expect(
      f.s.quizAction({ id: q.id, revision: q.revision, action: "undo" })
        .completedAt,
    ).toBeNull();
    expect(() =>
      f.s.restoreData({ ...data, quizzes: [{ ...q, index: 500 }] }),
    ).toThrow();
  });
});
