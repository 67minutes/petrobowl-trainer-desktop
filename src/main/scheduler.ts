import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type { RatingName } from "../shared/types";
export const ratings: Record<RatingName, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};
export function scheduler(retention = 0.9) {
  return fsrs({
    request_retention: retention,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
    enable_fuzz: false,
    maximum_interval: 3650,
  });
}
export function decodeCard(raw: string | null, now: Date): Card {
  if (!raw) return createEmptyCard(now);
  const c = JSON.parse(raw);
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  };
}
export function studyDay(date: Date): string {
  const d = new Date(date);
  d.setHours(d.getHours() - 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function intervalLabel(due: Date, now: Date) {
  const seconds = Math.max(0, (due.getTime() - now.getTime()) / 1000);
  if (seconds < 60) return "<1 min";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  const days = Math.round(seconds / 86400);
  return days < 365
    ? `${days} day${days === 1 ? "" : "s"}`
    : `${(days / 365).toFixed(1)} yr`;
}
export { State, createEmptyCard };
