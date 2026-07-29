# Routes

GeoDIN Fusion has one local Electron route.

| Route | Entry | Layout |
| --- | --- | --- |
| `file://…/index.html` | `index.html` + `app.js` | Office command center shell |

Electron loads it in `electron-main.js`:

```js
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
```
