# Alfred

Alfred is a student-tutor desktop app (Electron + React + Vite) with a Zeron-style glass UI.
It spawns a local `opencode serve` backend and streams tutoring turns over SSE — sessions,
attachments, markdown/mermaid answers, quizzes, and per-workspace memory included.

## Screenshots

Drop your two screenshots at these paths (referenced below):

- `screenshots/new-chat.png` — empty state / new chat
- `screenshots/chat.png` — chat in progress

### New chat

![Alfred — new chat](screenshots/new-chat.png)

### Chat preview

![Alfred — chat in progress](screenshots/chat.png)

## Features

- **Study + Quiz tabs** — Socratic tutoring turns with streaming, reasoning view, and stop/retry.
- **Sessions by workspace** — grouped threads with collapse, pin-to-top, per-thread tint, rename, delete.
- **Attachments** — images, PDFs, text/code, and audio (mp3/wav/ogg/m4a) with an inline player widget (play/stop/close).
- **Rich answers** — markdown, code highlighting, and inline Mermaid diagrams.
- **Slash commands** — `/` autocomplete expanding to server command templates.
- **Models** — free + paid picker with search, per-model thinking-level variants, parallel turns.
- **Memory (MCP)** — bundled `course-search` (workspace PDFs) and `student-memory` (per-topic mastery 0–5) servers; mastery brief is injected into every turn.
- **Soul + System prompts** — editable from Settings (General / Soul / System / Modes tabs), stored per workspace, applied to new turns.
- **Modes** — switchable prompt packs: Study tutor, Dev agent, Frontend / Backend / Full-stack / Software engineer, plus your own custom modes. Switch in Settings → Modes, in the navbar indicator, or with `/mode <id>` in chat.
- **Glass theme** — frosted/transparent/opaque surfaces, accent picker, background image, font controls.

## Prerequisites

- Node.js 18+ and npm
- `opencode` CLI on `PATH` (Alfred starts `opencode serve` itself)
- At least one logged-in provider: `opencode auth login` (OpenRouter has free models)

## Run

```bash
npm install
npm run dev     # app (4123) + opencode serve, concurrently
```

Useful variants:

```bash
npm run dev:app     # renderer/main only
npm run dev:server  # opencode serve on :4123 only
npm run build       # electron-vite build -> out/
npm run build:win   # packaged Windows installer (electron-builder)
```

## Project layout

```text
src/main/opencode.js        opencode serve harness, prompt_async, memory, prompts, MCP config
src/main/index.js           window + IPC (oc:*, window controls)
src/preload/index.js        window.api bridge
src/renderer/src/App.jsx    shell, sessions, transcript, composer, sidebar
src/renderer/src/components Markdown, MermaidBlock, Dropdown, AttachPicker,
                            PreviewPane, Settings (General/Soul/System), Navbar
src/renderer/src/opencode/  useOpencode hook (models, variants, SSE state)
src/renderer/src/theme/     tokens + ThemeContext + glass.css
mcp/course-search/          workspace PDF search server
mcp/student-memory/         per-topic mastery server
```

## Configuration

- **Workspace** — picked in-app (hero or composer row); sessions are stamped per workspace.
- **Runtime data** — `<workspace>/.albert/` (`memory.json`, `prompts.json`); local UI state lives in `localStorage`.
- **`opencode.json`** — auto-written/merged by the harness on boot (absolute machine paths); don't hand-edit, it's git-ignored.
- **Ports/auth** — serve probes 4123–4172 with generated Basic auth; dev defaults live in the `dev` npm script.
