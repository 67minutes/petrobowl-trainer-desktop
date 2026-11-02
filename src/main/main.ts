import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { TrainerService } from "./service";
import { ZodError } from "zod";

function readableError(error: unknown): Error {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const messages: Record<string, string> = {
      newPerDay: "Choose a whole number of new facts between 0 and 200.",
      retention: "Choose desired retention between 80% and 97%.",
      count: "Choose a question count between 1 and 500.",
      name: "Enter a name of a suitable length.",
      members: "Enter 1–20 unique member names.",
      selectedTopics: "Choose valid topics.",
    };
    return new Error(
      messages[field] ??
        (issue?.code === "custom"
          ? issue.message
          : "The supplied data is invalid. Check your entries and try again."),
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

app.setName("PetroBowl Trainer");
if (process.argv.includes("--petrobowl-headless")) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "petrobowl-media",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let service: TrainerService;
let window: BrowserWindow;
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(() => {
      const contentDir = app.isPackaged
        ? path.join(process.resourcesPath, "content")
        : path.join(app.getAppPath(), "content");
      const dataDir = process.env.PETROBOWL_DATA_DIR || app.getPath("userData");
      service = new TrainerService(dataDir, contentDir);
      protocol.handle("petrobowl-media", (request) => {
        const url = new URL(request.url);
        const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
        const mediaRoot = path.resolve(contentDir, "media");
        const target = path.resolve(mediaRoot, relative);
        if (
          url.hostname !== "asset" ||
          !target.startsWith(mediaRoot + path.sep) ||
          !/\.(svg|png|jpg|jpeg|webp)$/i.test(target)
        )
          return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(target).href);
      });
      // The renderer only loads bundled resources. Source links open explicitly in the user's browser.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel: !/^(file:|petrobowl-media:|devtools:)/.test(details.url),
        }),
      );
      window = new BrowserWindow({
        width: 1320,
        height: 920,
        minWidth: 800,
        minHeight: 650,
        backgroundColor: "#f7f8f8",
        show: !process.argv.includes("--petrobowl-headless"),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: !process.argv.includes("--petrobowl-headless"),
          offscreen: process.argv.includes("--petrobowl-headless"),
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      const methods = [
        "bootstrap",
        "settings",
        "queue",
        "review",
        "undo",
        "suspend",
        "bank",
        "progress",
        "saveTeam",
        "quizzes",
        "createQuiz",
        "quiz",
        "quizAction",
      ] as const;
      for (const method of methods)
        ipcMain.handle(`trainer:${method}`, (event, arg) => {
          if (
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame
          )
            throw new Error("Invalid caller");
          if (
            method === "queue" &&
            arg !== undefined &&
            (!Array.isArray(arg) || arg.some((x) => typeof x !== "string"))
          )
            throw new Error("Invalid topics");
          try {
            return (service[method] as (arg?: unknown) => unknown).call(
              service,
              arg,
            );
          } catch (error) {
            throw readableError(error);
          }
        });
      ipcMain.handle("trainer:openSource", async (event, url) => {
        if (
          event.sender !== window.webContents ||
          typeof url !== "string" ||
          !/^https:\/\//i.test(url)
        )
          throw new Error("Invalid source");
        await shell.openExternal(new URL(url).href);
      });
      ipcMain.handle("trainer:exportBackup", async () => {
        const result = await dialog.showSaveDialog(window, {
          title: "Export learner backup",
          defaultPath: `PetroBowl-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: "PetroBowl backup", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return null;
        writeFileSync(
          result.filePath,
          JSON.stringify(service.exportData(), null, 2),
        );
        return result.filePath;
      });
      ipcMain.handle("trainer:restoreBackup", async () => {
        const result = await dialog.showOpenDialog(window, {
          title: "Restore learner backup",
          filters: [{ name: "PetroBowl backup", extensions: ["json"] }],
          properties: ["openFile"],
        });
        if (result.canceled) return false;
        const confirm = await dialog.showMessageBox(window, {
          type: "question",
          buttons: ["Cancel", "Restore backup"],
          defaultId: 0,
          cancelId: 0,
          title: "Replace local history?",
          message: "Restore this backup?",
          detail:
            "Your current history will be saved automatically before replacement. The packaged question bank stays installed.",
        });
        if (confirm.response !== 1) return false;
        try{service.restoreData(JSON.parse(readFileSync(result.filePaths[0], "utf8")));}catch{throw new Error('This backup could not be restored. Check that it is a valid backup from a compatible app version. Your current history was kept.');}
        return true;
      });
      return window.loadFile(path.join(__dirname, "../renderer/index.html"));
    })
    .catch((error) => {
      dialog.showErrorBox(
        "PetroBowl Trainer could not start",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => service?.close());
}
