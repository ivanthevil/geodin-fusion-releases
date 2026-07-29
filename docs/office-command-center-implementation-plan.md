# GeoDIN Fusion Office Command Center – Implementation Plan

Design source: Superdesign project `d44cd091-dc08-4801-ba26-8c955b9b89c4`, draft `90ecf9a0-763a-4139-9b1b-b7b49d23ec04`.

## UI fidelity

- Rebuild the shell to match Variant 1: compact branded header, numbered three-column workspace, dense center table, master/conflict rail and persistent bottom command bar.
- Preserve exact bOden typography, paper/surface palette, black rules, amber focus and green validation.
- Give each column an independent bounded viewport. The center point list scrolls vertically while its column header and bottom command bar remain fixed.
- Add source-level progress, filters/search, selection counts, duplicate status and clear empty/loading/error states where defined by the draft.

## Internal interaction system

- Replace `alert`, `confirm` and native HTML dialog presentation with one branded modal/toast/progress layer.
- Keep Windows file pickers only where filesystem access requires them.
- Confirm destructive policies and the final fusion inside the app.

## Incremental updater

- Publish a signed manifest containing version, minimum compatible version, file list, SHA-256 and download URL.
- Download only changed application files into a staging directory.
- Verify every hash, preserve the current files as rollback package, then apply after restart through a hidden updater helper.
- Show checking, downloading, verifying, ready, installing, success and rollback states inside Fusion.
- Never open a browser or console/PowerShell window during update.

## Verification

- Test two large sources and a large master at 1180×700, 1440×900 and tablet-like Windows scaling.
- Verify central and side-panel scrolling, sticky header/footer, full keyboard/touch selection and in-app dialogs.
- Simulate update success, network interruption, corrupt hash and rollback.
