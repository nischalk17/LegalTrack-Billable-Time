# LegalTrack Desktop (Electron) — Build Instructions

## Prerequisites
- Windows 10/11 (x64)
- Node.js (LTS recommended)

## Required assets
This app references these files (you must provide them as real image files):
- `electron-app/assets/icon.ico` (installer/app icon)
- `electron-app/assets/icon.png` (tray icon 16×16 and 32×32 work best)
- `electron-app/assets/icon-paused.png` (greyed tray icon)

## Build & run
From the repo root:

```bash
cd electron-app
npm install
npm run start
```

Swagger UI (backend) is unrelated; this Electron app talks to:
- API: `https://api.legaltrack.com`
- Dashboard: `https://app.legaltrack.com`

## Build installer (NSIS)

```bash
cd electron-app
npm install
npm run build:installer
```

Output:
- `electron-app/dist/LegalTrack-Setup-1.0.0.exe`

## Notes
- The app runs **tray-only** after login.
- On first successful login, a one-time native dialog is shown.
- The extension token endpoint is served locally at `http://127.0.0.1:27832/token`.

