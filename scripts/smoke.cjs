const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output/playwright");
mkdirSync(output, { recursive: true });
const userDir = path.join(root, "output", `smoke-${Date.now()}`);
const executable = process.argv[2] || require("electron");
const packaged = !!process.argv[2];
let electronApp, page;
const errors = [],
  steps = [];
const shot = async (name) => {
  await page.mouse.move(235, 20);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState === "finished" || a.playState === "idle"),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const image = await w.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return image
      .resize({ width: w.getContentSize()[0] })
      .toPNG()
      .toString("base64");
  });
  writeFileSync(
    path.join(output, `${packaged ? "packaged-" : ""}${name}.png`),
    Buffer.from(base64, "base64"),
  );
};
async function launch() {
  electronApp = await _electron.launch({
    executablePath: executable,
    args: packaged ? ["--petrobowl-headless"] : [root, "--petrobowl-headless"],
    cwd: root,
    env: { ...process.env, PETROBOWL_DATA_DIR: userDir },
  });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.context().setOffline(true);
}
async function click(name) {
  await page
    .getByRole("button", {
      name: name === "Show answer" ? /^Show answer/ : name,
      exact: name !== "Show answer",
    })
    .click();
}
async function waitQueue(n) {
  await page.waitForFunction(
    async (count) => (await window.trainer.queue()).reviewedToday === count,
    n,
  );
}
(async () => {
  try {
    await launch();
    await page.getByRole("button", { name: "Open my workspace" }).waitFor();
    await shot("onboarding");
    await click("Open my workspace");
    await page.getByRole("button", { name: "Start studying" }).waitFor();
    await shot("study");
    steps.push("first launch and onboarding");
    await click("Quizzes");
    await page
      .getByLabel("Team name", { exact: true })
      .fill("Offline practice");
    await page.getByLabel(/Member names/).fill("Ada\nBen");
    await click("Save roster");
    await page
      .getByRole("button", { name: "Create quiz" })
      .waitFor({ state: "visible" });
    await page.getByLabel("Questions", { exact: true }).fill("2");
    await page
      .getByLabel("Team name", { exact: true })
      .fill("Unsaved roster change");
    assert.equal(
      await page
        .getByRole("button", { name: "Create quiz", exact: true })
        .isEnabled(),
      false,
    );
    await page
      .getByLabel("Team name", { exact: true })
      .fill("Offline practice");
    await shot("quiz-setup");
    await click("Create quiz");
    await page.getByText("Quizmaster view. Read the question aloud.").waitFor();
    await click("Show answer");
    await shot("quiz-running");
    await page
      .locator(".member-scoring>div")
      .filter({ hasText: "Ada" })
      .getByRole("button", { name: "Wrong", exact: true })
      .click();
    await page.locator(".attempt-wrong").waitFor();
    await page
      .locator(".member-scoring>div")
      .filter({ hasText: "Ben" })
      .getByRole("button", { name: "Correct", exact: true })
      .click();
    await page.getByRole("button", { name: "Next question" }).waitFor();
    await click("Next question");
    await page.waitForFunction(() =>
      document.querySelector(".card-toolbar")?.textContent?.includes("2 / 2"),
    );
    await click("Mark unanswered");
    await page
      .getByRole("button", { name: "Finish quiz & view report" })
      .waitFor();
    await click("Finish quiz & view report");
    await page
      .getByRole("heading", { name: "Session results", exact: true })
      .waitFor();
    assert.match(await page.locator(".report-accuracy").innerText(), /50/);
    await shot("quiz-report");
    steps.push("wrong, rebound correct, unanswered, 50% report");
    await page
      .getByRole("button", { name: "Practice missed questions" })
      .click();
    await page.getByRole("button", { name: /^Show answer/ }).waitFor();
    await click("Show answer");
    assert.equal(
      await page.evaluate(
        async () => (await window.trainer.queue()).reviewedToday,
      ),
      0,
    );
    await click("Finish practice");
    steps.push("missed practice does not write FSRS");
    await click("Question Bank");
    await page.getByLabel("Search question bank").fill("Pechelbronn");
    await page.getByLabel("Filter by topic").selectOption("Geology");
    await page.getByRole("heading", { name: "No matching facts." }).waitFor();
    await page.getByLabel("Filter by topic").selectOption("");
    await page.getByLabel("Search question bank").fill("Pechelbronn");
    await page.waitForFunction(() =>
      document
        .querySelector(".bank-question")
        ?.textContent?.includes("Pechelbronn"),
    );
    await page.locator(".bank-question").first().click();
    await page.locator(".bank-detail").waitFor();
    await page.locator(".bank-detail img").waitFor();
    await page.waitForFunction(() => {
      const i = document.querySelector(".bank-detail img");
      return i?.complete && i.naturalWidth > 0;
    });
    await shot("bank-answer");
    await page.getByRole("button", { name: /Enlarge image:/ }).click();
    await page.getByRole("dialog").waitFor();
    await shot("image");
    await click("Close image");
    await page.getByRole("button", { name: /Enlarge image:/ }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await electronApp.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        globalThis.__qaOpenedSource = url;
      };
    });
    await page.locator(".bank-detail .sources>summary").click();
    await page.locator(".bank-detail .sources>button").first().click();
    assert.match(
      await electronApp.evaluate(() => globalThis.__qaOpenedSource),
      /^https:\/\//,
    );
    await click("Suspend from study");
    await page
      .getByRole("button", { name: "Resume scheduled study" })
      .waitFor();
    await click("Resume scheduled study");
    await page.getByRole("button", { name: "Suspend from study" }).waitFor();
    await page.getByLabel("Search question bank").fill("");
    await page.waitForFunction(
      () => document.querySelectorAll(".bank-question").length === 30,
    );
    await click("Next");
    await page.waitForFunction(() =>
      document
        .querySelector(".pagination>span")
        ?.textContent?.startsWith("2 /"),
    );
    await click("Previous");
    steps.push("offline bank search, visual enlargement, suspend/resume");
    await click("Guide");
    await page.getByLabel("Search guide").fill("rating");
    await page
      .getByRole("heading", { name: "Choose an honest rating" })
      .waitFor();
    await click("Show demonstration answer");
    await click("Hard");
    assert.match(
      await page.locator(".demo-feedback").innerText(),
      /not changed/,
    );
    await click("Reset demonstration");
    await shot("guide");
    steps.push("searchable guide and isolated demo");
    await click("Settings & backups");
    await page.getByLabel("New facts per day").fill("1");
    await page.getByLabel("Desired retention").fill("91");
    await click("Save study settings");
    await page.getByRole("status").waitFor();
    await shot("settings");
    await click("Study");
    await click("Start studying");
    await click("Show answer");
    await shot("study-answer");
    await page.getByRole("button", { name: /Again Forgotten/ }).click();
    await waitQueue(1);
    await page.getByRole("button", { name: "Undo last review" }).click();
    await waitQueue(0);
    await page.getByRole("button", { name: "Show answer" }).waitFor();
    await page.locator("h1").click();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: /Again Forgotten/ }).waitFor();
    await page.keyboard.press("4");
    await waitQueue(1);
    steps.push("ratings, undo, Space and 4 keyboard controls");
    await click("Progress");
    await page
      .getByRole("heading", { name: "Recall accuracy", exact: true })
      .waitFor();
    await shot("progress");
    assert.match(await page.locator(".coverage-overview").innerText(), /1 of/);
    steps.push("private coverage and no fabricated recall chart");
    const backupPath = path.join(output, "qa-backup.json");
    await electronApp.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, backupPath);
    await click("Settings & backups");
    await click("Export learner backup");
    await page.getByRole("status").waitFor();
    await click("Restore a backup");
    await page.getByText("Backup restored.", { exact: true }).waitFor();
    // Synthetic history exercises the populated chart; it is then removed.
    const originalBackup = readFileSync(backupPath, "utf8");
    const staged = JSON.parse(originalBackup);
    let seq = Math.max(0, ...staged.reviews.map((r) => r.seq));
    const card = staged.cards[0];
    for (let day = 0; day < 14; day++) {
      const at = new Date();
      at.setDate(at.getDate() - day);
      at.setHours(12, 0, 0, 0);
      const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
      staged.reviews.push({
        seq: ++seq,
        operation_id: randomUUID(),
        fact_id: card.id,
        at: at.toISOString(),
        day: date,
        kind: "review",
        rating: day % 4 === 0 ? "again" : "good",
        before_state: card.state,
        after_state: card.state,
        undone: 0,
      });
    }
    writeFileSync(backupPath, JSON.stringify(staged));
    await click("Restore a backup");
    await page.waitForFunction(async () => {
      const p = await window.trainer.progress();
      return p.points.some((x) => x.accuracy !== null);
    });
    await click("Progress");
    await page.locator(".recall-chart").waitFor();
    await shot("progress-populated");
    writeFileSync(backupPath, originalBackup);
    await click("Settings & backups");
    await click("Restore a backup");
    await page.waitForFunction(
      async () => (await window.trainer.queue()).reviewedToday === 1,
    );
    steps.push(
      "populated rolling-recall chart from an explicitly synthetic backup fixture",
    );
    steps.push(
      "backup export and restore through UI with simulated native dialogs",
    );
    await electronApp.close();
    await launch();
    await page
      .getByRole("button", { name: "Start studying" })
      .waitFor({ state: "visible" })
      .catch(() => {});
    assert.equal(
      await page.evaluate(
        async () => (await window.trainer.queue()).reviewedToday,
      ),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "Open my workspace" }).count(),
      0,
    );
    await click("Quizzes");
    await page.locator(".history-row").first().click();
    await page.getByRole("heading", { name: "Session results" }).waitFor();
    steps.push("restart preserves review history, onboarding, and quiz report");
    for (const zoom of [1, 1.25, 1.5]) {
      await electronApp.evaluate(
        ({ BrowserWindow }, z) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(z),
        zoom,
      );
      await click("Guide");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await shot(`guide-zoom-${zoom}`);
    }
    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.webContents.setZoomFactor(1);
      w.setSize(800, 650);
    });
    await click("Study");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await shot("minimum-window");
    steps.push("100%, 125%, 150% zoom and 800x650 minimum window fit");
    assert.deepEqual(errors, []);
    writeFileSync(
      path.join(output, `${packaged ? "packaged-" : ""}smoke-report.json`),
      JSON.stringify(
        { passed: true, offline: true, userDir, steps, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: true, steps, errors }, null, 2));
  } catch (error) {
    if (page)
      try {
        await shot("failure");
        console.error((await page.locator("body").innerText()).slice(-12000));
      } catch {}
    console.error(error);
    console.error({ errors, steps });
    process.exitCode = 1;
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
})();
