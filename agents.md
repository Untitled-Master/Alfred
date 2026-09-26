# agents.md — Alfred

Instructions for coding agents working in this repo. Alfred is a student-tutor
desktop app: **Electron + Vite + React** UI with a Zeron-style glass theme,
backed by a locally spawned **`opencode serve`** process (SSE streaming).

## Quick commands

```bash
npm install        # install deps (postinstall runs electron-builder install-app-deps)
npm run dev        # app + opencode serve concurrently (serve pinned to :4123)
npm run dev:app    # renderer/main only
npm run dev:server # opencode serve on :4123 only
npm run format     # prettier --write . (singleQuote, no semi, 100 width)
npm run lint       # eslint --cache .
npm test           # node --test test/*.test.js (pure node, zero deps)
npm run build      # electron-vite bundle -> out/
npm run build:win  # + electron-builder NSIS .exe (always --publish never locally)
```

Single test: `node --test test/update-feed.test.js`.
Prereqs: Node 20 (CI pins 20; README says 18+), `opencode` CLI on `PATH`,
one logged-in provider (`opencode auth login` — OpenRouter has free models).

## Layout

```text
src/main/opencode.js        opencode serve harness, prompt_async, memory, prompts/modes, MCP config
src/main/index.js           window + IPC handlers (oc:*, upd:*, window controls)
src/main/updater.js         GitHub-Releases auto-update feed (electron-updater)
src/preload/index.js        window.api bridge (context-isolated)
src/renderer/src/App.jsx    shell, sessions, transcript, composer, sidebar;
                            ThreadPane (one transcript+composer per open session,
                            split-screen included) + useComposer (per-pane state)
src/renderer/src/components Markdown, MermaidBlock, Dropdown, AttachPicker,
                            PreviewPane, Settings (General/Soul/System/Modes/Updates), Navbar,
                            GitPanel (right git sidebar: status, unified diffs, log)
src/renderer/src/opencode/  useOpencode hook (models, variants, commands, SSE state)
src/renderer/src/theme/     tokens + ThemeContext + glass.css
mcp/course-search/          workspace PDF search server (stdio)
mcp/student-memory/         per-topic mastery server (stdio)
.github/workflows/build.yml CI: Windows build + installer on merge (see below)
```

## Architecture notes

- Main owns the backend: picks a free port (4123–4172), spawns `opencode serve`
  with generated Basic auth, pumps `/global/event` SSE to the renderer.
  The SSE stream is global (server ignores `?directory=`); frames carry their
  own `directory`.
- **Sessions, transcripts, threads are server-side** (one opencode store shared
  across repos and the TUI): sidebar from `GET /session` with no `directory`
  filter (newest first), grouped by `session.directory`; transcript from
  `GET /session/:id/message?limit=100` via the `serverToUi` adapter in
  `App.jsx`; threads via `POST /:id/fork` (unlinked copy) or
  `POST /session {parentID}` (linked child, see `GET /:id/children`).
  No local session/message cache, no id mapping — `albert.sessions` /
  `albert.msgs` keys are retired (removed on boot).
- Every tutor turn sends the mode's native agent + memory-brief via
  `prompt_async`. Soul/system come from the active **mode** (see Modes).
- **Modes** are switchable prompt packs (`opencode` = plain default with no
  prompts, `study`, `dev-agent`, `frontend`, `backend`, `fullstack`,
  `software-eng`, plus user customs), defined in
  `src/main/opencode.js` (`DEFAULT_MODES`), stored per workspace in
  `<workspace>/opencode.json` under the `alfred` key, and published as native
  `alfred-*` primary agents into the GLOBAL opencode config
  (`syncModeAgents` — only that prefix is managed). Global on purpose: the
  server resolves a session's project by git worktree (frozen at first sight,
  so a moved folder keeps the old path and misses per-project keys).
  Turns probe the live list first (`hasAgent`, 30s cache) and fall back to the
  full inline pack when the server hasn't reloaded yet — never hard-fail.
  Switch via Settings → Modes or `/mode <id>`.
- Active session id, view, collapse/pin/tint state persist in `localStorage`
  under the `albert.*` key prefix — keep the prefix for new keys.
- Session titles belong to the server: sessions are created untitled
  (`POST /session` with no title), the server's title agent names them
  (adopted from `session.updated` events), and manual renames PATCH through
  via `updateSessionTitle` so the server stays the source of truth.
- Attachments: image/pdf/text/audio upload + workspace `ref`s. Audio never hits
  the model wire (no audio input path) — it stays a named attachment with an
  inline player, and vanishes from server-fetched history. Renderer CSP lives
  in `src/renderer/index.html` — any new `data:`/`blob:` media kind needs
  `media-src` there.
- Runtime data lives in opencode infra, never the repo: sessions/messages in
  opencode's data dir (`~/.local/share/opencode`, honoring `XDG_DATA_HOME` /
  `OPENCODE_TEST_HOME`); Alfred-owned state (student `memory.json`,
  per-workspace `course-index-<hash>.json`) in `<datadir>/alfred/`;
  `<workspace>/opencode.json` holds the MCP merge + `alfred` pack + `agent`
  pack (rewritten on boot; unparseable files backed up to `opencode.json.bak`).
  Never hand-edit it. No `.albert` anywhere (one-time `prompts.json` import
  deletes the legacy file).
- MCP config shape matters: each server is `type: 'local'` with a single
  `command` **array** (binary + args: server, workspace, state dir) and
  `environment` (not `env`) — anything else is silently dropped. Servers run
  via `ELECTRON_RUN_AS_NODE`, so packaged builds need no system node.
- API asymmetries in `src/main/opencode.js`: `prompt_async` takes
  `model: {providerID, modelID}` plus `agent` and accepts text attachments as
  text parts; `/command` takes `model: "provider/model"` string and file parts
  only (text attachments are dropped by the UI). `api()` appends `?directory=`
  unless `opts.global` (list/projects/agents).
- Env overrides: `OPENCODE_BIN`, `ALBERT_WORKSPACE`, `ALBERT_MCP_DIR`,
  `ALBERT_DATA_DIR` (state-dir override).

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
