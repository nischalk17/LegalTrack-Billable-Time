# Archive

These are earlier attempts at native/desktop time tracking, kept for reference but no longer maintained or built as part of the product:

- **`electron-app/`** — a tray app with active-window tracking (Word, Adobe, etc.). Feature-complete but pointed at a hardcoded, non-existent production URL, and required Electron packaging/signing expertise. Superseded by the browser extension (`extension/` at the repo root) for v1.
- **`tracker/`** — a standalone CLI prototype of the same desktop-tracking logic later forked into `electron-app/tracker.js`. Was already dead code (nothing in the app depended on it) before being archived here.

If native-app tracking (e.g. MS Word/Adobe time capture) becomes a priority again, `tracker/`'s injectable-options design is a better starting point than `electron-app/tracker.js`'s hardcoded globals.
