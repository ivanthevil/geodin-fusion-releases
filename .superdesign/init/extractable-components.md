# Extractable Components

## CommandCenterHeader
- Source: `index.html`, `styles.css`
- Category: layout
- Description: bOden/GeoDIN Fusion identity, version and application actions.
- Extractable props: `version`, `updateState`
- Hardcoded: logo, product labels, icon styling

## SourceDatabaseCard
- Source: `app.js`, `styles.css`
- Category: basic
- Description: Loaded source MDB with filename, path, point count and validation state.
- Extractable props: `filename`, `path`, `pointCount`, `status`
- Hardcoded: compact bordered card geometry

## PointSelectionTable
- Source: `index.html`, `app.js`, `styles.css`
- Category: basic
- Description: Large selectable GeoDIN point table with sticky header and procedure badges.
- Extractable props: `rows`, `selectedKeys`, `allSelected`
- Hardcoded: columns and GeoDIN procedure colors

## MasterDatabasePanel
- Source: `index.html`, `app.js`, `styles.css`
- Category: layout
- Description: Master MDB, conflict policy, backup/schema/duplicate status and safety notice.
- Extractable props: `master`, `policy`, `duplicateCount`, `schemaState`
- Hardcoded: safety labels and amber accent

## CommandCenterFooter
- Source: `index.html`, `styles.css`
- Category: layout
- Description: Persistent selection/status summary and validation/fusion actions.
- Extractable props: `summary`, `status`, `canMerge`
- Hardcoded: action order and primary black button
