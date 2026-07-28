const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fusionApi", {
  chooseSources: () => ipcRenderer.invoke("choose-sources"),
  chooseTarget: () => ipcRenderer.invoke("choose-target"),
  inspect: path => ipcRenderer.invoke("inspect-db", path),
  merge: payload => ipcRenderer.invoke("merge-databases", payload),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  openExternal: url => ipcRenderer.invoke("open-external", url),
  version: () => ipcRenderer.invoke("app-version")
});
