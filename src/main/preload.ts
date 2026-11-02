import { contextBridge, ipcRenderer } from "electron";
import type { TrainerAPI } from "../shared/types";
const call = (name: string, value?: unknown) =>
  ipcRenderer.invoke(`trainer:${name}`, value);
const api: TrainerAPI = {
  bootstrap: () => call("bootstrap"),
  settings: (p) => call("settings", p),
  queue: (t) => call("queue", t),
  review: (r) => call("review", r),
  undo: () => call("undo"),
  suspend: (s) => call("suspend", s),
  bank: (q) => call("bank", q),
  progress: () => call("progress"),
  saveTeam: (t) => call("saveTeam", t),
  quizzes: () => call("quizzes"),
  createQuiz: (q) => call("createQuiz", q),
  quiz: (id) => call("quiz", id),
  quizAction: (a) => call("quizAction", a),
  exportBackup: () => call("exportBackup"),
  restoreBackup: () => call("restoreBackup"),
  imageUrl: (relative) =>
    `petrobowl-media://asset/${relative.split("/").map(encodeURIComponent).join("/")}`,
  openSource: (url) => call("openSource", url),
};
contextBridge.exposeInMainWorld("trainer", api);
