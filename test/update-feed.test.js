// PR smoke tests — pure node, no dependencies.
// Guard the update-feed wiring and the CI split (build on merge,
// checks-only on PRs) so a bad edit fails fast before packaging.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const pkg = JSON.parse(read('package.json'))

describe('release versioning', () => {
  it('package.json version is valid semver', () => {
    assert.match(pkg.version, /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/)
  })

  it('repository points at the update-feed repo', () => {
    const url = pkg.repository?.url || ''
    assert.ok(url.includes('Untitled-Master/Alfred'), `repository url: ${url}`)
  })

  it('electron-updater is a runtime dependency', () => {
    assert.ok(pkg.dependencies?.['electron-updater'], 'missing electron-updater')
  })
})

describe('update-feed packaging config', () => {
  const yml = read('electron-builder.yml')

  it('publishes via the github provider', () => {
    assert.match(yml, /provider:\s*github/)
  })

  it('publish owner/repo match the repository', () => {
    assert.match(yml, /owner:\s*Untitled-Master/)
    assert.match(yml, /repo:\s*Alfred/)
  })

  it('packaging scripts never publish (only the CI feed step does)', () => {
    for (const name of ['build:unpack', 'build:win', 'build:mac', 'build:linux']) {
      const script = pkg.scripts?.[name] || ''
      assert.ok(script.includes('--publish never'), `${name} must pass --publish never`)
    }
  })
})

describe('main-process updater wiring', () => {
  const updater = read('src/main/updater.js')
  const index = read('src/main/index.js')
  const preload = read('src/preload/index.js')

  it('checks the feed and installs on restart', () => {
    assert.ok(updater.includes('checkForUpdates'), 'no checkForUpdates')
    assert.ok(updater.includes('quitAndInstall'), 'no quitAndInstall')
  })

  it('stays silent in dev builds', () => {
    assert.ok(updater.includes('app.isPackaged'), 'no isPackaged guard')
  })

  it('main registers upd:* handlers and pumps upd:event', () => {
    for (const ch of ['upd:state', 'upd:check', 'upd:install', 'upd:event']) {
      assert.ok(index.includes(ch), `main missing ${ch}`)
    }
  })

  it('preload exposes the updates bridge', () => {
    assert.ok(preload.includes('upd:state'), 'bridge missing upd:state')
    assert.ok(preload.includes('upd:check'), 'bridge missing upd:check')
    assert.ok(preload.includes('upd:install'), 'bridge missing upd:install')
  })
})

describe('renderer update UI', () => {
  it('updater hook exists', () => {
    assert.ok(fs.existsSync(path.join(root, 'src/renderer/src/updates/useUpdater.js')))
  })

  it('Settings has an Updates tab', () => {
    assert.ok(read('src/renderer/src/components/Settings.jsx').includes("value: 'updates'"))
  })

  it('sidebar renders the update banner', () => {
    assert.ok(read('src/renderer/src/App.jsx').includes('upd-banner'))
  })
})

describe('CI split (build on merge, checks on PR)', () => {
  const build = read('.github/workflows/build.yml')
  const prPath = path.join(root, '.github/workflows/pr.yml')
  assert.ok(fs.existsSync(prPath), 'pr.yml missing')
  const pr = read('.github/workflows/pr.yml')

  it('build.yml never triggers on pull_request', () => {
    assert.ok(!build.includes('pull_request'), 'build.yml still builds on PR')
  })

  it('pr.yml triggers on pull_request', () => {
    assert.ok(pr.includes('pull_request'), 'pr.yml missing PR trigger')
  })

  it('pr.yml runs tests and packages nothing', () => {
    assert.ok(pr.includes('npm test'), 'pr.yml does not run tests')
    const steps = pr.split('\n').filter((l) => l.trim().startsWith('run:'))
    for (const s of steps) {
      assert.ok(!/electron-builder|build:win|upload-artifact|gh-release/.test(s), `pr.yml packages: ${s.trim()}`)
    }
  })
})
