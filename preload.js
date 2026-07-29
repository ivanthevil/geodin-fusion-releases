const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fusionApi", {
  chooseSources: () => ipcRenderer.invoke("choose-sources"),
  chooseTarget: () => ipcRenderer.invoke("choose-target"),
  inspect: path => ipcRenderer.invoke("inspect-db", path),
  merge: payload => ipcRenderer.invoke("merge-databases", payload),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  restartForUpdate: () => ipcRenderer.invoke("restart-for-update"),
  onUpdateProgress: callback => ipcRenderer.on("update-progress",(_,payload)=>callback(payload)),
  version: () => ipcRenderer.invoke("app-version")
});
