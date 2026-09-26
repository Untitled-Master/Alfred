// Session titles belong to the opencode server: sessions are created
// untitled, the server's title agent names them (surfaced via
// `session.updated`), and manual renames PATCH through. Guards against
// reintroducing the old throwaway title-gen session.
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

describe('server-owned session naming', () => {
  it('creates sessions untitled (no client-side title)', () => {
    const m = harness.match(/createSession\([^)]*\) \{[^}]*\}/s)
    assert.ok(m, 'createSession missing')
    assert.ok(!m[0].includes('title'), 'createSession still sends a title')
  })

  it('has no throwaway title generator', () => {
    assert.ok(!harness.includes('title-gen'), 'throwaway title session is back')
    assert.ok(!harness.includes('Title this study conversation'), 'title prompt is back')
    for (const [name, src] of [
      ['main/index.js', index],
      ['preload', preload],
      ['App.jsx', app]
    ]) {
      assert.ok(!src.includes("'oc:title'"), `${name} still has the oc:title channel`)
    }
  })

  it('manual renames PATCH through to the server', () => {
    assert.ok(harness.includes('updateSessionTitle'), 'harness missing updateSessionTitle')
    assert.ok(harness.includes('PATCH'), 'title update is not a PATCH')
    assert.ok(index.includes('oc:session-title'), 'main missing oc:session-title handler')
    assert.ok(preload.includes('setSessionTitle'), 'preload missing setSessionTitle bridge')
    assert.ok(app.includes('setSessionTitle'), 'renderer never writes renames through')
  })

  it('renderer adopts server sessions from session.updated', () => {
    assert.ok(app.includes('session.updated'), 'renderer ignores session.updated')
    assert.ok(app.includes('session.created'), 'renderer ignores session.created')
    assert.ok(!app.includes('New study session'), 'client-side placeholder titles are back')
    assert.ok(!app.includes("'Study session'"), 'client-side default title is back')
  })
})
