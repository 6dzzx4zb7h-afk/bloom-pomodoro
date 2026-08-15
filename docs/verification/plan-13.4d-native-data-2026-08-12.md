# PLAN 13.4d — native iOS data presentations

Date: 2026-08-12

Status: complete for the bounded implementation step. iOS uses native share, document-picker, and
destructive-confirmation surfaces while React remains the sole owner of backup generation,
validation, migration, merge, persistence, recovery, and user-facing state.

## Authority and privacy boundary

- React generates the exact existing JSON envelope and formula-neutralized CSV. Native receives a
  bounded filename, MIME type, and UTF-8 bytes only after the person selects an export action.
- Native writes one protected file inside a UUID-scoped temporary directory, presents
  `UIActivityViewController`, and removes Bloom's temporary copy when the sheet completes or is
  dismissed. No destination is selected and no data leaves the device until the person chooses an
  activity or Save to Files.
- Import uses `UIDocumentPickerViewController` restricted to JSON. Bloom reads exactly one selected
  security-scoped file, stops that access after reading, and rejects non-files, non-UTF-8 content,
  and files over the existing 5 MiB cap.
- The returned text still runs through `parseBackup`, `prepareImport`, and `commitPreparedImport`.
  Existing migration, preview, stable-id merge, atomic commit, rollback, safety-backup, and recovery
  behavior is unchanged.
- The native destructive alert returns only a boolean. React invokes `clearFocusData` after an
  explicit destructive confirmation; cancel/dismiss cannot mutate data.
- No native code knows the `bloom-state` or Companion storage keys, writes app state, contacts a
  server, or adds analytics/telemetry.

## Native Settings behavior

- Your data now renders directly in the native Settings form; the former disclosure into a web
  sub-sheet is gone.
- JSON/CSV export, JSON import, import preview/merge/cancel/recovery actions, weekly review access,
  focus-history scope, and clear-history controls are all represented by the live React snapshot.
- Import and history clearing disable while any timer record is open. Their native rows explain the
  recovery action instead of silently ignoring the tap.
- Import status changes re-render the native form with accessible status notes for reading, preview,
  saving, success, ordinary validation failure, and storage-recovery failure.
- Browser and unavailable-native paths retain the complete web sheet, anchor downloads, file input,
  progress/cancel status, preview, and shared import implementation.

## Automated and build evidence

- Focused native settings/data/import run: 5 files, 58 tests passed.
- Full `npm test`: 82 files, 749 tests passed, including all migration and export/import fixtures.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed; the production bundle and app-shell service worker were generated.
- `npm run ios:sync`: passed and copied the final web bundle into the native project.
- `node scripts/local-only-audit.mjs`: passed across 199 source files.
- `git diff --check`: passed.
- The iOS 26.5 SDK compiled the new `UIActivityViewController`, `UIDocumentPickerViewController`,
  security-scoped read, temporary-file cleanup, and `UIAlertController` code in a code-signing-free
  Simulator build. Xcode then built and ran the synced app on Simulator.

## Simulator evidence

Target: iPad mini (A17 Pro), iOS 26.5.

- With an active Focus record, JSON/CSV export stayed available while import, weekly review, and
  clear-history review were disabled with precise explanations.
- Export JSON presented the system share popover with the dated `bloom-backup-2026-08-12` JSON file,
  including Copy and Save to Files. Dismissing the popover returned to the same native Settings form.
- After resetting the open timer, import became available and opened the full system Files picker in
  Recents with iCloud Drive and On My iPad locations. Cancel returned to Settings with no state
  change.
- Review clear scope exposed separate Removes and Keeps descriptions. Clear reflection history then
  presented a native alert naming the exact one session/zero Companion-moment scope, with destructive
  clear and canceling keep-it actions. Keep it dismissed the alert without clearing the record.
- The accessibility hierarchy exposed each data action, disabled state and explanation, status text,
  and destructive/cancel alert action.

## Evidence boundary

The Simulator had no prepared JSON file in Files, so successful document selection was verified at
the adapter/component boundary with the canonical export bytes and atomic commit fixtures rather than
by importing a hand-placed Simulator file. Third-party share extensions, physical-device Files
providers, VoiceOver spoken output, signed archive, TestFlight, App Store submission, and web
deployment remain release checks rather than inferred evidence.
