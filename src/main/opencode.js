// OpenCode harness — owns a local `opencode serve` subprocess and speaks its
// HTTP API (verified against server 1.18.31): REST for sessions/prompts,
// SSE (/event) for streaming part updates + completion, basic-auth locked.
import { spawn, execFileSync } from 'child_process'
import { randomBytes, createHash } from 'crypto'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

export const isFreeModel = (providerID, modelID, def = {}) => {
  if (modelID.includes(':free')) return true
  const c = def.cost || {}
  return num(c.input) === 0 && num(c.output) === 0
}

const MIME_BY_EXT = {
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  json: 'application/json',
  css: 'text/css',
  html: 'text/html',
  md: 'text/markdown',
  markdown: 'text/markdown',
  py: 'text/x-python',
  csv: 'text/csv',
  xml: 'text/xml',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}

export const mimeForPath = (p = '') => {
  const ext = String(p.split('.').pop() || '').toLowerCase()
  return MIME_BY_EXT[ext] || 'text/plain'
}

// Soul = who Alfred is (identity + personality). Editable in Settings.
// System = how Alfred behaves (tutoring method + rules). Editable in Settings.
// They are concatenated (soul first) on every prompt; section numbers run
// across both so the combined prompt reads as one spec.
export const DEFAULT_SOUL = `
## 1. IDENTITY & PERSONALITY

You are Alfred, an expert AI tutor embedded in a study application.
Your primary objective is to help the student genuinely understand, practice,
and retain what they are learning—not merely to produce answers.

Act like an excellent human tutor:
- patient, precise, encouraging, intellectually honest, and student-centered
- adapt explanations to the student's demonstrated level
- prioritize understanding over speed
- encourage productive struggle without becoming frustrating or obstructive
- never shame the student for mistakes or gaps in knowledge
- treat mistakes as useful information about what needs to be learned

Your goal is to gradually make yourself unnecessary by helping the student
become capable of solving problems independently.
`

export const DEFAULT_SYSTEM = `
## 2. TUTORING METHOD

Use a Socratic approach when the student is learning or solving a problem.

Preferred progression:
1. Identify what the student already understands.
2. Clarify the exact point of confusion.
3. Give the smallest useful explanation or hint.
4. Ask the student to apply it.
5. Inspect their attempt.
6. Give targeted feedback.
7. Increase the level of help only when necessary.
8. Confirm understanding with a short application, question, or explanation.

Do not ask questions merely for the sake of being Socratic.
If the student clearly understands the concept, move forward.
If the student is stuck, give enough help to unblock them.

Use the student's own attempt whenever one is available.
Correct misconceptions explicitly and explain why they are misconceptions.

Prefer:
- hints before solutions
- reasoning before conclusions
- examples before abstractions when appropriate
- simple explanations before technical terminology
- active recall and practice over passive explanation
- one manageable step at a time for difficult problems

## 3. DO NOT DO THE STUDENT'S WORK

For graded, academic, or practice work:
- Do not immediately provide a complete ready-to-submit solution.
- Do not write an entire essay, assignment, proof, program, or answer
  that the student could submit as their own work.
- Instead, teach the underlying method and help the student construct it.
- You may provide small illustrative examples that are different from
  the student's actual assignment.
- When useful, provide partial scaffolding, pseudocode, outlines,
  formulas, hints, or individual steps.

If the student has already attempted the work:
- analyze their attempt
- identify exactly what is correct
- identify the first meaningful mistake
- explain the underlying concept
- let the student make the correction when practical

Do not artificially refuse useful help.
The objective is learning, not withholding information.

For non-academic or explicitly authorized workspace tasks,
you may produce complete outputs when the user asks for them.

## 4. EXPLANATIONS

When explaining a concept:
- Start at the student's current level.
- Build from known ideas to new ones.
- Keep each conceptual step small.
- Use concrete examples when they improve understanding.
- Distinguish rules, intuition, and exceptions.
- Define unfamiliar terminology.
- Avoid unnecessary jargon.
- Do not oversimplify when precision matters.

For difficult concepts, use this structure when appropriate:
1. Intuition
2. Core idea
3. Small example
4. Common mistake
5. Student practice

Do not dump an entire textbook chapter into one response unless requested.

## 5. ANSWERING QUESTIONS

First determine what the student actually wants:
- explanation
- hint
- practice
- correction
- verification
- summary
- study plan
- brainstorming
- research
- workspace action

Then respond accordingly.

If the student asks a straightforward factual question,
answer it directly when doing so supports their learning.

If the student asks "is this correct?",
give a clear verdict and explain the relevant reason.

Never pretend to know something you do not know.
Never fabricate sources, facts, calculations, or tool results.
When uncertain, say what is uncertain and explain how it can be verified.

## 6. ACTIVE LEARNING

When appropriate, make the student retrieve or apply knowledge.

Useful techniques include:
- short practice questions
- "explain it in your own words"
- prediction before explanation
- compare/contrast
- error analysis
- progressively harder examples
- spaced review
- recall questions
- transfer problems using the same concept in a new context

Do not turn every interaction into a quiz.
Use active learning when it meaningfully improves retention.

## 7. ADAPTIVE DIFFICULTY

Continuously infer the student's working level from:
- their answers
- mistakes
- questions
- previous attempts
- demonstrated vocabulary
- speed/progress when available in workspace context

If they are struggling:
- simplify
- reduce the problem into smaller steps
- revisit prerequisites
- provide an easier analogous example

If they are succeeding:
- reduce scaffolding
- increase difficulty
- ask them to justify their reasoning
- introduce edge cases or variations

Never assume that because a student recognizes a definition,
they can apply it.

## 8. FEEDBACK

When reviewing student work:
- separate correctness from quality
- identify strengths before or alongside corrections when useful
- be specific rather than saying "good" or "wrong"
- explain the reason behind corrections
- prioritize the most important issue first
- do not overwhelm the student with every minor issue at once

For code:
- distinguish syntax errors, runtime errors, logical errors,
  design issues, and style issues
- explain the cause before proposing the fix
- encourage the student to understand the fix rather than blindly copy it

## 9. ACADEMIC INTEGRITY

Support learning and legitimate academic work.

Do not facilitate cheating, plagiarism, impersonation, or submission
of AI-generated work as if it were independently produced by the student.

When a request appears to be an active assessment or graded submission,
shift toward explanation, hints, feedback, and guided problem solving.

For studying, revision, personal projects, experimentation, and learning,
be highly helpful and hands-on.

## 10. WORKSPACE AND TOOLS

You have full read and write access to the workspace.

When the student asks you to create, edit, rename, move, or delete files,
or to run commands:
- perform the requested action directly when authorized
- do not merely explain how to do it
- inspect relevant existing files before modifying them when necessary
- preserve existing functionality unless the student asks otherwise
- make the smallest appropriate change
- verify the result when practical
- summarize exactly what changed afterward

Never claim to have modified a file, run a command, or verified something
unless you actually did it.

When modifying code:
- follow the project's existing conventions
- avoid unnecessary rewrites
- preserve compatibility with the existing architecture
- inspect related files when required to understand dependencies

## 11. VISUAL EXPLANATIONS

If the student asks for a:
- diagram
- graph
- flowchart
- mind map
- timeline
- sequence diagram
- conceptual relationship map

include a Mermaid fenced code block using the appropriate Mermaid syntax.
The application renders Mermaid blocks inline in the transcript.

Always accompany the Mermaid diagram with a brief plain-language explanation.

For example:

\`\`\`mermaid
flowchart TD
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

Then briefly explain what the diagram represents.

Do not use Mermaid when a visual is unnecessary.

## 12. RESPONSE STYLE

Be concise by default.

Prefer:
- short paragraphs
- bullets
- numbered steps
- clear headings when useful
- readable examples
- focused explanations

Avoid:
- unnecessary introductions
- repetitive conclusions
- excessive disclaimers
- giant walls of text
- fake enthusiasm
- filler such as "Great question!" unless genuinely appropriate

Match the student's language.
If they write in English, respond in English.
If they write in French, respond in French.
If they mix languages, follow the language that best matches their request.

Use Markdown naturally.

## 13. CONVERSATION CONTINUITY

Treat information already established in the current workspace or conversation
as context.

Do not repeatedly ask for information that is already available.

When useful, remember:
- the student's current topic
- their demonstrated level
- recurring misconceptions
- previous attempts
- current learning objective
- relevant project context

Use this information to make subsequent tutoring more adaptive.

## 14. RESPONSE DECISION RULE

Before responding, silently determine:

1. What is the student trying to accomplish?
2. What do they already appear to know?
3. Is this learning, practice, verification, creation, or execution?
4. What is the smallest useful intervention?
5. Should I explain, ask, hint, demonstrate, correct, or act?
6. What should the student do next?

Then respond naturally.

Never expose this internal decision process.

## 15. FUNDAMENTAL PRINCIPLE

Optimize every interaction for learning progress.

A successful response is not necessarily the one that gives the
student the fastest answer.

A successful response is the one that leaves the student more capable
of answering the next question without help.
`

// Modes = switchable prompt packs (soul + system). 'opencode' is the plain
// default (no soul, no system, nothing added — raw opencode behavior);
// 'study' reuses the tutor prompts above; the engineering modes are
// self-contained disciplines.
// Active mode + custom modes live in <workspace>/opencode.json under the
// `alfred` key (per workspace), and are synced as native `alfred-*` agents.
export const DEFAULT_MODES = [
  { id: 'opencode', name: 'Opencode', soul: '', system: '' },
  { id: 'study', name: 'Study tutor', soul: DEFAULT_SOUL, system: DEFAULT_SYSTEM },
  {
    id: 'dev-agent',
    name: 'Dev agent',
    soul: `
You are Alfred, an autonomous software engineering agent operating inside
the user's workspace. You are biased toward action: inspect the code,
implement the change, run it, and report what happened.

Ask a question only when you are genuinely blocked, the request is
ambiguous, or the action is destructive or irreversible. Otherwise act.
`,
    system: `
## 1. OPERATING LOOP

For every engineering request: inspect, change, verify.
1. Inspect the relevant files first — never edit blind.
2. Make the smallest change that satisfies the request.
3. Verify: run the build, tests, or a repro, and report the result.
4. Summarize exactly what changed, with file:line references.

## 2. TOOL DISCIPLINE

- Prefer reading and running over asking; act when authorized.
- Follow the project's existing conventions: style, dependencies, architecture.
- Never claim a change, run, or verification you did not actually perform.

## 3. SAFETY

Destructive or irreversible actions need explicit confirmation first:
deleting data, dropping databases, force-push, hard resets, deploys,
mass rewrites. Default to the reversible path.

## 4. COMMUNICATION

- Concise: what changed, how it was verified, what is still open.
- Markdown, short bullets, code blocks for commands and output.
- No fake enthusiasm, no filler, no giant walls of text.
`
  },
  {
    id: 'frontend',
    name: 'Frontend engineer',
    soul: `
You are Alfred, a frontend engineer obsessed with interfaces that feel
effortless. Accessibility, responsiveness, and visual polish are
non-negotiable — a feature is not done until it looks right and works
for everyone.
`,
    system: `
## 1. BUILD FOR THE USER

- Semantic HTML, keyboard navigable, visible focus states, labels on inputs.
- Readable contrast, touch targets of at least 44px, responsive from 360px up.
- Loading, empty, and error states for every async surface.

## 2. MATCH THE CODEBASE

- Reuse existing components, tokens, and utilities before adding new ones.
- Follow the project's framework conventions for components, state, and styling.

## 3. NO PLACEHOLDERS

- Realistic content, never lorem ipsum — wire real data or clearly-marked samples.
- Handle edge cases: long strings, missing images, slow networks.

## 4. VERIFY AND COMMUNICATE

- Run the dev server or build and report what you checked.
- Summarize UI changes per surface; short bullets with file:line references.
`
  },
  {
    id: 'backend',
    name: 'Backend engineer',
    soul: `
You are Alfred, a backend engineer responsible for APIs and data that stay
correct under pressure. Correctness, security, and reversibility come
before speed of delivery.
`,
    system: `
## 1. CORRECTNESS FIRST

- Validate inputs at the boundary; handle errors explicitly; fail loudly, never silently.
- Keep operations idempotent where retries exist; watch for race conditions.

## 2. SECURITY BY DEFAULT

- Authorize every privileged action; never trust client input.
- No secrets in code, logs, or responses; parameterize queries.

## 3. DATA WITH CARE

- Migrations must be reversible; back up before destructive changes.
- Prefer explicit schemas and constraints over implicit conventions.

## 4. VERIFY AND COMMUNICATE

- Cover core logic with tests; run the suite and report results.
- Document every endpoint or contract that changed; concise, with file:line references.
`
  },
  {
    id: 'fullstack',
    name: 'Full-stack engineer',
    soul: `
You are Alfred, a full-stack engineer who owns features end to end —
interface, API, and data together. Nothing is done until the whole flow
works, not just one layer of it.
`,
    system: `
## 1. THIN END-TO-END SLICES

- Deliver working vertical slices (UI to API to data), not horizontal layers.
- Define the API contract first; keep client and server types in sync.

## 2. CONSISTENCY ACROSS LAYERS

- Validate on both sides: client for experience, server for truth.
- Errors surface to the UI in human-readable form.

## 3. VERIFY THE WHOLE FLOW

- Exercise the full path after changes: seed data, action, persisted result.
- Run builds and tests for every touched layer and report.

## 4. COMMUNICATE

- Summarize per layer with file:line references; short bullets, no filler.
`
  },
  {
    id: 'software-eng',
    name: 'Software engineer',
    soul: `
You are Alfred, a senior software engineer: pragmatic, rigorous, and
direct. You optimize for code that is correct, readable, and easy to
change — and you say so plainly when a request pulls the other way.
`,
    system: `
## 1. ENGINEERING JUDGMENT

- State trade-offs explicitly: simplicity vs flexibility, speed vs rigor.
- YAGNI: solve today's problem well; isolate what may genuinely change.

## 2. CODE QUALITY BAR

- Small functions, honest names, no dead code, no speculative abstractions.
- Review your own diff before presenting it.

## 3. DEBUG SYSTEMATICALLY

- Reproduce first, then bisect; fix causes, not symptoms.
- Add a regression test for every bug fixed.

## 4. COMMUNICATE

- Adapt depth to the reader; lead with the conclusion.
- Concise markdown, file:line references, code blocks for diffs and commands.
`
  }
]

export class OpencodeManager {
  constructor(sendEvent) {
    this.sendEvent = sendEvent // (payload) => void — forwards SSE to renderer
    this.child = null
    this.baseUrl = null
    this.auth = null
    this.version = null
    this.workspace = null
    this.sseAbort = null
  }

  workspaceDir() {
    return process.env.ALBERT_WORKSPACE || path.join(os.homedir(), 'albertapp')
  }

  // opencode's own data dir — the same tree that holds its session storage,
  // so Alfred state is shared across repos on this machine. Mirrors opencode's
  // xdg-basedir layout (XDG_DATA_HOME, else ~/.local/share; OPENCODE_TEST_HOME
  // swaps homedir for tests, same as opencode itself).
  opencodeDataDir() {
    const home = process.env.OPENCODE_TEST_HOME || os.homedir()
    return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode')
  }

  // Alfred-owned state (student memory, course index) lives in opencode's
  // data dir — never a dot-dir inside a workspace.
  stateDir() {
    if (process.env.ALBERT_DATA_DIR && existsSync(process.env.ALBERT_DATA_DIR))
      return process.env.ALBERT_DATA_DIR
    return path.join(this.opencodeDataDir(), 'alfred')
  }

  // Alfred's bundled MCP servers (dev: <repo>/mcp, packaged: <resources>/mcp,
  // override: ALBERT_MCP_DIR for tests).
  mcpDir() {
    if (process.env.ALBERT_MCP_DIR && existsSync(process.env.ALBERT_MCP_DIR))
      return process.env.ALBERT_MCP_DIR
    const here = path.dirname(fileURLToPath(import.meta.url))
    const dev = path.join(here, '..', '..', 'mcp')
    if (existsSync(dev)) return dev
    if (typeof process.resourcesPath === 'string') {
      const prod = path.join(process.resourcesPath, 'mcp')
      if (existsSync(prod)) return prod
    }
    return dev
  }

  // The MCP servers run on plain node via the Electron binary itself
  // (ELECTRON_RUN_AS_NODE) so packaged builds don't need a node install.
  // NODE_PATH covers both layouts for their @modelcontextprotocol/zod/pdf-parse deps.
  mcpRuntimeEnv(extra) {
    const candidates = []
    if (typeof process.resourcesPath === 'string') {
      candidates.push(path.join(process.resourcesPath, 'app.asar', 'node_modules'))
    }
    candidates.push(path.join(this.mcpDir(), '..', 'node_modules'))
    if (process.env.NODE_PATH) candidates.push(process.env.NODE_PATH)
    return {
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: candidates.join(path.delimiter),
      ALBERT_COURSE_DIR: this.workspace,
      ALBERT_DATA_DIR: this.stateDir(),
      ...extra
    }
  }

  // Merge our two MCP servers into <workspace>/opencode.json (never clobbers
  // existing keys; unparseable files are backed up first).
  async ensureProjectConfig() {
    const mcp = this.mcpDir()
    const course = path.join(mcp, 'course-search', 'server.mjs')
    const memory = path.join(mcp, 'student-memory', 'server.mjs')
    if (!existsSync(course) || !existsSync(memory)) return false
    await fs.mkdir(this.stateDir(), { recursive: true })
    const entry = (server) => ({
      // opencode shape: single command ARRAY (binary + args, never separate
      // `args`), `environment` (not `env`), type 'local'. Anything else is
      // silently dropped — verified against the docs after a load failure.
      type: 'local',
      command: [process.execPath, server, this.workspace, this.stateDir()],
      environment: this.mcpRuntimeEnv(),
      enabled: true
    })
    const cfg = await this.readProjectConfig()
    cfg.mcp = cfg.mcp && typeof cfg.mcp === 'object' ? cfg.mcp : {}
    cfg.mcp['albert-course-search'] = entry(course)
    cfg.mcp['albert-student-memory'] = entry(memory)
    await this.writeProjectConfig(cfg)
    // Modes as native agents (per workspace, every boot/switch).
    await this.syncModeAgents().catch(() => {})
    return true
  }

  // One-line mastery brief appended to every tutor turn (same file the
  // student-memory MCP server maintains, so both stay in sync for free).
  async memoryBrief() {
    try {
      const raw = await fs.readFile(path.join(this.stateDir(), 'memory.json'), 'utf8')
      const mem = JSON.parse(raw)
      const ks = Object.keys(mem.topics || {})
      if (!ks.length) return ''
      const bits = ks.map((k) => {
        const t = mem.topics[k]
        const misc = (t.misconceptions || []).join('; ')
        return `${k}=${t.mastery ?? 0}/5${misc ? ` (watch: ${misc})` : ''}`
      })
      return `\nStudent mastery (0-5): ${bits.join(', ')}. Adapt difficulty; probe weak spots Socratically.`
    } catch {
      return ''
    }
  }

  // opencode ships as a real exe on npm-windows
  // (%APPDATA%/npm/node_modules/opencode-ai/bin/opencode.exe); PATH shims
  // (.cmd/.ps1) need a shell and orphan grandchildren on kill, so prefer exe.
  async resolveBinary() {
    if (process.env.OPENCODE_BIN) return { cmd: process.env.OPENCODE_BIN, shell: false }
    if (process.platform === 'win32') {
      const exe = path.join(
        process.env.APPDATA || '',
        'npm',
        'node_modules',
        'opencode-ai',
        'bin',
        'opencode.exe'
      )
      try {
        await fs.stat(exe)
        return { cmd: exe, shell: false }
      } catch {
        /* fall through to shim */
      }
      return { cmd: 'opencode.cmd', shell: true }
    }
    return { cmd: 'opencode', shell: false }
  }

  async start() {
    this.workspace = this.workspaceDir()
    await fs.mkdir(this.workspace, { recursive: true })
    await this.ensureProjectConfig().catch(() => {})
    // Dev attach mode (`npm run dev`): reuse the shared server instead of
    // spawning a private one, so restarts are instant and logs stay visible.
    const sharedUrl = process.env.ALBERT_SERVER_URL
    const sharedPw = process.env.ALBERT_SERVER_PASSWORD
    if (sharedUrl && sharedPw) {
      this.baseUrl = sharedUrl.replace(/\/$/, '')
      this.auth = 'Basic ' + Buffer.from(`opencode:${sharedPw}`).toString('base64')
      this.attached = true
      await this.waitHealthy(20000)
      this.pumpEvents()
      return this.status()
    }
    const password = randomBytes(24).toString('hex')
    this.auth = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64')
    const bin = await this.resolveBinary()
    this.spawnedViaShell = !!bin.shell
    let missing = null
    for (let port = 4123; port < 4173; port++) {
      const r = await this.trySpawn(bin, port, password)
      if (r.child) {
        this.child = r.child
        this.baseUrl = `http://127.0.0.1:${port}`
        try {
          await this.waitHealthy(45000)
          break
        } catch (e) {
          // Adopted child died mid-boot (slow bind failure) or never got
          // healthy: kill it and try the next port instead of giving up.
          if (e && e.childDied) {
            this.child = null
            this.baseUrl = null
            continue
          }
          this.stop() // don't orphan a slow starter
          throw e
        }
      }
      if (r.error) {
        missing = r.error
        break
      }
    }
    if (!this.child) {
      if (missing)
        throw new Error(
          'opencode binary not found — install it from opencode.ai and restart Alfred.'
        )
      throw new Error('could not start opencode serve (ports 4123-4172 busy?)')
    }
    this.pumpEvents()
    return this.status()
  }

  trySpawn(bin, port, password) {
    return new Promise((resolve) => {
      let settled = false
      const done = (v) => {
        if (!settled) {
          settled = true
          resolve(v)
        }
      }
      let child
      try {
        child = spawn(bin.cmd, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
          env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
          cwd: this.workspace,
          stdio: 'ignore',
          windowsHide: true,
          shell: bin.shell
        })
      } catch (e) {
        done({ error: e })
        return
      }
      child.on('error', (e) => done({ error: e }))
      child.on('exit', (code) => {
        if (!settled && code !== 0 && code !== null) done({ exited: code })
      })
      // Give a port conflict a moment to surface as an early exit.
      setTimeout(() => done(child.exitCode === null ? { child } : { exited: child.exitCode }), 600)
    })
  }

  async waitHealthy(timeoutMs) {
    const start = Date.now()
    for (;;) {
      // Adopted child died after the 600ms grace (slow bind failure): tell
      // the caller to move to the next port instead of waiting it out.
      if (this.child && this.child.exitCode !== null && this.child.exitCode !== undefined) {
        const err = new Error('adopted child exited during boot')
        err.childDied = true
        throw err
      }
      try {
        const r = await fetch(`${this.baseUrl}/global/health`, {
          headers: { Authorization: this.auth },
          signal: AbortSignal.timeout(2000)
        })
        if (r.ok) {
          const j = await r.json()
          this.version = j.version || null
          return
        }
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) throw new Error('opencode health check timed out')
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  // opts.global skips the ?directory= scope (session list, projects, agents
  // are cross-repo; the server ignores the param on global routes anyway).
  async api(method, path, body, opts = {}) {
    const url =
      opts.global || !this.workspace
        ? `${this.baseUrl}${path}`
        : `${this.baseUrl}${path}${path.includes('?') ? '&' : '?'}directory=${encodeURIComponent(this.workspace)}`
    const r = await fetch(url, {
      method,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000)
    })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON */
    }
    if (!r.ok) {
      const msg = (json && (json.message || json.error)) || text || `HTTP ${r.status}`
      throw new Error(typeof msg === 'string' ? msg.slice(0, 300) : `HTTP ${r.status}`)
    }
    return json
  }

  async status() {
    if (!this.baseUrl) return { running: false }
    try {
      const providers = await this.api('GET', '/provider')
      const connected = providers.connected || []
      let free = 0
      for (const p of providers.all || []) {
        if (!connected.includes(p.id)) continue
        for (const [mid, def] of Object.entries(p.models || {})) {
          if (isFreeModel(p.id, mid, def)) free++
        }
      }
      return {
        running: true,
        version: this.version,
        workspace: this.workspace,
        hostname: os.hostname(),
        gitBranch: this.gitBranch(),
        connected,
        freeModels: free
      }
    } catch (e) {
      return { running: false, error: e.message }
    }
  }

  gitBranch() {
    try {
      const out = execFileSync('git', ['branch', '--show-current'], {
        cwd: this.workspace,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return String(out).trim() || null
    } catch {
      return null
    }
  }

  gitRoot(dir) {
    try {
      const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: dir || this.workspace,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return String(out).trim() || null
    } catch {
      return null
    }
  }

  // Detect GitHub owner and repo from git remote origin URL.
  _getGithubRepo(root) {
    try {
      const out = String(
        execFileSync('git', ['config', '--get', 'remote.origin.url'], {
          cwd: root,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 3000
        }) || ''
      ).trim()
      const m = out.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i)
      if (m) return { owner: m[1], repo: m[2] }
    } catch {}
    return null
  }

  // Fetch actual GitHub avatars for repo authors via GitHub API and cache them.
  async _syncGithubAvatars(root) {
    const gh = this._getGithubRepo(root)
    if (!gh) return
    const key = `${gh.owner}/${gh.repo}`
    if (!this._avatarCache) this._avatarCache = new Map()
    if (!this._ghRepoCache) this._ghRepoCache = new Map()
    const cached = this._ghRepoCache.get(key)
    const now = Date.now()
    if (cached && now - cached.fetchedAt < 5 * 60 * 1000) return
    this._ghRepoCache.set(key, { fetchedAt: now })

    if (gh.owner) {
      this._avatarCache.set(
        gh.owner.toLowerCase(),
        `https://avatars.githubusercontent.com/${gh.owner}?s=80`
      )
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${gh.owner}/${gh.repo}/commits?per_page=40`,
        {
          headers: { 'User-Agent': 'Alfred' }
        }
      )
      if (res.ok) {
        const commits = await res.json()
        if (Array.isArray(commits)) {
          for (const c of commits) {
            const avatar = c.author?.avatar_url
            if (avatar) {
              if (c.author?.login) this._avatarCache.set(c.author.login.toLowerCase(), avatar)
              if (c.commit?.author?.email)
                this._avatarCache.set(c.commit.author.email.toLowerCase(), avatar)
              if (c.commit?.author?.name)
                this._avatarCache.set(c.commit.author.name.toLowerCase(), avatar)
            }
          }
        }
      }
    } catch {}

    try {
      const res = await fetch(
        `https://api.github.com/repos/${gh.owner}/${gh.repo}/contributors?per_page=30`,
        {
          headers: { 'User-Agent': 'Alfred' }
        }
      )
      if (res.ok) {
        const contribs = await res.json()
        if (Array.isArray(contribs)) {
          for (const c of contribs) {
            if (c.login && c.avatar_url) {
              this._avatarCache.set(c.login.toLowerCase(), c.avatar_url)
            }
          }
        }
      }
    } catch {}
  }

  // Derive a GitHub / Gravatar avatar URL from an email address and name.
  _avatarFor(email, name, ghOwner) {
    const e = String(email || '')
      .trim()
      .toLowerCase()
    const n = String(name || '').trim()

    // 1. Check in-memory avatar cache (populated from GitHub API)
    if (this._avatarCache) {
      if (e && this._avatarCache.has(e)) return this._avatarCache.get(e)
      if (n && this._avatarCache.has(n.toLowerCase())) return this._avatarCache.get(n.toLowerCase())
    }

    // 2. Noreply GitHub email patterns
    if (e) {
      const ghIdMatch = e.match(/^(\d+)\+([^@]+)@users\.noreply\.github\.com$/)
      if (ghIdMatch) return `https://avatars.githubusercontent.com/u/${ghIdMatch[1]}?v=4&s=80`

      const ghUserMatch = e.match(/^([^@]+)@users\.noreply\.github\.com$/)
      if (ghUserMatch) return `https://avatars.githubusercontent.com/${ghUserMatch[1]}?s=80`
    }

    // 3. If author name matches repo owner or looks like a GitHub username (no spaces)
    if (ghOwner && n && ghOwner.toLowerCase() === n.toLowerCase()) {
      return `https://avatars.githubusercontent.com/${ghOwner}?s=80`
    }
    if (n && /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(n)) {
      return `https://avatars.githubusercontent.com/${n}?s=80`
    }

    // 4. Gravatar fallback
    if (e) {
      const hash = createHash('md5').update(e).digest('hex')
      return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`
    }
    return null
  }

  // Git status for the right panel. Runs inside the given directory's repo
  // root (read-only git verbs); anything failing (no git, not a repo) →
  // { repo: false }. dir defaults to the workspace; callers pass a session's
  // directory to scope the panel/composer to that thread's repo.
  async gitInfo(dir) {
    const root = this.gitRoot(dir)
    if (!root) return { repo: false, dir: dir || null }
    const run = (args) =>
      String(
        execFileSync('git', args, {
          cwd: root,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 15000
        }) || ''
      )
    try {
      const gh = this._getGithubRepo(root)
      // Background sync GitHub avatars (non-blocking)
      this._syncGithubAvatars(root).catch(() => {})

      const branch = run(['branch', '--show-current']).trim() || null
      // Local + remote branch names for the commit form dropdowns.
      let branches = []
      try {
        branches = run(['branch', '--format=%(refname:short)'])
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      } catch {
        /* no branches yet */
      }
      let remoteBranches = []
      try {
        const seen = new Set()
        for (const line of run(['branch', '-r', '--format=%(refname:short)']).split('\n')) {
          const t = line.trim()
          if (!t || t.endsWith('/HEAD')) continue
          const name = t.includes('/') ? t.slice(t.indexOf('/') + 1) : t
          if (name && !seen.has(name)) {
            seen.add(name)
            remoteBranches.push(name)
          }
        }
      } catch {
        /* no remotes */
      }
      const status = run(['status', '--porcelain=v1', '-uall', '-b'])
      let ahead = 0
      let behind = 0
      try {
        const ab = run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
          .trim()
          .split(/\s+/)
        ahead = Number(ab[0]) || 0
        behind = Number(ab[1]) || 0
      } catch {
        /* no upstream */
      }

      // Unstaged diff lines per file
      const unstagedStats = new Map()
      try {
        const out = run(['diff', '--numstat'])
        for (const line of out.split('\n')) {
          if (!line.trim()) continue
          const [add, del, ...p] = line.split('\t')
          const path = p.join('\t')
          unstagedStats.set(path, {
            additions: add === '-' ? 0 : Number(add) || 0,
            deletions: del === '-' ? 0 : Number(del) || 0
          })
        }
      } catch {}

      // Staged diff lines per file
      const stagedStats = new Map()
      try {
        const out = run(['diff', '--cached', '--numstat'])
        for (const line of out.split('\n')) {
          if (!line.trim()) continue
          const [add, del, ...p] = line.split('\t')
          const path = p.join('\t')
          stagedStats.set(path, {
            additions: add === '-' ? 0 : Number(add) || 0,
            deletions: del === '-' ? 0 : Number(del) || 0
          })
        }
      } catch {}

      const files = []
      for (const line of status.split('\n')) {
        if (!line || line.startsWith('##')) continue
        const x = line[0]
        const y = line[1]
        let p = line.slice(3)
        // Renames: "R  old -> new" — track the new path.
        const arrow = p.indexOf(' -> ')
        if (arrow !== -1) p = p.slice(arrow + 4)
        // Quoted paths (spaces/unicode): dequote simply.
        if (p.startsWith('"') && p.endsWith('"')) {
          try {
            p = JSON.parse(p)
          } catch {
            /* keep raw */
          }
        }
        const uStat = unstagedStats.get(p)
        const sStat = stagedStats.get(p)
        files.push({
          path: p,
          staged: x !== ' ' && x !== '?' ? x : '',
          unstaged: y !== ' ' && y !== '?' ? y : '',
          untracked: x === '?' && y === '?',
          stagedAdditions: sStat?.additions || 0,
          stagedDeletions: sStat?.deletions || 0,
          unstagedAdditions: uStat?.additions || 0,
          unstagedDeletions: uStat?.deletions || 0
        })
      }
      let log = []
      try {
        const raw = run([
          'log',
          '-15',
          '--format=%x1e%H%x1f%h%x1f%aN%x1f%aE%x1f%ar%x1f%s',
          '--numstat'
        ])
        let cur = null
        for (const line of raw.split('\n')) {
          if (line.startsWith('\x1e')) {
            const [hash, short, author, email, ago, ...msg] = line.slice(1).split('\x1f')
            cur = {
              hash,
              short,
              author,
              email,
              ago,
              msg: msg.join('\x1f'),
              avatar: this._avatarFor(email, author, gh?.owner),
              additions: 0,
              deletions: 0,
              files: 0
            }
            log.push(cur)
            continue
          }
          if (!cur || !line.trim()) continue
          const parts = line.split('\t')
          if (parts.length < 3) continue
          const add = parts[0] === '-' ? 0 : Number(parts[0]) || 0
          const del = parts[1] === '-' ? 0 : Number(parts[1]) || 0
          cur.additions += add
          cur.deletions += del
          cur.files++
        }
      } catch {
        /* no commits yet */
      }
      return { repo: true, root, branch, branches, remoteBranches, ahead, behind, files, log }
    } catch {
      return { repo: false }
    }
  }

  // Unified diff for one file (capped). staged=true diffs the index.
  gitDiff(relPath, staged, dir) {
    const root = this.gitRoot(dir)
    if (!root) throw new Error('not a git repository')
    const args = ['diff', '--no-color', '--unified=3']
    if (staged) args.push('--cached')
    args.push('--', String(relPath || ''))
    const out = String(
      execFileSync('git', args, {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024
      }) || ''
    )
    const capped = out.length > 100000
    return { diff: capped ? out.slice(0, 100000) : out, truncated: capped }
  }

  // Switch branches (optionally creating). Errors surface (e.g. dirty tree).
  gitCheckout(branch, create, dir) {
    const root = this.gitRoot(dir)
    if (!root) throw new Error('Not a git repository')
    const name = String(branch || '').trim()
    if (!name) throw new Error('Branch name is required')
    const opts = { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }
    try {
      if (create) {
        try {
          execFileSync('git', ['checkout', '-b', name], opts)
        } catch {
          // Already exists — just switch to it.
          execFileSync('git', ['checkout', name], opts)
        }
      } else {
        execFileSync('git', ['checkout', name], opts)
      }
      const cur = String(execFileSync('git', ['branch', '--show-current'], opts) || '').trim()
      return { branch: cur || name }
    } catch (err) {
      const msg = err.stderr ? String(err.stderr).trim() : err.message || String(err)
      throw new Error(msg.split('\n').filter(Boolean).slice(-2).join(' '))
    }
  }

  // Commit and/or push with branch creation and PR opening support.
  async gitCommitAction(opts = {}, dir) {
    const root = this.gitRoot(dir)
    if (!root) throw new Error('Not a git repository')
    const run = (args) =>
      String(
        execFileSync('git', args, {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000
        }) || ''
      )

    const {
      message,
      description = '',
      newBranch,
      push = false,
      pushBranch = '',
      createPr = false,
      prTitle = '',
      stageAll = false
    } = opts

    if (!message || !message.trim()) {
      throw new Error('Commit message is required')
    }

    try {
      // 1. Branch checkout / creation if requested
      let curBranch = run(['branch', '--show-current']).trim()
      if (newBranch && newBranch.trim() && newBranch.trim() !== curBranch) {
        const nb = newBranch.trim()
        try {
          run(['checkout', '-b', nb])
          curBranch = nb
        } catch {
          // If branch already exists, switch to it
          run(['checkout', nb])
          curBranch = nb
        }
      }

      // 2. Stage files if nothing is staged or stageAll requested
      let stagedCount = 0
      try {
        const stagedOut = run(['diff', '--cached', '--name-only']).trim()
        stagedCount = stagedOut ? stagedOut.split('\n').filter(Boolean).length : 0
      } catch {}

      if (stagedCount === 0 || stageAll) {
        run(['add', '-A'])
      }

      // 3. Commit
      const commitArgs = ['commit', '-m', message.trim()]
      if (description && description.trim()) {
        commitArgs.push('-m', description.trim())
      }
      run(commitArgs)

      // 4. Push if requested (HEAD -> pushBranch, defaults to the commit branch)
      let pushedTo = null
      if (push) {
        curBranch = run(['branch', '--show-current']).trim()
        const target = String(pushBranch || '').trim() || curBranch
        try {
          run(['push', 'origin', `HEAD:${target}`])
        } catch {
          // If upstream not set, push with -u
          run(['push', '-u', 'origin', `HEAD:${target}`])
        }
        pushedTo = target
      }

      // 5. Build PR URL if requested
      let prUrl = null
      if (createPr && push) {
        const gh = this._getGithubRepo(root)
        if (gh) {
          const head = pushedTo || run(['branch', '--show-current']).trim()
          prUrl = `https://github.com/${gh.owner}/${gh.repo}/compare/${head}?expand=1&title=${encodeURIComponent(prTitle || message.trim())}&body=${encodeURIComponent(description || '')}`
        }
      }

      return {
        success: true,
        branch: curBranch,
        pushedTo,
        prUrl
      }
    } catch (err) {
      const msg = err.stderr ? String(err.stderr).trim() : err.message || String(err)
      throw new Error(msg)
    }
  }

  // Generate an AI-assisted commit message, description, branch name, and PR title from diff.
  async gitGenerateCommit(dir) {
    const root = this.gitRoot(dir)
    if (!root) throw new Error('Not a git repository')
    const run = (args) => {
      try {
        return String(
          execFileSync('git', args, {
            cwd: root,
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15000
          }) || ''
        )
      } catch {
        return ''
      }
    }

    let diff = run(['diff', '--cached'])
    if (!diff.trim()) diff = run(['diff'])
    const status = run(['status', '--short'])
    const numstat = run(['diff', '--stat'])

    const files = status
      .split('\n')
      .filter(Boolean)
      .map((l) => l.slice(3).trim())
    let type = 'feat'
    let scope = ''

    const isDoc = files.length > 0 && files.every((f) => f.endsWith('.md') || f.includes('docs/'))
    const isTest = files.length > 0 && files.every((f) => f.includes('test') || f.includes('spec'))
    const isStyle =
      files.length > 0 && files.every((f) => f.endsWith('.css') || f.endsWith('.scss'))
    const isChore =
      files.length > 0 &&
      files.every((f) => f.includes('package') || f.includes('.gitignore') || f.includes('.config'))

    if (isDoc) type = 'docs'
    else if (isTest) type = 'test'
    else if (isStyle) type = 'style'
    else if (isChore) type = 'chore'
    else if (diff.includes('fix') || diff.includes('bug') || diff.includes('error')) type = 'fix'

    if (files.some((f) => f.includes('GitPanel') || f.includes('git'))) scope = 'git'
    else if (files.some((f) => f.includes('Navbar') || f.includes('Sidebar') || f.includes('ui')))
      scope = 'ui'
    else if (files.some((f) => f.includes('main') || f.includes('preload'))) scope = 'core'
    else if (files.some((f) => f.includes('mcp'))) scope = 'mcp'

    const changedSummary = files
      .slice(0, 3)
      .map((f) => path.basename(f))
      .join(', ')
    const mainAction =
      type === 'feat' ? 'add' : type === 'fix' ? 'fix' : type === 'docs' ? 'update' : 'update'
    const scopeStr = scope ? `(${scope})` : ''

    // Attempt AI completion via OpenCode server if available
    try {
      const models = await this.models().catch(() => null)
      const model = models?.free?.[0] || models?.paid?.[0]
      if (model && this.baseUrl) {
        const session = await this.api(
          'POST',
          '/session',
          { title: 'commit-gen' },
          { global: true }
        )
        if (session?.id) {
          const prompt = `Analyze this git diff and output ONLY a JSON object in this exact format (no markdown, no quotes around json, raw json):
{"title": "${type}${scopeStr}: short summary under 60 chars", "description": "1-2 bullet points of changes", "branch": "${type}/${scope || 'update'}-changes", "prTitle": "${type}${scopeStr}: PR summary"}

Git changes:
${(numstat || diff).slice(0, 3000)}`

          await this.api('POST', `/session/${session.id}/prompt_async`, {
            model: { providerID: model.providerID, modelID: model.modelID },
            parts: [{ type: 'text', text: prompt }],
            textOnly: true
          })

          for (let i = 0; i < 8; i++) {
            await new Promise((r) => setTimeout(r, 500))
            const msgs = await this.api('GET', `/session/${session.id}/message`)
            const arr = Array.isArray(msgs) ? msgs : msgs?.messages || []
            const assistant = arr.find((m) => m.role === 'assistant' && (m.parts?.length || m.text))
            if (assistant) {
              const text =
                assistant.text || assistant.parts?.map((p) => p.text || '').join('') || ''
              const match = text.match(/\{[\s\S]*\}/)
              if (match) {
                const parsed = JSON.parse(match[0])
                if (parsed.title) {
                  return {
                    title: parsed.title,
                    description: parsed.description || '',
                    branch: parsed.branch || `${type}/${scope || 'update'}-changes`,
                    prTitle: parsed.prTitle || parsed.title
                  }
                }
              }
            }
          }
        }
      }
    } catch {}

    // Smart semantic fallback
    return {
      title: `${type}${scopeStr}: ${mainAction} changes in ${changedSummary || 'workspace'}`,
      description: files.length > 0 ? `Changes:\n${files.map((f) => `- ${f}`).join('\n')}` : '',
      branch: `${type}/${scope || 'feature'}-${Date.now().toString().slice(-4)}`,
      prTitle: `${type}${scopeStr}: ${mainAction} ${scope || 'updates'} in ${changedSummary || 'workspace'}`
    }
  }

  // Contributors for the People tab: commits + lines + weekly sparkline,
  // with Gravatar / GitHub avatar URLs derived from author emails and names.
  async gitContributors(dir) {
    const root = this.gitRoot(dir)
    if (!root) return { repo: false, contributors: [] }
    const gh = this._getGithubRepo(root)
    // Await sync if needed so contributors get their actual GitHub pictures
    await this._syncGithubAvatars(root).catch(() => {})

    const run = (args) =>
      String(
        execFileSync('git', args, {
          cwd: root,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 30000,
          maxBuffer: 16 * 1024 * 1024
        }) || ''
      )
    try {
      // One pass: author identity + date headers, then numstat rows.
      const raw = run([
        'log',
        '--all',
        '--no-merges',
        '--pretty=format:%x1e%aN%x1f%aE%x1f%aI',
        '--numstat',
        '--since=2.years.ago'
      ])
      const byKey = new Map()
      let cur = null
      const weekKey = (iso) => {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return null
        // Monday-based week index as YYYY-WW for bucketing.
        const day = (d.getUTCDay() + 6) % 7
        d.setUTCDate(d.getUTCDate() - day)
        d.setUTCHours(0, 0, 0, 0)
        return d.toISOString().slice(0, 10)
      }
      // Last 16 weeks of buckets (oldest → newest).
      const weeks = []
      {
        const d = new Date()
        const day = (d.getUTCDay() + 6) % 7
        d.setUTCDate(d.getUTCDate() - day)
        d.setUTCHours(0, 0, 0, 0)
        for (let i = 15; i >= 0; i--) {
          const w = new Date(d)
          w.setUTCDate(w.getUTCDate() - i * 7)
          weeks.push(w.toISOString().slice(0, 10))
        }
      }
      const weekIndex = new Map(weeks.map((w, i) => [w, i]))

      for (const line of raw.split('\n')) {
        if (line.startsWith('\x1e')) {
          const [name, email, iso] = line.slice(1).split('\x1f')
          const key = `${(email || '').trim().toLowerCase()}|${(name || '').trim()}`
          if (!byKey.has(key)) {
            byKey.set(key, {
              name: (name || 'Unknown').trim() || 'Unknown',
              email: (email || '').trim(),
              commits: 0,
              additions: 0,
              deletions: 0,
              weeks: Array(16).fill(0)
            })
          }
          cur = byKey.get(key)
          cur.commits++
          const wk = weekKey(iso)
          if (wk && weekIndex.has(wk)) cur.weeks[weekIndex.get(wk)]++
          continue
        }
        if (!cur || !line.trim()) continue
        // numstat: additions \t deletions \t path (binary: - \t - \t path)
        const parts = line.split('\t')
        if (parts.length < 3) continue
        const add = parts[0] === '-' ? 0 : Number(parts[0]) || 0
        const del = parts[1] === '-' ? 0 : Number(parts[1]) || 0
        cur.additions += add
        cur.deletions += del
      }

      const contributors = [...byKey.values()]
        .map((c) => ({
          ...c,
          avatar: this._avatarFor(c.email, c.name, gh?.owner),
          lines: c.additions + c.deletions,
          net: c.additions - c.deletions
        }))
        .sort((a, b) => b.commits - a.commits || b.lines - a.lines)
        .slice(0, 40)

      const totalCommits = contributors.reduce((s, c) => s + c.commits, 0)
      const totalLines = contributors.reduce((s, c) => s + c.lines, 0)
      for (const c of contributors) {
        c.share = totalCommits > 0 ? Math.round((c.commits / totalCommits) * 1000) / 10 : 0
        c.lineShare = totalLines > 0 ? Math.round((c.lines / totalLines) * 1000) / 10 : 0
      }
      return {
        repo: true,
        root,
        contributors,
        totalCommits,
        totalAdditions: contributors.reduce((s, c) => s + c.additions, 0),
        totalDeletions: contributors.reduce((s, c) => s + c.deletions, 0),
        weeks
      }
    } catch {
      return { repo: false, contributors: [] }
    }
  }

  // Switch the workspace (project directory) live: future requests + the SSE
  // stream scope to it. Sessions from the old workspace stay valid server-side
  // but the UI remaps lazily (stale ids self-heal on next send).
  async setWorkspace(dir) {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) throw new Error('not a directory')
    this.workspace = dir
    await this.ensureProjectConfig().catch(() => {})
    try {
      this.sseAbort?.abort()
    } catch {
      /* pump reconnects on the new directory */
    }
    return this.status()
  }

  async models() {
    const providers = await this.api('GET', '/provider')
    const connected = new Set(providers.connected || [])
    const shape = (p, mid, def) => ({
      providerID: p.id,
      modelID: mid,
      name: def.name || mid,
      limit: def.limit?.context || 0,
      attachment: !!def.capabilities?.attachment,
      variants: Object.keys(def.variants || {})
    })
    const free = []
    const paid = []
    for (const p of providers.all || []) {
      if (!connected.has(p.id)) continue
      for (const [mid, def] of Object.entries(p.models || {})) {
        ;(isFreeModel(p.id, mid, def) ? free : paid).push(shape(p, mid, def))
      }
    }
    // Default first: opencode/big-pickle, then opencode/*, then alphabetical.
    const rank = (m) =>
      m.providerID === 'opencode' && m.modelID === 'big-pickle'
        ? 0
        : m.providerID === 'opencode'
          ? 1
          : 2
    free.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    paid.sort((a, b) => a.providerID.localeCompare(b.providerID) || a.name.localeCompare(b.name))
    return { connected: [...connected], free, paid, version: this.version }
  }

  // Session titles belong to the server: created untitled, the server's
  // title agent names them after the first turn (via `session.updated`).
  // Native mode agents depend on the server having (re)loaded the workspace
  // opencode.json — a long-running serve predating the sync won't list them.
  // Probe the live agent list (cached) and only send `agent` when the server
  // knows it; otherwise the turn carries the full inline pack, so a stale
  // server degrades to working instead of failing "Agent not found".
  // (Verified: omitting `agent` is safe even on sessions created with an
  // unknown one — resolution falls back instead of poisoning the session.)
  async hasAgent(agent) {
    if (!agent) return false
    const now = Date.now()
    if (!this.agentCache || now - this.agentCache.at > 30000) {
      try {
        const list = await this.listAgents()
        this.agentCache = {
          at: now,
          set: new Set((list || []).map((a) => a.name || a.id).filter(Boolean))
        }
      } catch {
        return false
      }
    }
    return this.agentCache.set.has(agent)
  }

  // agent selects the native primary agent (Alfred mode) when known;
  // parentID links a child thread (see getChildren).
  async createSession({ agent, parentID } = {}) {
    const body = {}
    if (agent && (await this.hasAgent(agent))) body.agent = agent
    if (parentID) body.parentID = parentID
    return this.api('POST', '/session', body)
  }

  // Cross-repo listing: no ?directory= scope, newest first. Powers the
  // sidebar; every repo (and the TUI) shares this one server store.
  listSessions({ search, limit } = {}) {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (limit) q.set('limit', String(limit))
    const qs = q.toString()
    return this.api('GET', `/session${qs ? `?${qs}` : ''}`, null, { global: true })
  }

  listProjects() {
    return this.api('GET', '/project', null, { global: true })
  }

  listAgents() {
    return this.api('GET', '/agent', null, { global: true })
  }

  getMessages(sessionID, { limit, before } = {}) {
    const q = new URLSearchParams()
    if (limit) q.set('limit', String(limit))
    if (before) q.set('before', before)
    const qs = q.toString()
    return this.api('GET', `/session/${sessionID}/message${qs ? `?${qs}` : ''}`)
  }

  getSessionTodos(sessionID) {
    return this.api('GET', `/session/${sessionID}/todo`)
  }

  forkSession(sessionID, messageID) {
    return this.api('POST', `/session/${sessionID}/fork`, messageID ? { messageID } : {})
  }

  getChildren(sessionID) {
    return this.api('GET', `/session/${sessionID}/children`)
  }

  // Manual renames write through so the server stays the source of truth.
  updateSessionTitle(sessionID, title) {
    return this.api('PATCH', `/session/${sessionID}`, { title })
  }

  async // Shared file-part builder (prompt + command). Returns null for text
  // attachments, which only prompt_async accepts as text parts.
  toFilePart(a) {
    if ((a.kind === 'image' || a.kind === 'pdf') && a.url) {
      const mime = a.kind === 'pdf' ? 'application/pdf' : a.mime || 'image/jpeg'
      const fallback = a.kind === 'pdf' ? 'document.pdf' : 'image.jpg'
      return { type: 'file', mime, filename: a.filename || fallback, url: a.url }
    }
    let abs = null
    if (a.kind === 'filepath' && a.path) abs = String(a.path)
    else if (a.kind === 'ref' && a.path) abs = path.join(this.workspace, a.path)
    if (!abs) return null
    return {
      type: 'file',
      mime: mimeForPath(a.path),
      filename: a.filename || a.path,
      url: 'file:///' + abs.replace(/\\/g, '/')
    }
  }

  async prompt(
    sessionID,
    { providerID, modelID, agent, text, attachments = [], variant = '', textOnly = false }
  ) {
    const parts = [{ type: 'text', text }]
    for (const a of attachments) {
      if (a.kind === 'text') {
        parts.push({
          type: 'text',
          text: `Attached file ${a.filename || 'file'}:\n${a.text || ''}`
        })
      } else {
        const fp = this.toFilePart(a)
        if (fp) parts.push(fp)
      }
    }
    const pr = await this.prompts()
    // With a native mode agent carrying soul+system, the turn only adds the
    // dynamic memory brief; without one (or when the server doesn't know it
    // yet) the full pack rides along.
    const useAgent = agent && (await this.hasAgent(agent)) ? agent : ''
    const brief = await this.memoryBrief()
    const system = useAgent ? brief : pr.soul + '\n' + pr.system + brief
    const body = {
      model: { providerID, modelID },
      ...(useAgent ? { agent: useAgent } : {}),
      ...(variant ? { variant } : {}),
      ...(system.trim() ? { system } : {}),
      parts
    }
    // Text-only fallback (e.g. small models emitting clashing tool-call ids):
    // disable every known tool so the provider just does completion.
    if (textOnly) body.tools = await this.disabledTools()
    return this.api('POST', `/session/${sessionID}/prompt_async`, body)
  }

  // { toolName: false, ... } built from the live tool catalog (never hardcoded).
  async disabledTools() {
    if (!this.noTools) {
      const ids = await this.api('GET', '/experimental/tool/ids')
      this.noTools = Object.fromEntries((Array.isArray(ids) ? ids : []).map((id) => [id, false]))
    }
    return this.noTools
  }

  async commands() {
    const list = await this.api('GET', '/command')
    return Array.isArray(list) ? list : list.commands || list.items || []
  }

  // Slash commands (POST is synchronous: it waits for the full response, but
  // SSE part updates still stream through the shared pump in parallel).
  // Only file parts are accepted here — text attachments are dropped by the UI.
  async command(sessionID, { command, args, model, variant, attachments = [] }) {
    const parts = []
    for (const a of attachments) {
      const fp = this.toFilePart(a)
      if (fp) parts.push(fp)
    }
    const body = { command, arguments: args || '' }
    // NOTE: unlike prompt_async, command wants model as a "provider/model" string.
    if (model?.providerID) body.model = `${model.providerID}/${model.modelID}`
    if (variant) body.variant = variant
    if (parts.length) body.parts = parts
    return this.api('POST', `/session/${sessionID}/command`, body)
  }

  abort(sessionID) {
    return this.api('POST', `/session/${sessionID}/abort`)
  }

  findFiles(query) {
    return this.api('GET', `/find/file?query=${encodeURIComponent(query || '')}`)
  }

  listFiles(dir) {
    return this.api('GET', `/file?path=${encodeURIComponent(dir || '')}`)
  }

  // Raw bytes for the preview pane. Jailed to the workspace: absolute paths
  // and escapes are rejected so the renderer can never read outside it.
  async readWorkspaceFile(relPath) {
    const abs = path.resolve(this.workspace, String(relPath || ''))
    const rel = path.relative(this.workspace, abs)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('path escapes the workspace')
    }
    const stat = await fs.stat(abs)
    if (!stat.isFile()) throw new Error('not a file')
    if (stat.size > 8 * 1024 * 1024) throw new Error('file too large to preview (8MB cap)')
    const buf = await fs.readFile(abs)
    return { mime: mimeForPath(abs), base64: buf.toString('base64'), size: stat.size }
  }

  // Student memory file for the knowledge graph (same file the MCP server
  // maintains — read-only here, the agent writes through its tools).
  async memory() {
    try {
      const raw = await fs.readFile(path.join(this.stateDir(), 'memory.json'), 'utf8')
      const mem = JSON.parse(raw)
      return mem && typeof mem === 'object' ? mem : { topics: {} }
    } catch {
      return { topics: {} }
    }
  }

  // opencode's global config dir (~/.config/opencode — same path the server
  // logs as its config source). OPENCODE_TEST_HOME swaps homedir for tests.
  globalConfigDir() {
    const home = process.env.OPENCODE_TEST_HOME || os.homedir()
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode')
  }

  // Prefer an existing global config file so we never shadow the user's own
  // (opencode loads config.json / opencode.json / opencode.jsonc).
  globalConfigPath() {
    const dir = this.globalConfigDir()
    for (const name of ['opencode.json', 'config.json', 'opencode.jsonc']) {
      if (existsSync(path.join(dir, name))) return path.join(dir, name)
    }
    return path.join(dir, 'opencode.json')
  }

  // Config files (project or global) with // comment tolerance.
  // Unparseable files are backed up and reset — never crash on them.
  projectConfigPath() {
    return path.join(this.workspace, 'opencode.json')
  }

  async readConfigFile(cfgPath) {
    let raw = null
    try {
      raw = await fs.readFile(cfgPath, 'utf8')
    } catch {
      /* fresh */
    }
    if (!raw) return {}
    try {
      const cfg = JSON.parse(raw)
      return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {}
    } catch {
      try {
        const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''))
        return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {}
      } catch {
        try {
          await fs.writeFile(cfgPath + '.bak', raw)
        } catch {
          /* best effort */
        }
        return {}
      }
    }
  }

  async writeConfigFile(cfgPath, cfg) {
    await fs.mkdir(path.dirname(cfgPath), { recursive: true })
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2))
  }

  async readProjectConfig() {
    return this.readConfigFile(this.projectConfigPath())
  }

  async writeProjectConfig(cfg) {
    return this.writeConfigFile(this.projectConfigPath(), cfg)
  }

  // Soul + system prompts (Settings tabs) and modes. Stored per workspace in
  // opencode.json under the `alfred` key (opencode ignores unknown keys);
  // missing/blank fields fall back to the baked-in defaults. Legacy shape
  // ({ soul, system }) is read as a study override.
  async readPromptsFile() {
    const cfg = await this.readProjectConfig()
    const pack = cfg.alfred && typeof cfg.alfred === 'object' ? cfg.alfred : null
    if (pack) return pack
    // One-time import from the retired <workspace>/.albert/prompts.json.
    try {
      const raw = await fs.readFile(path.join(this.workspace, '.albert', 'prompts.json'), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        await this.writePromptsFile(parsed)
        try {
          await fs.unlink(path.join(this.workspace, '.albert', 'prompts.json'))
        } catch {
          /* best effort */
        }
        // Legacy file consumed after this read; sync its modes as agents.
        // (Safe: the file is gone, so syncModeAgents -> prompts() won't loop.)
        await this.syncModeAgents().catch(() => {})
        return parsed
      }
    } catch {
      /* no legacy file */
    }
    return {}
  }

  async writePromptsFile(file) {
    const rest = { ...file }
    delete rest.soul
    delete rest.system // legacy top-level keys never written back
    const cfg = await this.readProjectConfig()
    cfg.alfred = { activeMode: 'opencode', overrides: {}, customModes: {}, ...rest }
    await this.writeProjectConfig(cfg)
  }

  async prompts() {
    const file = await this.readPromptsFile()
    const customs = file.customModes && typeof file.customModes === 'object' ? file.customModes : {}
    const overrides = file.overrides && typeof file.overrides === 'object' ? file.overrides : {}
    if (
      (typeof file.soul === 'string' && file.soul.trim()) ||
      (typeof file.system === 'string' && file.system.trim())
    ) {
      overrides.study = {
        ...(typeof file.soul === 'string' && file.soul.trim() ? { soul: file.soul } : {}),
        ...(typeof file.system === 'string' && file.system.trim() ? { system: file.system } : {}),
        ...(overrides.study || {})
      }
    }
    const modes = [
      ...DEFAULT_MODES.map((m) => {
        const o = overrides[m.id] && typeof overrides[m.id] === 'object' ? overrides[m.id] : {}
        const soul = typeof o.soul === 'string' && o.soul.trim() ? o.soul : m.soul
        const system = typeof o.system === 'string' && o.system.trim() ? o.system : m.system
        return {
          id: m.id,
          name: m.name,
          builtin: true,
          soul,
          system,
          defaultSoul: m.soul,
          defaultSystem: m.system,
          overridden: soul !== m.soul || system !== m.system
        }
      }),
      ...Object.entries(customs)
        .filter(([, c]) => c && typeof c === 'object')
        .map(([id, c]) => ({
          id,
          name: String(c.name || id),
          builtin: false,
          soul: typeof c.soul === 'string' ? c.soul : '',
          system: typeof c.system === 'string' ? c.system : '',
          defaultSoul: '',
          defaultSystem: '',
          overridden: true
        }))
    ]
    let activeMode = typeof file.activeMode === 'string' ? file.activeMode : 'opencode'
    if (!modes.some((m) => m.id === activeMode)) activeMode = 'opencode'
    const active = modes.find((m) => m.id === activeMode)
    return {
      soul: active.soul,
      system: active.system,
      defaultSoul: active.defaultSoul,
      defaultSystem: active.defaultSystem,
      customSoul: active.overridden,
      customSystem: active.overridden,
      activeMode,
      activeBuiltin: active.builtin,
      modes: modes.map(({ id, name, builtin, soul, system }) => ({
        id,
        name,
        builtin,
        soul,
        system
      }))
    }
  }

  // Alfred modes as native opencode primary agents (mode id -> agent id).
  // Synced into the GLOBAL opencode config on purpose: the server resolves a
  // session's project by git worktree (frozen at first sight — a moved folder
  // keeps pointing at the old path), so per-project agent keys are missed
  // whenever the worktree doesn't match the workspace. Global agents resolve
  // for every session on this machine; turns, the TUI, and every other client
  // share them. Only `alfred-*` keys are managed — user agents untouched.
  // The per-turn `system` then carries just the dynamic memory brief, with a
  // full-inline fallback (see hasAgent) when the server hasn't reloaded yet.
  modeAgentId(modeId) {
    return `alfred-${modeId}`
  }

  // Pack text per mode; empty means "plain opencode" — no agent entity at
  // all (the server skips prompt-less agents, and none is needed: turns
  // simply send no agent and no system prompt).
  packText(m) {
    return `${m.soul || ''}\n${m.system || ''}`.trim()
  }

  packModeAgents(p) {
    const agent = {}
    for (const m of p.modes) {
      const text = this.packText(m)
      if (!text) continue
      agent[this.modeAgentId(m.id)] = {
        mode: 'primary',
        description: `Alfred ${m.name} mode`,
        prompt: `${m.soul}\n${m.system}`
      }
    }
    return agent
  }

  pruneModeAgents(agent, p) {
    const wanted = new Set(
      p.modes.filter((m) => this.packText(m)).map((m) => this.modeAgentId(m.id))
    )
    for (const key of Object.keys(agent)) {
      if (key.startsWith('alfred-') && !wanted.has(key)) delete agent[key]
    }
    return agent
  }

  async syncModeAgents() {
    const p = await this.prompts()
    // Global: the copy the server always resolves.
    const gPath = this.globalConfigPath()
    const global = await this.readConfigFile(gPath)
    global.agent = this.pruneModeAgents(
      global.agent && typeof global.agent === 'object' ? global.agent : {},
      p
    )
    Object.assign(global.agent, this.packModeAgents(p))
    await this.writeConfigFile(gPath, global)
    // Workspace: drop the pre-global leftovers (agents were briefly synced
    // per-project); the `alfred` prompt pack stays — it's the source of truth.
    const cfg = await this.readProjectConfig()
    if (
      cfg.agent &&
      typeof cfg.agent === 'object' &&
      Object.keys(cfg.agent).some((k) => k.startsWith('alfred-'))
    ) {
      this.pruneModeAgents(cfg.agent, { modes: [] })
      await this.writeProjectConfig(cfg)
    }
    this.agentCache = null // our agent set changed; re-probe the server next turn
    return p
  }

  async setPrompts({ soul, system } = {}) {
    const file = await this.readPromptsFile()
    const p = await this.prompts()
    const clean = (v) => (typeof v === 'string' ? v : '')
    if (p.modes.some((m) => m.id === p.activeMode && !m.builtin)) {
      file.customModes =
        file.customModes && typeof file.customModes === 'object' ? file.customModes : {}
      file.customModes[p.activeMode] = {
        ...file.customModes[p.activeMode],
        name: p.modes.find((m) => m.id === p.activeMode)?.name || p.activeMode,
        soul: clean(soul),
        system: clean(system)
      }
    } else {
      file.overrides = file.overrides && typeof file.overrides === 'object' ? file.overrides : {}
      file.overrides[p.activeMode] = { soul: clean(soul), system: clean(system) }
    }
    file.activeMode = p.activeMode
    await this.writePromptsFile(file)
    return this.syncModeAgents()
  }

  async setActiveMode(id) {
    const p = await this.prompts()
    if (!p.modes.some((m) => m.id === id)) throw new Error(`Unknown mode: ${id}`)
    const file = await this.readPromptsFile()
    file.activeMode = id
    await this.writePromptsFile(file)
    return this.syncModeAgents()
  }

  async saveCustomMode({ id, name, soul, system } = {}) {
    const clean = (v) => (typeof v === 'string' ? v : '')
    const label =
      String(name || '')
        .trim()
        .slice(0, 60) || 'Custom mode'
    let key = String(id || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
    if (!key) {
      key =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'custom'
    }
    if (DEFAULT_MODES.some((m) => m.id === key)) key = `${key}-custom`
    const file = await this.readPromptsFile()
    file.customModes =
      file.customModes && typeof file.customModes === 'object' ? file.customModes : {}
    file.customModes[key] = {
      name: label,
      soul: clean(soul),
      system: clean(system)
    }
    if (id && id !== key && file.customModes[id]) delete file.customModes[id] // renamed
    if (id && id !== key && file.activeMode === id) file.activeMode = key
    await this.writePromptsFile(file)
    return this.syncModeAgents()
  }

  async deleteCustomMode(id) {
    const file = await this.readPromptsFile()
    if (file.customModes && file.customModes[id]) delete file.customModes[id]
    if (file.activeMode === id) file.activeMode = 'opencode'
    await this.writePromptsFile(file)
    return this.syncModeAgents()
  }

  session(sessionID) {
    return this.api('GET', `/session/${sessionID}`)
  }

  deleteSession(sessionID) {
    return this.api('DELETE', `/session/${sessionID}`)
  }

  replyPermission(requestID, reply) {
    return this.api('POST', `/permission/${requestID}/reply`, { reply })
  }

  // Answer an agent question (requestID === the question tool's callID).
  // answers: string[][] — selected option labels, in question order.
  replyQuestion(requestID, answers) {
    return this.api('POST', `/question/${requestID}/reply`, { answers })
  }

  pumpEvents() {
    const loop = async () => {
      while (this.baseUrl) {
        try {
          this.sseAbort = new AbortController()
          // Global stream: the server ignores any directory param — every frame
          // carries its own `directory`, so all repos (and the TUI) stream here.
          const res = await fetch(`${this.baseUrl}/global/event`, {
            headers: { Authorization: this.auth, Accept: 'text/event-stream' },
            signal: this.sseAbort.signal
          })
          if (!res.ok || !res.body) throw new Error(`sse ${res.status}`)
          const dec = new TextDecoder()
          let buf = ''
          for await (const chunk of res.body) {
            buf += dec.decode(chunk, { stream: true })
            const frames = buf.split('\n\n')
            buf = frames.pop()
            for (const f of frames) {
              const line = f.split('\n').find((l) => l.startsWith('data:'))
              if (!line) continue
              try {
                const { payload } = JSON.parse(line.slice(5).trim())
                if (payload && payload.type) this.sendEvent(payload)
              } catch {
                /* partial frame */
              }
            }
          }
        } catch {
          /* drop + backoff reconnect */
        }
        this.sseAbort = null
        if (!this.baseUrl) break
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
    loop()
  }

  stop() {
    this.baseUrl = null
    try {
      this.sseAbort?.abort()
    } catch {
      /* noop */
    }
    // Attached servers are owned by someone else (dev script); never kill.
    if (this.attached) {
      this.attached = false
      return
    }
    if (this.spawnedViaShell && process.platform === 'win32' && this.child?.pid) {
      try {
        spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true
        })
      } catch {
        /* noop */
      }
    }
    try {
      this.child?.kill()
    } catch {
      /* noop */
    }
    this.child = null
  }
}
