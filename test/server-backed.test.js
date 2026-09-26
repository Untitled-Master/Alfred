// Sessions, threads, transcripts, modes, and MCP state all live in opencode
// infra now: the server store (shared across repos + TUI), workspace
// opencode.json keys, and opencode's global data dir. No .albert layer,
// no local session/message cache, no local id mapping.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const harness = read('src/main/opencode.js')
const index = read('src/main/index.js')
const preload = read('src/preload/index.js')
const app = read('src/renderer/src/App.jsx')
const memSrv = read('mcp/student-memory/server.mjs')
const courseSrv = read('mcp/course-search/server.mjs')

describe('harness reads cross-repo state from the server', () => {
  it('lists sessions globally (no directory scoping)', () => {
    assert.ok(harness.includes('listSessions'), 'missing listSessions')
    assert.ok(harness.includes('`/session${qs'), 'no session list call')
    assert.ok(harness.includes('{ global: true }'), 'some call is not global; session list must be')
  })

  it('exposes projects, agents, messages, fork, children, todos', () => {
    for (const fn of [
      'listProjects',
      'listAgents',
      'getMessages',
      'forkSession',
      'getChildren',
      'getSessionTodos'
    ]) {
      assert.ok(harness.includes(fn), `harness missing ${fn}`)
    }
    assert.ok(harness.includes('/project'), 'no /project call')
    assert.ok(harness.includes('/agent'), 'no /agent call')
    assert.ok(harness.includes('/fork'), 'no fork call')
    assert.ok(harness.includes('/children'), 'no children call')
    assert.ok(harness.includes('/todo'), 'no todo call')
  })

  it('passes the native mode agent on create and prompt', () => {
    assert.ok(/createSession\(\{[^}]*agent/.test(harness), 'createSession takes no agent')
    assert.ok(
      /prompt\([\s\S]*?\{[\s\S]*?agent[\s\S]*?textOnly/.test(harness),
      'prompt takes no agent'
    )
  })

  it('keeps Alfred state out of workspaces (no .albert layer)', () => {
    assert.ok(!harness.includes('dataDir()'), 'dataDir (.albert) still referenced')
    assert.ok(harness.includes('stateDir()'), 'no stateDir replacement')
    assert.ok(harness.includes('opencodeDataDir'), 'no opencode data-dir resolution')
    // One-time legacy import is the only remaining .albert touch, and it
    // deletes the file after importing.
    const touches = harness.match(/\.albert/g) || []
    assert.ok(touches.length > 0, 'legacy import missing?')
    assert.ok(
      harness.includes("unlink(path.join(this.workspace, '.albert', 'prompts.json'))"),
      'legacy file not removed after import'
    )
  })

  it('syncs modes as native alfred-* agents without touching user agents', () => {
    assert.ok(harness.includes('syncModeAgents'), 'missing syncModeAgents')
    assert.ok(harness.includes("startsWith('alfred-')"), 'agent prefix guard missing')
    assert.ok(harness.includes("mode: 'primary'"), 'agents are not primary')
  })

  it('publishes agents globally (project worktrees go stale on folder moves)', () => {
    assert.ok(harness.includes('globalConfigPath'), 'no global config resolution')
    assert.ok(harness.includes('global.agent'), 'agents are not written globally')
    assert.ok(harness.includes('OPENCODE_TEST_HOME'), 'global path not test-isolated')
  })

  it('falls back to the inline pack when the server lacks the agent', () => {
    assert.ok(harness.includes('hasAgent'), 'no agent probe')
    assert.ok(harness.includes('agentCache'), 'probe result not cached')
  })
})

describe('ipc + preload expose the server store', () => {
  for (const ch of [
    'oc:sessions',
    'oc:projects',
    'oc:agents',
    'oc:fork',
    'oc:children',
    'oc:todos'
  ]) {
    it(`main handles ${ch}`, () => {
      assert.ok(index.includes(`'${ch}'`), `main missing ${ch}`)
    })
  }

  it('preload bridges the new channels', () => {
    for (const fn of ['sessions', 'projects', 'agents', 'fork', 'children', 'todos']) {
      assert.ok(preload.includes(fn), `preload missing ${fn}`)
    }
    assert.ok(preload.includes('oc:messages'), 'preload messages bridge missing')
  })
})

describe('renderer keeps no local session layer', () => {
  it('has no local id mapping or session/message cache', () => {
    assert.ok(!app.includes('ocByLocal'), 'ocByLocal mapping is back')
    assert.ok(!app.includes("setItem('albert.sessions')"), 'albert.sessions writes are back')
    assert.ok(!app.includes("setItem('albert.msgs')"), 'albert.msgs writes are back')
    assert.ok(!app.includes('session.ws') && !app.includes('s.ws'), 'workspace stamping is back')
  })

  it('loads sessions from the server and tracks server events', () => {
    assert.ok(app.includes('refreshSessions'), 'no refreshSessions')
    assert.ok(app.includes('opencode.sessions('), 'never lists server sessions')
    assert.ok(app.includes('session.deleted'), 'remote deletes not handled')
  })

  it('rebuilds transcripts from server messages', () => {
    assert.ok(app.includes('serverToUi'), 'no server message adapter')
    assert.ok(app.includes('.messages('), 'never fetches server messages')
    assert.ok(app.includes('hydrated'), 'no hydration guard')
  })

  it('forks threads natively and sends the mode agent', () => {
    assert.ok(app.includes('forkThread'), 'no native fork')
    assert.ok(!app.includes('addToThread'), 'stub addToThread is back')
    assert.ok(app.includes("'alfred-' + modeCfg.activeMode"), 'turns carry no mode agent')
    assert.ok(app.includes("!== 'opencode'"), 'plain mode still sends an agent')
  })
})

describe('loading skeletons, opencode model names, real context meter', () => {
  const css = read('src/renderer/src/theme/glass.css')

  it('shows skeletons while sessions/transcript load', () => {
    assert.ok(app.includes('sessionsLoading'), 'no sidebar loading state')
    assert.ok(app.includes('transcriptLoading'), 'no transcript loading state')
    assert.ok(app.includes('skel-row') && app.includes('skel-msg'), 'no skeleton markup')
    assert.ok(css.includes('@keyframes skel-shimmer'), 'no skeleton shimmer css')
  })

  it('uses opencode model names with no local renaming', () => {
    assert.ok(!app.includes('FAST_MODELS'), 'custom Fast annotation is back')
    assert.ok(app.includes('label: m.name,'), 'model label is not the catalog name')
    const hook = read('src/renderer/src/opencode/useOpencode.js')
    assert.ok(!hook.includes('FAST_MODELS'), 'FAST_MODELS still exported')
  })

  it('derives context % from real per-message tokens, never message counts', () => {
    assert.ok(app.includes('ctxInput'), 'no message-token context source')
    assert.ok(app.includes('fmtTok'), 'no compact token formatter')
    assert.ok(!app.includes('1 + messages.length'), 'fake message-count fallback is back')
    assert.ok(app.includes('info.tokens'), 'adapter drops message tokens')
  })
})

describe('prompt rail tracks the transcript', () => {
  const css = read('src/renderer/src/theme/glass.css')

  it('scroll-spies messages and auto-scrolls the rail', () => {
    assert.ok(app.includes('IntersectionObserver'), 'no scroll-spy observer')
    assert.ok(app.includes('prompt-rail-track'), 'rail track missing')
    assert.ok(app.includes('data-tick='), 'ticks carry no message id')
    assert.ok(app.includes('scrollRoot'), 'rail is not scoped to the transcript')
  })

  it('styles active ticks, spine, and unclipped tooltip', () => {
    assert.ok(css.includes('.tick.active'), 'no active tick style')
    assert.ok(css.includes('.prompt-rail-inner::before'), 'no rail spine')
    assert.ok(css.includes('.tick-tip'), 'no rail-level tooltip')
  })
})

describe('write preview + diff view', () => {
  const chips = read('src/renderer/src/components/ToolChips.jsx')
  const codeblock = read('src/renderer/src/components/CodeBlock.jsx')

  it('threads raw tool args to the write/edit preview', () => {
    assert.ok(app.includes('rawInput: st.input'), 'summarizeParts drops raw tool input')
    assert.ok(app.includes('rawInput={b.rawInput}'), 'render never forwards rawInput')
    assert.ok(chips.includes('rawInput'), 'ToolChips takes no rawInput')
  })

  it('extracts filename + content (write) and old/new strings (edit)', () => {
    assert.ok(chips.includes('filePath'), 'no filePath extraction')
    assert.ok(chips.includes('args.content'), 'no write content extraction')
    assert.ok(
      chips.includes('oldString') && chips.includes('newString'),
      'no edit string extraction'
    )
  })

  it('builds line diffs with word-level change pieces', () => {
    assert.ok(chips.includes('function buildDiff'), 'no buildDiff')
    assert.ok(
      chips.includes("change: 'del'") || chips.includes('change:"del"') || chips.includes("'del'"),
      'no word-level del pieces'
    )
    assert.ok(
      chips.includes("change: 'add'") || chips.includes("'add'"),
      'no word-level add pieces'
    )
    assert.ok(chips.includes("variant={fv.diff ? 'Diff' : 'Code'}"), 'diff view never selected')
  })

  it('code view follows the requested variant as streaming completes', () => {
    assert.ok(codeblock.includes('setView(variant)'), 'CodeBlock ignores variant updates')
  })
})

describe('no study/quiz tabs, split screen panes', () => {
  const navbar = read('src/renderer/src/components/Navbar.jsx')
  const css = read('src/renderer/src/theme/glass.css')

  it('has no study/quiz tab bar', () => {
    assert.ok(!navbar.includes('nav-tabs'), 'tab bar is back')
    assert.ok(!navbar.includes("'quiz'") && !navbar.includes('"quiz"'), 'quiz tab is back')
    assert.ok(!app.includes("view === 'quiz'"), 'quiz view branch is back')
  })

  it('opens a second session beside the primary one', () => {
    assert.ok(app.includes('splitId'), 'no split session state')
    assert.ok(app.includes('openSplit'), 'no split-screen opener')
    assert.ok(app.includes('Split screen'), 'no split menu item')
    assert.ok(app.includes('ThreadPane'), 'no thread pane component')
    assert.ok(app.includes('useComposer'), 'no per-pane composer')
    assert.ok(app.includes('swapSplit'), 'split panes cannot swap')
  })

  it('each pane owns its transcript, composer, and context readout', () => {
    assert.ok(css.includes('.threads') && css.includes('.thread-head'), 'no split layout css')
    assert.ok(css.includes('.split-dot'), 'no split marker css')
    assert.ok(
      app.includes('transcriptLoading={loadingFor(sid)}') || app.includes('loadingFor(sid)'),
      'no per-pane loading'
    )
  })
})

describe('composer state lives in useComposer, not App', () => {
  // Regression: App-level menu derivations were deleted when the composer
  // moved per-pane; a leftover reference crashed render (modelMatch).
  it('has no orphaned App-level composer derivations', () => {
    const body = app.slice(app.indexOf('export default function App'))
    for (const snippet of [
      'const modelFiltered = modelMatch',
      'const cmdOpen = !!cmdMatch',
      'const tagCmd = tagParse'
    ]) {
      assert.ok(!body.includes(snippet), `orphaned derivation is back: ${snippet}`)
    }
    assert.ok(!body.includes('const send = async'), 'App-level send is back')
    assert.ok(app.includes('function useComposer'), 'useComposer missing')
    assert.ok(body.includes('sendTurn'), 'shared turn core missing')
  })
})

describe('plain opencode mode is the default', () => {
  it('defines an empty-prompt opencode mode first', () => {
    assert.ok(harness.includes("id: 'opencode'"), 'no plain opencode mode')
    assert.ok(harness.includes("soul: '', system: ''"), 'plain mode carries prompts')
    const head = harness.slice(
      harness.indexOf('DEFAULT_MODES'),
      harness.indexOf('DEFAULT_MODES') + 600
    )
    assert.ok(
      head.indexOf("'opencode'") !== -1 && head.indexOf("'opencode'") < head.indexOf("'study'"),
      'opencode mode is not first'
    )
  })

  it('defaults fresh workspaces to the plain mode', () => {
    assert.ok(harness.includes("activeMode: 'opencode'"), 'fresh default is not opencode')
    assert.ok(!harness.includes("activeMode: 'study'"), 'study default lingers')
  })

  it('renderer falls back to the plain mode', () => {
    assert.ok(
      app.includes("activeMode || 'opencode'") || app.includes("activeMode: 'opencode'"),
      'renderer default is not opencode'
    )
  })
})

describe('write rows preview without expanding', () => {
  const chips = read('src/renderer/src/components/ToolChips.jsx')
  const css = read('src/renderer/src/theme/glass.css')

  it('renders code below the row, details keep the rest', () => {
    assert.ok(chips.includes('tchip-code'), 'no always-visible code slot')
    assert.ok(chips.includes('tool-dots'), 'no running dots')
    assert.ok(!chips.includes('tool-live'), 'old running label is back')
    assert.ok(chips.includes('tchip-ico ${action}'), 'icon takes no action color')
  })

  it('styles dots, icon colors, and the code slot', () => {
    assert.ok(css.includes('@keyframes tool-dot'), 'no dot animation')
    assert.ok(css.includes('.tchip-ico.write'), 'no icon action colors')
    assert.ok(css.includes('.tchip-code'), 'no code slot spacing')
    assert.ok(!css.includes('.tool-live'), 'dead running-label css lingers')
  })
})

describe('git panel, shortcuts, centered session, full-height sidebar', () => {
  const css = read('src/renderer/src/theme/glass.css')
  const navbar = read('src/renderer/src/components/Navbar.jsx')
  const gitpanel = read('src/renderer/src/components/GitPanel.jsx')

  it('harness exposes repo-jailed git status and diffs', () => {
    assert.ok(harness.includes('gitInfo('), 'no gitInfo')
    assert.ok(harness.includes('gitDiff('), 'no gitDiff')
    assert.ok(harness.includes('gitContributors('), 'no gitContributors')
    assert.ok(harness.includes('gitCheckout('), 'no gitCheckout')
    assert.ok(harness.includes('rev-parse'), 'status not repo-rooted')
    assert.ok(index.includes("'oc:git-info'"), 'no oc:git-info channel')
    assert.ok(index.includes("'oc:git-diff'"), 'no oc:git-diff channel')
    assert.ok(index.includes("'oc:git-contributors'"), 'no oc:git-contributors channel')
    assert.ok(index.includes("'oc:git-checkout'"), 'no oc:git-checkout channel')
    assert.ok(
      preload.includes('gitInfo') &&
        preload.includes('gitDiff') &&
        preload.includes('gitContributors'),
      'no preload git bridge'
    )
    assert.ok(preload.includes('gitCheckout'), 'no preload checkout bridge')
  })

  it('git panel parses unified diffs with real line numbers', () => {
    assert.ok(gitpanel.includes('parseUnified'), 'no unified diff parser')
    assert.ok(gitpanel.includes('@@ -'), 'no hunk header parsing')
    assert.ok(gitpanel.includes('hideToggle'), 'diff view not locked')
    for (const s of ['Staged', 'Changes', 'Untracked', 'Recent commits']) {
      assert.ok(gitpanel.includes(s), `missing section: ${s}`)
    }
  })

  it('ctrl/cmd+B toggles the sidebar', () => {
    assert.ok(app.includes("key === 'b'"), 'no ctrl+B handler')
    assert.ok(app.includes('toggleSide()'), 'handler never toggles')
  })

  it('session chip is centered and the sidebar spans full height', () => {
    assert.ok(navbar.includes('nav-center'), 'session chip not centered')
    assert.ok(!navbar.includes('nav-tabs'), 'tab bar still rendered')
    assert.ok(app.includes('main-col'), 'navbar not scoped to the main column')
    assert.ok(css.includes('.main-col') && css.includes('.nav-center'), 'layout css missing')
    assert.ok(css.includes('-webkit-app-region: drag'), 'sidebar drag strip missing')
  })

  it('right git panel is wired with persisted toggle', () => {
    assert.ok(app.includes('gitOpen'), 'no git panel state')
    assert.ok(app.includes('albert.gitside'), 'toggle not persisted')
    assert.ok(app.includes('<GitPanel'), 'panel never rendered')
    assert.ok(navbar.includes('onToggleGit'), 'navbar has no git toggle')
    assert.ok(css.includes('.gitbar'), 'no git panel css')
  })
})

describe('mcp servers persist outside workspaces', () => {
  it('student-memory defaults to opencode data dir', () => {
    assert.ok(!memSrv.includes('.albert'), 'student-memory still touches .albert')
    assert.ok(memSrv.includes('opencodeDataDir'), 'no opencode data-dir default')
  })

  it('course-search defaults to opencode data dir with per-workspace index', () => {
    assert.ok(
      !courseSrv.includes("path.join(COURSE_DIR, '.albert')"),
      'course-search data dir still in workspace'
    )
    assert.ok(courseSrv.includes('course-index-'), 'index is no longer per-workspace keyed')
    assert.ok(courseSrv.includes('courseDir'), 'index carries no workspace marker')
  })
})
