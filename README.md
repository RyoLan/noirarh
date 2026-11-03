# Noira · $NOIRA

This repository holds two things that share one brand:

1. **The website** (root): the landing page with the 3D hero, the live launch scanner, Ask Noira and the web vibecode builder, plus the Download section.
2. **The Noira agent** (`agent/`, published to npm as `noira`): a self-hosted AI agent with a local gateway, a CLI and a control panel, packaged for Windows (`desktop/`), macOS (`desktop/`) and Android (`mobile/`).

```
agent/     npm package "noira": gateway, CLI, tools, scheduler, memory, control panel (agent/panel)
desktop/   Electron app: runs the gateway, opens the panel, lives in the tray / menu bar
mobile/    Capacitor Android app: the panel as a client for a remote gateway
server/    website server: launch feed, Ask Noira, web builder, GET /api/launches
src/       website front end (Three.js, GSAP, Lenis)
.github/   CI and the release workflow that builds every installer
```

## Website

```bash
npm install
cp .env.example .env        # put your key in ANTHROPIC_API_KEY
npm run dev                 # http://localhost:5173
npm run build && npm start  # production: node dist-node/server/index.js --prod
```

Set `GITHUB_REPO` in `src/ui/download.ts` to your `owner/repo` so the download buttons point at the latest release. Until then they read "Coming soon". Contract address and buy link: `CONTRACT_ADDRESS` / `BUY_URL` in `src/main.ts`.

## Agent

```bash
npm run build -w agent
node agent/dist/cli.js onboard
node agent/dist/cli.js start
node agent/dist/cli.js            # chat
npm test -w agent                 # logic checks, no model needed
```

See [agent/README.md](agent/README.md) for every command and the security model. The agent's `scan_launches` tool reads `GET /api/launches` from the website (`feedUrl` in the agent's Settings).

## Desktop and Android

```bash
npm run build -w agent
npm run dist:win -w desktop       # desktop/release/Noira-Setup.exe (Windows)
npm run dist:mac -w desktop       # desktop/release/Noira-mac.dmg (needs a Mac)
npm run add -w mobile             # generates mobile/android
npm run apk -w mobile             # needs JDK 21 and the Android SDK
```

## Releasing

1. Push this repository to GitHub.
2. Bump `version` in `agent/`, `desktop/` and `mobile/package.json`, then push a tag: `git tag v0.1.0 && git push --tags`.
3. `.github/workflows/release.yml` builds `Noira-Setup.exe`, `Noira-mac.dmg` and `Noira-android.apk` and attaches them to a GitHub Release.

Optional repository secrets:

- `NPM_TOKEN`: the workflow also publishes the `noira` package to npm.
- `CSC_LINK`, `CSC_KEY_PASSWORD`: code signing. Without them, Windows shows a SmartScreen warning and macOS asks the user to open the app from System Settings.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: macOS notarization.

The Android build is a debug-signed APK, which installs from the browser after "allow unknown apps". A Play Store release needs a signing keystore.
