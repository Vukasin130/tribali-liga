const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const logDir = path.join(root, ".codex-run-logs");
fs.mkdirSync(logDir, { recursive: true });

function isUp(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1200 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function start(name, file, args, cwd) {
  const out = fs.openSync(path.join(logDir, `${name}.out.log`), "a");
  const err = fs.openSync(path.join(logDir, `${name}.err.log`), "a");
  const child = spawn(file, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

(async () => {
  const result = {};
  if (!(await isUp("http://127.0.0.1:8787/health"))) {
    result.apiPid = start("api-detached", "node.exe", ["src/server.mjs"], path.join(root, "apps", "api"));
  }
  if (!(await isUp("http://127.0.0.1:5173"))) {
    result.adminPid = start("admin-detached", "node.exe", ["serve-dist.mjs"], path.join(root, "apps", "admin"));
  }

  console.log(JSON.stringify(result));
})();
