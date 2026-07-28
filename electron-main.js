const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const UPDATE_URL = "https://raw.githubusercontent.com/ivanthevil/geodin-fusion-releases/main/update.json";

function runPowerShell(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, script), ...args], {
      windowsHide: true,
      maxBuffer: 100 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const text = String(stdout || "").trim();
      if (error) return reject(new Error(String(stderr || text || error.message).trim()));
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end < start) return reject(new Error("GeoDIN-Ausgabe konnte nicht gelesen werden."));
      try { resolve(JSON.parse(text.slice(start, end + 1))); }
      catch { reject(new Error("GeoDIN-Ausgabe ist ungültig.")); }
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1180, minHeight: 700,
    backgroundColor: "#f0ede7",
    icon: path.join(root, "boden-icon.ico"),
    webPreferences: { preload: path.join(root, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
}

ipcMain.handle("choose-sources", async () => {
  const out = await dialog.showOpenDialog({ title: "Quell-Datenbanken auswählen", properties: ["openFile", "multiSelections"], filters: [{ name: "GeoDIN MDB", extensions: ["mdb"] }] });
  return out.canceled ? [] : out.filePaths;
});
ipcMain.handle("choose-target", async () => {
  const out = await dialog.showOpenDialog({ title: "Master-Datenbank auswählen", properties: ["openFile"], filters: [{ name: "GeoDIN MDB", extensions: ["mdb"] }] });
  return out.canceled ? "" : out.filePaths[0];
});
ipcMain.handle("inspect-db", (_, dbPath) => runPowerShell("geodin-fusion-inspect.ps1", ["-DatabasePath", dbPath]));
ipcMain.handle("merge-databases", async (_, payload) => {
  const requestPath = path.join(os.tmpdir(), `geodin-fusion-${Date.now()}-${process.pid}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(payload), "utf8");
  try { return await runPowerShell("fusion-engine.ps1", ["-RequestPath", requestPath]); }
  finally { try { fs.unlinkSync(requestPath); } catch {} }
});
ipcMain.handle("check-update", async () => {
  const response = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Update-Prüfung fehlgeschlagen (${response.status}).`);
  const data = await response.json();
  return { ...data, currentVersion: app.getVersion(), updateAvailable: data.version !== app.getVersion() };
});
ipcMain.handle("open-external", (_, url) => shell.openExternal(url));
ipcMain.handle("app-version", () => app.getVersion());

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
