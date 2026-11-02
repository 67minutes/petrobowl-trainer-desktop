export type RatingName = "again" | "hard" | "good" | "easy";
export type Fact = {
  id: string;
  answer: string;
  acceptedAnswers: string[];
  topics: string[];
  learn: string;
  quiz: string;
  explanation: string;
  sources: { url: string; title: string; accessed?: string }[];
  originalIds: string[];
  image: string | null;
  caption: string;
  alt: string;
  editorial: { status: "reviewed" | "pending"; notes: string[] };
  collection: "base" | "history" | "defining" | "energy";
  diagram?: { kind: "flow" | "timeline"; nodes: string[]; caption: string };
};
export type Manifest = {
  version: string;
  builtAt: string;
  factCount: number;
  workbookCount: number;
  expansion: Record<string, number>;
  releaseReady: boolean;
  blockers: string[];
  bankSha256: string;
};
export type Settings = {
  newPerDay: number;
  retention: number;
  selectedTopics: string[];
  onboarded: boolean;
};
export type ReviewCard = Fact & {
  revision: number;
  state: "New" | "Learning" | "Review" | "Relearning";
  previews: Record<RatingName, { due: string; label: string }>;
  scheduledAt: string;
};
export type Queue = {
  card: ReviewCard | null;
  due: number;
  newAvailable: number;
  learning: number;
  nextLearning: string | null;
  studied: number;
  total: number;
  reviewedToday: number;
  suspended: number;
  canUndo: boolean;
};
export type Team = { id: string; name: string; members: string[] };
export type Attempt = { player: string; correct: boolean };
export type QuizQuestion = { fact: Fact; attempts: Attempt[]; closed: boolean };
export type Quiz = {
  id: string;
  name: string;
  team: Team;
  startedAt: string;
  completedAt: string | null;
  questions: QuizQuestion[];
  index: number;
  revision: number;
};
export type QuizSummary = {
  id: string;
  name: string;
  team: string;
  startedAt: string;
  completedAt: string | null;
  count: number;
  correct: number;
};
export type Progress = {
  points: { day: string; accuracy: number | null; count: number }[];
  coverage: { topic: string; studied: number; total: number; due: number }[];
  priorities: { topic: string; reason: string; due: number }[];
  studied: number;
  total: number;
};
export type BankPage = {
  facts: (Fact & { suspended: boolean; studied: boolean })[];
  total: number;
};
export type Bootstrap = {
  settings: Settings;
  manifest: Manifest;
  topics: { name: string; count: number }[];
  teams: Team[];
  activeQuiz: string | null;
};
export interface TrainerAPI {
  bootstrap(): Promise<Bootstrap>;
  settings(patch: Partial<Settings>): Promise<Settings>;
  queue(topics?: string[]): Promise<Queue>;
  review(input: {
    factId: string;
    rating: RatingName;
    revision: number;
    operationId: string;
    scheduledAt: string;
  }): Promise<Queue>;
  undo(): Promise<Queue>;
  suspend(input: { factId: string; suspended: boolean }): Promise<void>;
  bank(input: {
    query?: string;
    topic?: string;
    page?: number;
    suspendedOnly?: boolean;
  }): Promise<BankPage>;
  progress(): Promise<Progress>;
  saveTeam(input: Team): Promise<Team>;
  quizzes(): Promise<QuizSummary[]>;
  createQuiz(input: {
    name: string;
    teamId: string;
    count: number;
    topics: string[];
    studiedOnly: boolean;
  }): Promise<Quiz>;
  quiz(id: string): Promise<Quiz>;
  quizAction(input: {
    id: string;
    action: "correct" | "wrong" | "unanswered" | "next" | "undo";
    player?: string;
    revision: number;
  }): Promise<Quiz>;
  exportBackup(): Promise<string | null>;
  restoreBackup(): Promise<boolean>;
  imageUrl(relative: string): string;
  openSource(url: string): Promise<void>;
}
declare global {
  interface Window {
    trainer: TrainerAPI;
  }
}
