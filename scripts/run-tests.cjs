const { spawnSync } = require("node:child_process");
const path = require("node:path");
const electron = require("electron");
// Run SQLite tests with the same Node ABI as the packaged Electron application.
const result = spawnSync(
  electron,
  [path.resolve(__dirname, "../node_modules/vitest/vitest.mjs"), "run"],
  {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
