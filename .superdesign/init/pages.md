# Pages and dependency trees

## GeoDIN Fusion Office Command Center

Entry: `index.html`

Dependencies:

- `index.html`
  - `styles.css`
  - `app.js`
    - browser API exposed by `preload.js`
      - IPC handlers in `electron-main.js`
        - `geodin-fusion-inspect.ps1`
        - `fusion-engine.ps1`
  - `boden-icon.png`

Actual rendered branch: a single desktop command-center view with source database list on the left, selectable point table in the center, master database and conflict controls on the right, and persistent status/actions at the bottom.
