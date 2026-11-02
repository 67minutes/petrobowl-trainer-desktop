import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  decodeCard,
  intervalLabel,
  ratings,
  scheduler,
  State,
  studyDay,
} from "./scheduler";
import type {
  BankPage,
  Bootstrap,
  Fact,
  Manifest,
  Progress,
  Queue,
  Quiz,
  QuizSummary,
  RatingName,
  ReviewCard,
  Settings,
  Team,
} from "../shared/types";

const settingsSchema = z.object({
  newPerDay: z.number().int().min(0).max(200),
  retention: z.number().min(0.8).max(0.97),
  selectedTopics: z.array(z.string()).max(100),
  onboarded: z.boolean(),
});
const teamSchema = z
  .object({
    id: z.string().max(100),
    name: z.string().trim().min(1).max(100),
    members: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  })
  .refine(
    (t) =>
      new Set(t.members.map((x) => x.toLowerCase())).size === t.members.length,
    "Member names must be unique",
  );
const sourceSchema = z.object({
  url: z
    .url()
    .refine((u) => new URL(u).protocol === "https:", "Sources must use HTTPS"),
  title: z.string(),
  accessed: z.string().optional(),
});
export const factSchema = z.object({
  id: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  topics: z.array(z.string().min(1)).min(1),
  learn: z.string().min(1),
  quiz: z.string().min(1),
  explanation: z.string(),
  sources: z.array(sourceSchema).min(1),
  originalIds: z.array(z.string()),
  image: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+\.(svg|png|jpg|jpeg|webp)$/)
    .nullable(),
  caption: z.string(),
  alt: z.string(),
  editorial: z.object({
    status: z.enum(["reviewed", "pending"]),
    notes: z.array(z.string()),
  }),
  collection: z.enum(["base", "history", "defining", "energy"]),
});
const cardSchema = z.object({
  due: z.iso.datetime(),
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  elapsed_days: z.number().finite().nonnegative(),
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: z.iso.datetime().optional(),
});
const quizSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    team: teamSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    questions: z
      .array(
        z.object({
          fact: factSchema,
          attempts: z.array(
            z.object({ player: z.string(), correct: z.boolean() }),
          ),
          closed: z.boolean(),
        }),
      )
      .min(1)
      .max(500),
    index: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
  })
  .refine(
    (q) =>
      q.index < q.questions.length &&
      q.questions.every(
        (x, i) =>
          x.attempts.every((a) => q.team.members.includes(a.player)) &&
          new Set(x.attempts.map((a) => a.player)).size === x.attempts.length &&
          x.attempts.filter((a) => a.correct).length <= 1 &&
          (!x.attempts.some((a) => a.correct) ||
            (x.closed && x.attempts.at(-1)?.correct)) &&
          (i >= q.index || x.closed) &&
          (i <= q.index || (!x.closed && x.attempts.length === 0)),
      ) &&
      (!q.completedAt ||
        (q.index === q.questions.length - 1 &&
          q.questions.every((x) => x.closed))),
    "Invalid quiz state",
  );
type CardRow = {
  id: string;
  state: string;
  suspended: number;
  revision: number;
};
type ReviewRow = {
  seq: number;
  operation_id: string;
  fact_id: string;
  at: string;
  day: string;
  kind: string;
  rating: string;
  before_state: string | null;
  after_state: string;
  undone: number;
};
const cardRowSchema = z.object({
  id: z.string(),
  state: z.string().refine((s) => {
    try {
      return cardSchema.safeParse(JSON.parse(s)).success;
    } catch {
      return false;
    }
  }),
  suspended: z.union([z.literal(0), z.literal(1)]),
  revision: z.number().int().nonnegative(),
});
const reviewRowSchema = z.object({
  seq: z.number().int().positive(),
  operation_id: z.string(),
  fact_id: z.string(),
  at: z.iso.datetime(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["new", "learning", "review"]),
  rating: z.enum(["again", "hard", "good", "easy"]),
  before_state: z.string().nullable(),
  after_state: z.string(),
  undone: z.union([z.literal(0), z.literal(1)]),
});
const backupSchema = z.object({
  format: z.literal("petrobowl-local"),
  schema: z.literal(1),
  bankVersion: z.string(),
  exportedAt: z.iso.datetime(),
  settings: settingsSchema,
  cards: z.array(cardRowSchema),
  reviews: z.array(reviewRowSchema),
  teams: z.array(teamSchema),
  quizzes: z.array(quizSchema),
  quizUndo: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        quiz_id: z.string(),
        value: z.string().refine((s) => {
          try {
            return quizSchema.safeParse(JSON.parse(s)).success;
          } catch {
            return false;
          }
        }),
      }),
    )
    .default([]),
});

export class TrainerService {
  readonly db: Database.Database;
  readonly facts: Fact[];
  readonly byId: Map<string, Fact>;
  readonly manifest: Manifest;
  constructor(
    readonly dataDir: string,
    readonly contentDir: string,
    readonly clock = () => new Date(),
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.facts = JSON.parse(
      readFileSync(path.join(contentDir, "bank.json"), "utf8"),
    );
    this.byId = new Map(this.facts.map((f) => [f.id, f]));
    this.manifest = JSON.parse(
      readFileSync(path.join(contentDir, "manifest.json"), "utf8"),
    );
    const dbPath = path.join(dataDir, "learner.sqlite");
    if (existsSync(dbPath)) {
      const existing = new Database(dbPath);
      const version = existing.pragma("user_version", {
        simple: true,
      }) as number;
      if (version > 1) {
        existing.close();
        throw new Error(
          "This data was created by a newer PetroBowl Trainer. Install the latest version.",
        );
      }
      if (version < 1) {
        mkdirSync(path.join(dataDir, "backups"), { recursive: true });
        awaitlessBackup(
          existing,
          path.join(dataDir, "backups", `before-schema-1-${Date.now()}.sqlite`),
        );
      }
      existing.close();
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, state TEXT NOT NULL, suspended INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reviews (seq INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL, fact_id TEXT NOT NULL, at TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, rating TEXT NOT NULL, before_state TEXT, after_state TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS reviews_day ON reviews(day,kind);
      CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quiz_undo (seq INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id TEXT NOT NULL, value TEXT NOT NULL);
      PRAGMA user_version = 1;`);
  }
  close() {
    this.db.close();
  }
  private get<T>(key: string, fallback: T): T {
    const r = this.db.prepare("SELECT value FROM kv WHERE key=?").get(key) as
      | { value: string }
      | undefined;
    return r ? JSON.parse(r.value) : fallback;
  }
  private put(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  getSettings(): Settings {
    return this.get("settings", {
      newPerDay: 20,
      retention: 0.9,
      selectedTopics: [],
      onboarded: false,
    });
  }
  settings(patch: Partial<Settings>): Settings {
    const next = settingsSchema.parse({ ...this.getSettings(), ...patch });
    const valid = new Set(this.facts.flatMap((f) => f.topics));
    if (next.selectedTopics.some((t) => !valid.has(t)))
      throw new Error("Unknown topic");
    this.put("settings", next);
    return next;
  }
  bootstrap(): Bootstrap {
    const counts = new Map<string, number>();
    this.facts.forEach((f) =>
      f.topics.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)),
    );
    return {
      settings: this.getSettings(),
      manifest: this.manifest,
      topics: [...counts]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
      teams: this.teams(),
      activeQuiz: this.quizzes().find((q) => !q.completedAt)?.id ?? null,
    };
  }
  private cardRows() {
    return this.db.prepare("SELECT * FROM cards").all() as CardRow[];
  }
  queue(topics = this.getSettings().selectedTopics): Queue {
    const now = this.clock(),
      settings = this.getSettings();
    const states = new Map(this.cardRows().map((r) => [r.id, r]));
    const selected = new Set(topics);
    const scoped = this.facts.filter(
      (f) => !selected.size || f.topics.some((t) => selected.has(t)),
    );
    const entries = scoped
      .filter((f) => !states.get(f.id)?.suspended)
      .map((f) => {
        const row = states.get(f.id);
        return { fact: f, row, card: decodeCard(row?.state ?? null, now) };
      });
    const learning = entries
      .filter(
        (e) =>
          e.card.state === State.Learning || e.card.state === State.Relearning,
      )
      .sort((a, b) => +a.card.due - +b.card.due);
    const reviews = entries
      .filter((e) => e.card.state === State.Review && e.card.due <= now)
      .sort((a, b) => +a.card.due - +b.card.due);
    const introduced = this.db
      .prepare(
        "SELECT COUNT(DISTINCT fact_id) AS n FROM reviews WHERE day=? AND kind='new' AND undone=0",
      )
      .get(studyDay(now)) as { n: number };
    const unseen = entries.filter((e) => !e.card.reps);
    const available = Math.min(
      unseen.length,
      Math.max(0, settings.newPerDay - introduced.n),
    );
    const next =
      learning.find((e) => e.card.due <= now) ??
      reviews[0] ??
      (available ? unseen[0] : undefined);
    const fsrs = scheduler(settings.retention);
    const card: Queue["card"] = next
      ? {
          ...next.fact,
          revision: next.row?.revision ?? 0,
          state: State[next.card.state] as ReviewCard["state"],
          scheduledAt: now.toISOString(),
          previews: Object.fromEntries(
            Object.entries(ratings).map(([key, rating]) => {
              const result = fsrs.next(
                next.card,
                now,
                rating as Exclude<typeof rating, 0>,
              );
              return [
                key,
                {
                  due: result.card.due.toISOString(),
                  label: intervalLabel(result.card.due, now),
                },
              ];
            }),
          ) as NonNullable<Queue["card"]>["previews"],
        }
      : null;
    const today = this.db
      .prepare("SELECT COUNT(*) AS n FROM reviews WHERE day=? AND undone=0")
      .get(studyDay(now)) as { n: number };
    return {
      card,
      due: reviews.length,
      learning: learning.filter((e) => e.card.due <= now).length,
      nextLearning:
        learning.find((e) => e.card.due > now)?.card.due.toISOString() ?? null,
      newAvailable: available,
      studied: scoped.filter((f) => {
        const s = states.get(f.id);
        return s && decodeCard(s.state, now).reps > 0;
      }).length,
      total: scoped.length,
      reviewedToday: today.n,
      suspended: scoped.filter((f) => states.get(f.id)?.suspended).length,
      canUndo: !!this.db
        .prepare("SELECT 1 FROM reviews WHERE undone=0 LIMIT 1")
        .get(),
    };
  }
  review(raw: {
    factId: string;
    rating: RatingName;
    revision: number;
    operationId: string;
    scheduledAt: string;
  }): Queue {
    const input = z
      .object({
        factId: z.string(),
        rating: z.enum(["again", "hard", "good", "easy"]),
        revision: z.number().int().nonnegative(),
        operationId: z.uuid(),
        scheduledAt: z.iso.datetime(),
      })
      .parse(raw);
    this.db.transaction(() => {
      if (
        this.db
          .prepare("SELECT 1 FROM reviews WHERE operation_id=?")
          .get(input.operationId)
      )
        return;
      if (!this.byId.has(input.factId))
        throw new Error(
          "This fact is no longer in the bank. Refresh the study queue.",
        );
      const row = this.db
        .prepare("SELECT * FROM cards WHERE id=?")
        .get(input.factId) as CardRow | undefined;
      if ((row?.revision ?? 0) !== input.revision || row?.suspended)
        throw new Error("This card changed. Refresh before rating it again.");
      const now = this.clock();
      const before = decodeCard(row?.state ?? null, now);
      if (before.reps && before.due > now)
        throw new Error("This card is not due. Use extra practice instead.");
      const presented = new Date(input.scheduledAt);
      if (presented > now || now.getTime() - presented.getTime() > 3600_000)
        throw new Error("This review preview expired. Refresh the card.");
      const kind =
        before.reps === 0
          ? "new"
          : before.state === State.Review
            ? "review"
            : "learning";
      if (kind === "new") {
        const n = (
          this.db
            .prepare(
              "SELECT COUNT(DISTINCT fact_id) AS n FROM reviews WHERE day=? AND kind='new' AND undone=0",
            )
            .get(studyDay(now)) as { n: number }
        ).n;
        if (n >= this.getSettings().newPerDay)
          throw new Error("Daily new-card limit reached.");
      }
      // Use the preview timestamp so the displayed scheduling choice is the one saved.
      const result = scheduler(this.getSettings().retention).next(
        before,
        presented,
        ratings[input.rating] as 1 | 2 | 3 | 4,
      );
      if (result.card.due <= now)
        result.card.due = new Date(
          now.getTime() + Math.max(60_000, +result.card.due - +presented),
        );
      const state = JSON.stringify(result.card);
      this.db
        .prepare(
          "INSERT INTO reviews(operation_id,fact_id,at,day,kind,rating,before_state,after_state) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          input.operationId,
          input.factId,
          now.toISOString(),
          studyDay(now),
          kind,
          input.rating,
          row?.state ?? null,
          state,
        );
      this.db
        .prepare(
          "INSERT OR REPLACE INTO cards(id,state,suspended,revision) VALUES (?,?,0,?)",
        )
        .run(input.factId, state, (row?.revision ?? 0) + 1);
    })();
    return this.queue();
  }
  undo(): Queue {
    this.db.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT * FROM reviews WHERE undone=0 ORDER BY seq DESC LIMIT 1",
        )
        .get() as ReviewRow | undefined;
      if (!row) return;
      const current = this.db
        .prepare("SELECT * FROM cards WHERE id=?")
        .get(row.fact_id) as CardRow;
      const state =
        row.before_state ?? JSON.stringify(decodeCard(null, this.clock()));
      this.db
        .prepare("UPDATE cards SET state=?, revision=? WHERE id=?")
        .run(state, current.revision + 1, row.fact_id);
      this.db.prepare("UPDATE reviews SET undone=1 WHERE seq=?").run(row.seq);
    })();
    return this.queue();
  }
  suspend(input: { factId: string; suspended: boolean }) {
    z.object({ factId: z.string(), suspended: z.boolean() }).parse(input);
    if (!this.byId.has(input.factId)) throw new Error("Unknown fact");
    const r = this.db
      .prepare("SELECT * FROM cards WHERE id=?")
      .get(input.factId) as CardRow | undefined;
    this.db
      .prepare("INSERT OR REPLACE INTO cards VALUES (?,?,?,?)")
      .run(
        input.factId,
        r?.state ?? JSON.stringify(decodeCard(null, this.clock())),
        input.suspended ? 1 : 0,
        (r?.revision ?? 0) + 1,
      );
  }
  bank(input: {
    query?: string;
    topic?: string;
    page?: number;
    suspendedOnly?: boolean;
  }): BankPage {
    const safe = z
      .object({
        query: z.string().max(300).optional(),
        topic: z.string().optional(),
        page: z.number().int().min(0).optional(),
        suspendedOnly: z.boolean().optional(),
      })
      .parse(input);
    const q = safe.query?.trim().toLowerCase() ?? "";
    const states = new Map(this.cardRows().map((r) => [r.id, r]));
    const found = this.facts.filter(
      (f) =>
        (!safe.topic || f.topics.includes(safe.topic)) &&
        (!safe.suspendedOnly || states.get(f.id)?.suspended) &&
        (!q ||
          [f.answer, ...f.acceptedAnswers, f.learn, ...f.topics]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    return {
      total: found.length,
      facts: found
        .slice((safe.page ?? 0) * 30, ((safe.page ?? 0) + 1) * 30)
        .map((f) => ({
          ...f,
          suspended: !!states.get(f.id)?.suspended,
          studied: !!decodeCard(states.get(f.id)?.state ?? null, this.clock())
            .reps,
        })),
    };
  }
  progress(): Progress {
    const now = this.clock();
    const active = new Set(this.byId.keys());
    const states = new Map(this.cardRows().map((r) => [r.id, r]));
    const first = this.db
      .prepare(
        "SELECT fact_id, day, rating FROM reviews WHERE seq IN (SELECT MIN(seq) FROM reviews WHERE kind='review' AND undone=0 GROUP BY fact_id,day)",
      )
      .all() as { fact_id: string; day: string; rating: string }[];
    const points = Array.from({ length: 28 }, (_, i) => {
      const end = new Date(now);
      end.setDate(end.getDate() - (27 - i));
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const day = studyDay(end);
      const low = studyDay(start);
      const rows = first.filter(
        (r) => active.has(r.fact_id) && r.day >= low && r.day <= day,
      );
      return {
        day,
        accuracy: rows.length
          ? rows.filter((r) => r.rating !== "again").length / rows.length
          : null,
        count: rows.length,
      };
    });
    const topics = this.bootstrap().topics;
    const coverage = topics.map((t) => {
      const facts = this.facts.filter((f) => f.topics.includes(t.name));
      return {
        topic: t.name,
        total: facts.length,
        studied: facts.filter(
          (f) => decodeCard(states.get(f.id)?.state ?? null, now).reps > 0,
        ).length,
        due: facts.filter((f) => {
          const r = states.get(f.id);
          const c = decodeCard(r?.state ?? null, now);
          return !r?.suspended && c.reps && c.due <= now;
        }).length,
      };
    });
    const priorities = coverage
      .filter((t) => t.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 3)
      .map((t) => ({
        topic: t.topic,
        reason: `${t.due} scheduled reviews are due`,
        due: t.due,
      }));
    return {
      points,
      coverage,
      priorities,
      studied: this.facts.filter(
        (f) => decodeCard(states.get(f.id)?.state ?? null, now).reps > 0,
      ).length,
      total: this.facts.length,
    };
  }
  teams(): Team[] {
    return (
      this.db.prepare("SELECT value FROM teams ORDER BY rowid").all() as {
        value: string;
      }[]
    ).map((r) => JSON.parse(r.value));
  }
  saveTeam(raw: Team): Team {
    const team = teamSchema.parse({ ...raw, id: raw.id || randomUUID() });
    this.db
      .prepare("INSERT OR REPLACE INTO teams VALUES (?,?)")
      .run(team.id, JSON.stringify(team));
    return team;
  }
  quizzes(): QuizSummary[] {
    return (
      this.db
        .prepare("SELECT value FROM quizzes ORDER BY rowid DESC")
        .all() as { value: string }[]
    ).map((r) => {
      const q: Quiz = JSON.parse(r.value);
      return {
        id: q.id,
        name: q.name,
        team: q.team.name,
        startedAt: q.startedAt,
        completedAt: q.completedAt,
        count: q.questions.length,
        correct: q.questions.filter((x) => x.attempts.some((a) => a.correct))
          .length,
      };
    });
  }
  quiz(id: string): Quiz {
    const row = this.db
      .prepare("SELECT value FROM quizzes WHERE id=?")
      .get(z.string().parse(id)) as { value: string } | undefined;
    if (!row) throw new Error("Quiz not found");
    return JSON.parse(row.value);
  }
  createQuiz(raw: {
    name: string;
    teamId: string;
    count: number;
    topics: string[];
    studiedOnly: boolean;
  }): Quiz {
    const input = z
      .object({
        name: z.string().trim().min(1).max(120),
        teamId: z.string(),
        count: z.number().int().min(1).max(500),
        topics: z.array(z.string()),
        studiedOnly: z.boolean(),
      })
      .parse(raw);
    const team = this.teams().find((t) => t.id === input.teamId);
    if (!team) throw new Error("Choose a team first");
    const states = new Map(this.cardRows().map((r) => [r.id, r]));
    const chosen = new Set(input.topics);
    const pool = this.facts.filter(
      (f) =>
        (!chosen.size || f.topics.some((t) => chosen.has(t))) &&
        (!input.studiedOnly ||
          decodeCard(states.get(f.id)?.state ?? null, this.clock()).reps > 0),
    );
    if (pool.length < input.count)
      throw new Error(
        `Only ${pool.length} unique facts are available for these settings. Reduce the question count or widen the pool.`,
      );
    const groups = new Map<string, Fact[]>();
    const selectedCount = new Map<string, number>();
    for (const f of shuffled(pool)) {
      const tags = chosen.size
        ? f.topics.filter((t) => chosen.has(t))
        : f.topics;
      const topic = [...tags].sort(
        (a, b) => (selectedCount.get(a) ?? 0) - (selectedCount.get(b) ?? 0),
      )[0];
      const group = groups.get(topic) ?? [];
      group.push(f);
      groups.set(topic, group);
      selectedCount.set(topic, (selectedCount.get(topic) ?? 0) + 1);
    }
    const questions: Quiz["questions"] = [];
    const buckets = shuffled([...groups.values()]);
    while (questions.length < input.count)
      for (const group of buckets) {
        if (questions.length === input.count) break;
        const fact = group.pop();
        if (fact) questions.push({ fact, attempts: [], closed: false });
      }
    const quiz: Quiz = {
      id: randomUUID(),
      name: input.name,
      team: structuredClone(team),
      startedAt: this.clock().toISOString(),
      completedAt: null,
      questions,
      index: 0,
      revision: 0,
    };
    this.db
      .prepare("INSERT INTO quizzes VALUES (?,?)")
      .run(quiz.id, JSON.stringify(quiz));
    return quiz;
  }
  quizAction(raw: {
    id: string;
    action: "correct" | "wrong" | "unanswered" | "next" | "undo";
    player?: string;
    revision: number;
  }): Quiz {
    const input = z
      .object({
        id: z.string(),
        action: z.enum(["correct", "wrong", "unanswered", "next", "undo"]),
        player: z.string().optional(),
        revision: z.number().int().nonnegative(),
      })
      .parse(raw);
    return this.db.transaction(() => {
      const quiz = this.quiz(input.id);
      if (quiz.revision !== input.revision)
        throw new Error("Quiz changed. Reload it before scoring again.");
      if (input.action === "undo") {
        const prev = this.db
          .prepare(
            "SELECT seq,value FROM quiz_undo WHERE quiz_id=? ORDER BY seq DESC LIMIT 1",
          )
          .get(quiz.id) as { seq: number; value: string } | undefined;
        if (!prev) return quiz;
        const old = JSON.parse(prev.value) as Quiz;
        old.revision = quiz.revision + 1;
        this.db
          .prepare("UPDATE quizzes SET value=? WHERE id=?")
          .run(JSON.stringify(old), quiz.id);
        this.db.prepare("DELETE FROM quiz_undo WHERE seq=?").run(prev.seq);
        return old;
      }
      if (quiz.completedAt)
        throw new Error(
          "This quiz is complete. Undo to correct the last result.",
        );
      const current = quiz.questions[quiz.index];
      const before = JSON.stringify(quiz);
      if (input.action === "next") {
        if (!current.closed)
          throw new Error("Record a correct answer or mark unanswered first.");
        if (quiz.index < quiz.questions.length - 1) quiz.index++;
        else quiz.completedAt = this.clock().toISOString();
      } else {
        if (current.closed)
          throw new Error("This question is closed. Undo to correct it.");
        if (input.action === "unanswered") current.closed = true;
        else {
          if (!input.player || !quiz.team.members.includes(input.player))
            throw new Error("Unknown participant");
          if (current.attempts.some((a) => a.player === input.player))
            throw new Error("This member has already attempted this question.");
          current.attempts.push({
            player: input.player,
            correct: input.action === "correct",
          });
          if (input.action === "correct") current.closed = true;
        }
      }
      quiz.revision++;
      this.db
        .prepare("INSERT INTO quiz_undo(quiz_id,value) VALUES (?,?)")
        .run(quiz.id, before);
      this.db
        .prepare("UPDATE quizzes SET value=? WHERE id=?")
        .run(JSON.stringify(quiz), quiz.id);
      return quiz;
    })();
  }
  exportData() {
    return {
      format: "petrobowl-local",
      schema: 1,
      bankVersion: this.manifest.version,
      exportedAt: this.clock().toISOString(),
      settings: this.getSettings(),
      cards: this.cardRows(),
      reviews: this.db.prepare("SELECT * FROM reviews").all(),
      teams: this.teams(),
      quizzes: this.quizzes().map((q) => this.quiz(q.id)),
      quizUndo: this.db.prepare("SELECT * FROM quiz_undo").all(),
    };
  }
  restoreData(raw: unknown) {
    const data = backupSchema.parse(raw);
    const cardIds = new Set(data.cards.map((c) => c.id));
    if (data.reviews.some((r) => !r.undone && !cardIds.has(r.fact_id)))
      throw new Error(
        "Backup is missing card state referenced by active reviews.",
      );
    const quizIds = new Set(data.quizzes.map((q) => q.id));
    if (
      data.quizUndo.some(
        (r) => !quizIds.has(r.quiz_id) || JSON.parse(r.value).id !== r.quiz_id,
      )
    )
      throw new Error("Backup contains inconsistent quiz correction history.");
    for (const group of [
      data.cards.map((c) => c.id),
      data.reviews.map((r) => r.operation_id),
      data.reviews.map((r) => String(r.seq)),
      data.teams.map((t) => t.id),
      data.quizzes.map((q) => q.id),
    ])
      if (new Set(group).size !== group.length)
        throw new Error("Backup contains duplicate records.");
    for (const r of data.reviews) {
      cardSchema.parse(JSON.parse(r.after_state));
      if (r.before_state) cardSchema.parse(JSON.parse(r.before_state));
    }
    mkdirSync(path.join(this.dataDir, "backups"), { recursive: true });
    writeFileSync(
      path.join(this.dataDir, "backups", `before-restore-${Date.now()}.json`),
      JSON.stringify(this.exportData()),
    );
    this.db.transaction(() => {
      this.db.exec(
        "DELETE FROM cards; DELETE FROM reviews; DELETE FROM teams; DELETE FROM quizzes; DELETE FROM quiz_undo;",
      );
      const insertCard = this.db.prepare(
        "INSERT INTO cards VALUES (@id,@state,@suspended,@revision)",
      );
      data.cards.forEach((c) => insertCard.run(c));
      const insertReview = this.db.prepare(
        "INSERT INTO reviews VALUES (@seq,@operation_id,@fact_id,@at,@day,@kind,@rating,@before_state,@after_state,@undone)",
      );
      data.reviews.forEach((r) => insertReview.run(r));
      data.teams.forEach((t) =>
        this.db
          .prepare("INSERT INTO teams VALUES (?,?)")
          .run(t.id, JSON.stringify(t)),
      );
      data.quizzes.forEach((q) =>
        this.db
          .prepare("INSERT INTO quizzes VALUES (?,?)")
          .run(q.id, JSON.stringify(q)),
      );
      data.quizUndo.forEach((q) =>
        this.db
          .prepare("INSERT INTO quiz_undo VALUES (@seq,@quiz_id,@value)")
          .run(q),
      );
      this.put("settings", {
        ...data.settings,
        selectedTopics: data.settings.selectedTopics.filter((t) =>
          this.facts.some((f) => f.topics.includes(t)),
        ),
      });
    })();
  }
}
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function awaitlessBackup(db: Database.Database, target: string) {
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
}
