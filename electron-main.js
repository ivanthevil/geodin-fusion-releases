const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const bundledRoot = __dirname;

function parts(version) {
  return String(version || "0").split(".").map(x => Number.parseInt(x, 10) || 0);
}
function newer(left, right) {
  const a = parts(left), b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}
function activeRuntime() {
  try {
    const statePath = path.join(app.getPath("userData"), "fusion-runtime.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const runtimeMain = path.join(state.root, "runtime-main.js");
    if (newer(state.version, app.getVersion()) && fs.existsSync(runtimeMain)) {
      return { root: state.root, version: state.version };
    }
  } catch {}
  return { root: bundledRoot, version: app.getVersion() };
}

app.whenReady().then(() => {
  const active = activeRuntime();
  try {
    const runtime = require(path.join(active.root, "runtime-main.js"));
    runtime.start({ app, bundledRoot, runtimeRoot: active.root, runtimeVersion: active.version });
  } catch (error) {
    if (active.root === bundledRoot) throw error;
    try { fs.unlinkSync(path.join(app.getPath("userData"), "fusion-runtime.json")); } catch {}
    const fallback = require(path.join(bundledRoot, "runtime-main.js"));
    fallback.start({ app, bundledRoot, runtimeRoot: bundledRoot, runtimeVersion: app.getVersion() });
  }
});
