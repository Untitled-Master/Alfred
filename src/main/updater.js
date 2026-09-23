import { app } from 'electron'

// In-app updates driven by GitHub Releases (electron-updater, GitHub
// provider — repo/owner are baked into app-update.yml at package time).
// Dev builds report supported:false; the renderer hides update UI there.
export const RELEASES_URL = 'https://github.com/Untitled-Master/Alfred/releases'
const STARTUP_DELAY = 20 * 1000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

const fmtNotes = (notes) => {
  if (!notes) return ''
  const parts = Array.isArray(notes) ? notes : [notes]
  return parts
    .map((n) => (typeof n === 'string' ? n : n?.note || ''))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000)
}

export class AppUpdater {
  constructor(send) {
    this.send = send // (payload) => webContents.send('upd:event', payload)
    this.supported = app.isPackaged
    this.status = 'idle' // idle|checking|available|downloading|downloaded|uptodate|error
    this.latest = null
    this.notes = ''
    this.progress = 0
    this.error = ''
    this.checking = false
    this.updater = null
    this.timer = null
  }

  state() {
    return {
      supported: this.supported,
      current: app.getVersion(),
      status: this.status,
      latest: this.latest,
      notes: this.notes,
      progress: this.progress,
      error: this.error,
      releasesUrl: RELEASES_URL
    }
  }

  emit() {
    try {
      this.send({ type: 'upd', snapshot: this.state() })
    } catch { /* window gone */ }
  }

  async init() {
    if (!this.supported) return
    try {
      const { autoUpdater } = await import('electron-updater')
      this.updater = autoUpdater
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.allowPrerelease = false
      autoUpdater.on('checking-for-update', () => {
        this.status = 'checking'
        this.error = ''
        this.emit()
      })
      autoUpdater.on('update-available', (info) => {
        this.status = 'available'
        this.latest = info?.version || null
        this.notes = fmtNotes(info?.releaseNotes)
        this.progress = 0
        this.emit()
      })
      autoUpdater.on('update-not-available', () => {
        this.status = 'uptodate'
        this.emit()
      })
      autoUpdater.on('download-progress', (p) => {
        const pct = Math.round(p?.percent || 0)
        if (pct === this.progress && this.status === 'downloading') return
        this.status = 'downloading'
        this.progress = pct
        this.emit()
      })
      autoUpdater.on('update-downloaded', (info) => {
        this.status = 'downloaded'
        this.latest = info?.version || this.latest
        this.notes = fmtNotes(info?.releaseNotes) || this.notes
        this.progress = 100
        this.emit()
      })
      autoUpdater.on('error', (e) => {
        this.status = 'error'
        this.error = (e?.message || String(e)).slice(0, 200)
        this.checking = false
        this.emit()
      })
      // First check shortly after launch, then on an interval.
      setTimeout(() => this.check().catch(() => {}), STARTUP_DELAY)
      this.timer = setInterval(() => this.check().catch(() => {}), CHECK_INTERVAL)
      this.timer.unref?.()
    } catch (e) {
      this.supported = false
      this.error = (e?.message || String(e)).slice(0, 200)
    }
  }

  async check() {
    if (!this.supported || !this.updater) return this.state()
    if (this.checking || this.status === 'downloading' || this.status === 'downloaded') {
      return this.state()
    }
    this.checking = true
    try {
      await this.updater.checkForUpdates()
    } catch (e) {
      this.status = 'error'
      this.error = (e?.message || String(e)).slice(0, 200)
      this.emit()
    } finally {
      this.checking = false
    }
    return this.state()
  }

  install() {
    if (!this.supported || !this.updater) return this.state()
    if (this.status !== 'downloaded') return this.state()
    this.updater.quitAndInstall(false, true)
    return this.state()
  }
}
