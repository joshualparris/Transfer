const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const build = spawnSync(
  process.execPath,
  [npmCli, "explore", "better-sqlite3", "--", "npm", "run", "build-release"],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (build.error) throw build.error;

const deadline = Date.now() + 120_000;
let lastError;
while (Date.now() < deadline) {
  try {
    const Database = require("better-sqlite3");
    const probe = new Database(":memory:");
    probe.prepare("SELECT 1").get();
    probe.close();
    process.exit(0);
  } catch (error) {
    lastError = error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
}
throw new Error(`Native SQLite preparation timed out: ${lastError?.message ?? lastError}`);
