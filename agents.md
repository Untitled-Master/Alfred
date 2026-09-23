# agents.md — Alfred

Instructions for coding agents working in this repo. Alfred is a student-tutor
desktop app: **Electron + Vite + React** UI with a Zeron-style glass theme,
backed by a locally spawned **`opencode serve`** process (SSE streaming).

## Quick commands

```bash
npm install        # install deps
npm run dev        # app + opencode serve concurrently (serve on :4123)
npm run dev:app    # renderer/main only
npm run dev:server # opencode serve only
npm run build      # electron-vite bundle -> out/
npm run build:win  # packaged Windows installer (electron-builder, NSIS .exe)
```

Prereqs: Node 20+, `opencode` CLI on `PATH`, one logged-in provider
(`opencode auth login` — OpenRouter has free models).

## Layout

```text
src/main/opencode.js        opencode serve harness, prompt_async, memory, prompts/modes, MCP config
src/main/index.js           window + IPC handlers (oc:*, upd:*, window controls)
src/main/updater.js         GitHub-Releases auto-update feed (electron-updater)
src/preload/index.js        window.api bridge (context-isolated)
src/renderer/src/App.jsx    shell, sessions, transcript, composer, sidebar
src/renderer/src/components Markdown, MermaidBlock, Dropdown, AttachPicker,
                            PreviewPane, Settings (General/Soul/System/Modes/Updates), Navbar
src/renderer/src/opencode/  useOpencode hook (models, variants, commands, SSE state)
src/renderer/src/theme/     tokens + ThemeContext + glass.css
mcp/course-search/          workspace PDF search server (stdio)
mcp/student-memory/         per-topic mastery server (stdio)
.github/workflows/build.yml CI: Windows build + installer on merge (see below)
```

## Architecture notes

- Main owns the backend: picks a free port (4123–4172), spawns `opencode serve`
  with generated Basic auth, pumps `/global/event` SSE to the renderer.
- Every tutor turn sends `soul + system + memory-brief` via `prompt_async`.
  Soul/system come from the active **mode** (see Modes).
- **Modes** are switchable prompt packs (`study`, `dev-agent`, `frontend`,
  `backend`, `fullstack`, `software-eng`, plus user customs), defined in
  `src/main/opencode.js` (`DEFAULT_MODES`), stored per workspace in
  `<workspace>/.albert/prompts.json`. Switch via Settings → Modes or `/mode <id>`.
- Sessions are stamped per workspace (`session.ws`); the sidebar groups by it.
  Active session id, view, collapse/pin/tint state persist in `localStorage`
  under the `albert.*` key prefix — keep the prefix for new keys.
- Attachments: image/pdf/text/audio upload + workspace `ref`s. Audio never hits
  the model wire (no audio input path) — it stays a named attachment with an
  inline player. Renderer CSP lives in `src/renderer/index.html` — any new
  `data:`/`blob:` media kind needs `media-src` there.
- Never expose the internal decision/preamble text; keep responses terse.

## CI/CD — Windows build on merge

Workflow: [`.github/workflows/build.yml`](.github/workflows/build.yml)
(runs on `windows-latest`, verified green).

- **Triggers:** `push` to `main` only — no PR builds. PRs run
  [`.github/workflows/pr.yml`](.github/workflows/pr.yml) instead
  (`npm ci` + `npm test`, no packaging).
- **PR checks:** `npm test` runs the `node --test` smoke suite in `test/`
  (semver, updater wiring, update-feed config, CI split). Keep it green and
  dependency-free (it runs with `npm ci --ignore-scripts`).
- **Steps:** checkout → Node 20 (`npm ci`, npm cache) → install `node-gyp`
  globally (native rebuilds) → `npm run build` → `npm run build:win`
  (electron-builder, NSIS) with `CSC_LINK: ''` / `CSC_KEY_PASSWORD: ''`
  (code-signing **disabled** — no cert configured).
- **Per-run download:** the `.exe` is uploaded as the
  **`alfred-windows-installer`** artifact (`dist/*.exe`, 30-day retention).
  Actions tab → the run → Artifacts.
- **Releases (push to `main` only):** `softprops/action-gh-release` cuts tag
  **`build-<run_number>`** titled `Alfred build #<run_number>` with the
  installer attached (e.g. `alfred-0.1.0-setup.exe`). Releases tab → latest
  `build-N`. PR runs upload the artifact but cut **no** release.
- **To ship:** merge a PR (or push) to `main`, wait ~5 min, grab the `.exe`
  from the run's artifact immediately or from the `build-N` release.
- **To ship an update (in-app):** bump `version` in `package.json`, merge to
  `main`. The workflow publishes an electron-updater feed (`latest.yml`) to a
  `v<version>` release; installed apps detect it from GitHub Releases, show an
  update banner in the sidebar, and install on restart (Settings → Updates).
  Merges without a version bump reuse the existing feed and publish nothing.
- **Updater wiring:** `src/main/updater.js` (`AppUpdater`, `upd:*` IPC) →
  `window.api.updates` → `src/renderer/src/updates/useUpdater.js` →
  sidebar banner + Settings → Updates tab. Dev builds report
  `supported:false` and never check.
- **To sign later:** add the cert as repo secrets and wire
  `CSC_LINK`/`CSC_KEY_PASSWORD` to them in the `build:win` step env.

## Do not commit

`node_modules/`, `out/`, `dist/`, `release/`, `*.log`, `.env*`,
per-workspace runtime data (`.albert/`), and the harness-generated
`opencode.json` (absolute machine paths, rewritten on boot) — see `.gitignore`.
Screenshots for the README go in `screenshots/` (`new-chat.png`, `chat.png`).
