import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { OpencodeManager } from './opencode.js'

let mainWindow = null
const oc = new OpencodeManager((payload) => {
  mainWindow?.webContents.send('oc:event', payload)
})

function createWindow() {
  // Zeron glass: transparent + blur material, larger student workspace.
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' } : {}),
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Custom navbar window controls
  ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window-maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  // OpenCode harness
  const needOc = () => {
    if (!oc.baseUrl) throw new Error('opencode server is not running')
  }
  ipcMain.handle('oc:status', () => oc.status())
  ipcMain.handle('oc:models', async () => {
    needOc()
    return oc.models()
  })
  ipcMain.handle('oc:session-create', async (_e, title) => {
    needOc()
    return oc.createSession(title)
  })
  ipcMain.handle('oc:prompt', async (_e, sessionID, model, text, attachments, variant, textOnly) => {
    needOc()
    return oc.prompt(sessionID, { providerID: model.providerID, modelID: model.modelID, text, attachments: attachments || [], variant: variant || '', textOnly: !!textOnly })
  })
  ipcMain.handle('oc:commands', async () => {
    needOc()
    return oc.commands()
  })
  ipcMain.handle('oc:command', async (_e, sessionID, payload) => {
    needOc()
    return oc.command(sessionID, payload)
  })
  ipcMain.handle('oc:abort', async (_e, sessionID) => {
    needOc()
    return oc.abort(sessionID)
  })
  ipcMain.handle('oc:messages', async (_e, sessionID) => {
    needOc()
    return oc.messages(sessionID)
  })
  ipcMain.handle('oc:session-get', async (_e, sessionID) => {
    needOc()
    return oc.session(sessionID)
  })
  ipcMain.handle('oc:session-delete', async (_e, sessionID) => {
    needOc()
    return oc.deleteSession(sessionID)
  })
  ipcMain.handle('oc:title', async (_e, conversation, model) => {
    needOc()
    return oc.title(conversation, { providerID: model.providerID, modelID: model.modelID })
  })
  ipcMain.handle('oc:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0] || null
  })
  ipcMain.handle('oc:set-workspace', async (_e, dir) => {
    needOc()
    return oc.setWorkspace(dir)
  })
  ipcMain.handle('oc:find-files', async (_e, query) => {
    needOc()
    return oc.findFiles(query)
  })
  ipcMain.handle('oc:list-files', async (_e, dir) => {
    needOc()
    return oc.listFiles(dir)
  })
  ipcMain.handle('oc:read-workspace-file', async (_e, relPath) => {
    needOc()
    return oc.readWorkspaceFile(relPath)
  })
  ipcMain.handle('oc:memory', async () => {
    needOc()
    return oc.memory()
  })
  ipcMain.handle('oc:get-prompts', async () => {
    needOc()
    return oc.prompts()
  })
  ipcMain.handle('oc:set-prompts', async (_e, soul, system) => {
    needOc()
    return oc.setPrompts({ soul, system })
  })
  ipcMain.handle('oc:set-mode', async (_e, id) => {
    needOc()
    return oc.setActiveMode(id)
  })
  ipcMain.handle('oc:save-custom-mode', async (_e, payload) => {
    needOc()
    return oc.saveCustomMode(payload || {})
  })
  ipcMain.handle('oc:delete-custom-mode', async (_e, id) => {
    needOc()
    return oc.deleteCustomMode(id)
  })
  ipcMain.handle('oc:permission-reply', async (_e, requestID, reply) => {
    needOc()
    return oc.replyPermission(requestID, reply)
  })
  ipcMain.handle('oc:question-reply', async (_e, requestID, answers) => {
    needOc()
    return oc.replyQuestion(requestID, answers)
  })

  createWindow()

  // Boot the tutor backend in the background; the UI works offline until ready.
  oc.start().catch((e) => console.error('opencode harness failed to start:', e.message))

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => oc.stop())

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
